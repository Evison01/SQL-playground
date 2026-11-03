import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { quote } from "./database.js";
import "./style.css";
import {
  openStorage,
  listWorkspaces,
  saveWorkspace,
  deleteWorkspace,
  newWorkspace,
  recordHistory,
} from "./storage.js";
import { datasets, datasetFor } from "./datasets.js";
import {
  serializeWorkspace,
  parseWorkspace,
  csvResult,
  download,
} from "./backup.js";
const initialExamples = datasets.instagram.examples;
function App() {
  const [sql, setSql] = useState(initialExamples["First query"]);
  const [tables, setTables] = useState([]);
  const [response, setResponse] = useState(null);
  const [busy, setBusy] = useState(true);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState("First query");
  const worker = useRef(null),
    timer = useRef(null),
    editor = useRef(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [active, setActive] = useState(null);
  const [storageError, setStorageError] = useState("");
  const [savedName, setSavedName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [panel, setPanel] = useState("saved");
  const [dataset, setDataset] = useState("instagram");
  const [locked, setLocked] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Opening…");
  const examples = datasetFor(active).examples;
  const draft = useRef(sql);
  draft.current = sql;
  const importFile = useRef(null);
  const releaseLock = useRef(null);
  const storage = useRef(null),
    current = useRef(null),
    draftTimer = useRef(null);
  const pending = useRef(null);
  const pendingWrites = useRef(0),
    failedWrite = useRef(false);
  function display(value) {
    current.current = value;
    setActive(value);
    setWorkspaces((items) =>
      [...items.filter((item) => item.id !== value.id), value].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
  }
  async function persist(value) {
    if (!storage.current)
      throw new Error("Browser storage is unavailable. Reload to retry.");
    pendingWrites.current++;
    try {
      await saveWorkspace(storage.current, value);
      failedWrite.current = false;
      setStorageError("");
      setSaveStatus("Saved on this device");
    } catch (error) {
      failedWrite.current = true;
      setSaveStatus("Not saved");
      throw error;
    } finally {
      pendingWrites.current--;
    }
  }
  async function update(value) {
    display(value);
    setSaveStatus("Saving…");
    try {
      await persist(value);
    } catch (error) {
      setSaveStatus("Not saved");
      setStorageError("Changes could not be saved: " + error.message);
    }
  }
  function boot(value) {
    clearTimeout(timer.current);
    worker.current?.terminate();
    setBusy(true);
    setReady(false);
    setResponse(null);
    setTables([]);
    const instance = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    worker.current = instance;
    instance.onmessage = async ({ data }) => {
      clearTimeout(timer.current);
      if (worker.current !== instance) return;
      setTables(data.schema || []);
      setResponse(data);
      let next = {
        ...current.current,
        bytes: data.bytes || current.current.bytes,
        updatedAt: Date.now(),
      };
      if (pending.current) next = recordHistory(next, pending.current, data);
      pending.current = null;
      await update(next);
      if (worker.current !== instance) return;
      setBusy(false);
      setReady(!!data.bytes);
    };
    const fail = async (message) => {
      instance.terminate();
      clearTimeout(timer.current);
      setReady(false);
      setResponse({ error: message });
      if (pending.current)
        await update(
          recordHistory(current.current, pending.current, { error: message }),
        );
      pending.current = null;
      setBusy(false);
    };
    instance.onerror = () =>
      fail(
        "The database worker failed. Reopen this workspace to restore its last saved state.",
      );
    timer.current = setTimeout(
      () =>
        fail(
          "Database initialization timed out. Reopen the workspace to retry.",
        ),
      15000,
    );
    instance.postMessage({
      type: "init",
      bytes: value.bytes,
      dataset: value.dataset,
    });
  }
  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const db = await openStorage();
        if (cancelled) {
          db.close();
          return;
        }
        storage.current = db;
        let items = await listWorkspaces(db);
        if (!items.length) {
          const value = newWorkspace(
            "Instagram",
            initialExamples["First query"],
          );
          await saveWorkspace(db, value);
          items = [value];
        }
        if (cancelled) return;
        setWorkspaces(items);
        display(items[0]);
        setSql(items[0].sql);
        setSelected("");
        boot(items[0]);
      } catch (error) {
        setStorageError("Could not open browser storage: " + error.message);
        setBusy(false);
      }
    };
    // A single writer prevents other tabs from overwriting database snapshots.
    if (navigator.locks) {
      navigator.locks
        .request(
          "sql-playground-writer",
          { ifAvailable: true },
          async (lock) => {
            if (cancelled) return;
            if (!lock) {
              setLocked(true);
              setBusy(false);
              return;
            }
            const held = new Promise((resolve) => {
              releaseLock.current = resolve;
            });
            await initialize();
            await held;
          },
        )
        .catch((error) => {
          setStorageError(error.message);
          setBusy(false);
        });
    } else {
      setLocked(true);
      setStorageError(
        "This browser does not support safe workspace locking. Use a current browser.",
      );
      setBusy(false);
    }
    const preventLoss = (event) => {
      if (
        current.current &&
        (draft.current !== current.current.sql ||
          pending.current ||
          pendingWrites.current ||
          failedWrite.current)
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => {
      cancelled = true;
      releaseLock.current?.();
      window.removeEventListener("beforeunload", preventLoss);
      worker.current?.terminate();
      clearTimeout(timer.current);
      clearTimeout(draftTimer.current);
      storage.current?.close();
    };
  }, []);
  useEffect(() => {
    if (!active || sql === current.current.sql) return;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(
      () => update({ ...current.current, sql, updatedAt: Date.now() }),
      300,
    );
    return () => clearTimeout(draftTimer.current);
  }, [sql, active?.id]);
  async function flushDraft() {
    clearTimeout(draftTimer.current);
    const value = { ...current.current, sql: draft.current };
    display(value);
    await persist(value);
    return value;
  }
  async function switchWorkspace(id) {
    if (busy) return;
    setBusy(true);
    try {
      const previous = await flushDraft();
      const value =
        id === previous.id
          ? previous
          : workspaces.find((item) => item.id === id);
      if (!value) {
        setBusy(false);
        return;
      }
      display(value);
      setSql(value.sql);
      setSelected("");
      setSavedName("");
      boot(value);
    } catch (error) {
      setStorageError("Could not save before switching: " + error.message);
      setBusy(false);
    }
  }
  async function createWorkspace() {
    if (busy || !workspaceName.trim()) return;
    setBusy(true);
    const value = {
      ...newWorkspace(
        workspaceName.trim().slice(0, 80),
        datasets[dataset].examples["First query"],
      ),
      dataset,
    };
    try {
      await flushDraft();
      await persist(value);
      setWorkspaceName("");
      display(value);
      setSql(value.sql);
      setSelected("");
      setSavedName("");
      boot(value);
    } catch (error) {
      setStorageError("Could not create workspace: " + error.message);
      setBusy(false);
    }
  }
  async function importWorkspace(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Backup exceeds the 20 MB limit.");
      const value = parseWorkspace(await file.text());
      await flushDraft();
      await persist(value);
      display(value);
      setSql(value.sql);
      setSelected("");
      setSavedName("");
      boot(value);
    } catch (error) {
      setStorageError("Could not import backup: " + error.message);
      setBusy(false);
    }
  }
  async function removeWorkspace() {
    if (
      workspaces.length < 2 ||
      !window.confirm(
        "Delete this workspace, its database, saved queries and history? This cannot be undone.",
      )
    )
      return;
    try {
      setBusy(true);
      clearTimeout(draftTimer.current);
      await deleteWorkspace(storage.current, current.current.id);
      const remaining = workspaces.filter(
        (item) => item.id !== current.current.id,
      );
      setWorkspaces(remaining);
      display(remaining[0]);
      setSql(remaining[0].sql);
      boot(remaining[0]);
    } catch (error) {
      setStorageError("Could not delete workspace: " + error.message);
      setBusy(false);
    }
  }
  function run() {
    if (busy || !ready || !sql.trim()) return;
    clearTimeout(draftTimer.current);
    display({ ...current.current, sql });
    pending.current = sql;
    setBusy(true);
    setResponse(null);
    worker.current.postMessage({ type: "run", sql });
    timer.current = setTimeout(async () => {
      worker.current.terminate();
      setReady(false);
      const error =
        "Query exceeded 5 seconds. Reopen the workspace to restore its last saved database.";
      setResponse({ error });
      await update(
        recordHistory(current.current, sql, { error, elapsed: 5000 }),
      );
      pending.current = null;
      setBusy(false);
    }, 5000);
  }
  function saveQuery(event) {
    event.preventDefault();
    if (!savedName.trim() || !sql.trim()) return;
    const name = savedName.trim();
    const existing = current.current.saved.find((query) => query.name === name);
    if (
      existing &&
      !window.confirm("Replace the saved query named " + name + "?")
    )
      return;
    update({
      ...current.current,
      sql,
      saved: [
        ...current.current.saved.filter((query) => query.name !== name),
        { id: existing?.id || crypto.randomUUID(), name, sql },
      ],
    });
    setSavedName("");
  }
  if (locked)
    return (
      <main className="locked">
        <h1>One workspace, one active tab.</h1>
        <p>
          SQL Playground is already open in another tab. Close it, then reopen
          here to keep your saved data safe.
        </p>
        {storageError && <p role="alert">{storageError}</p>}
        <button onClick={() => location.reload()}>Reopen here</button>
      </main>
    );
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to editor
      </a>
      <header>
        <a className="brand" href="./">
          <span className="logo">▤</span> SQL Playground{" "}
          <span className="badge">SQLITE</span>
        </a>
        <span className="local">
          <i /> Runs in your browser
        </span>
      </header>
      <div className="workspace">
        <aside>
          <div className="workspace-controls">
            <label htmlFor="workspace-select">WORKSPACE</label>
            <select
              id="workspace-select"
              value={active?.id || ""}
              disabled={busy}
              onChange={(event) => switchWorkspace(event.target.value)}
            >
              {workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <label htmlFor="dataset-select">NEW WORKSPACE DATASET</label>
            <select
              id="dataset-select"
              value={dataset}
              disabled={busy}
              onChange={(event) => setDataset(event.target.value)}
            >
              {Object.entries(datasets).map(([id, value]) => (
                <option value={id} key={id}>
                  {value.name}
                </option>
              ))}
            </select>
            <input
              className="workspace-name"
              aria-label="Workspace name"
              placeholder="Workspace name"
              maxLength={80}
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
            />
            <div>
              <button
                disabled={busy || !active || !workspaceName.trim()}
                onClick={createWorkspace}
              >
                + New
              </button>
              <button
                disabled={busy || !active || !workspaceName.trim()}
                onClick={() => {
                  update({
                    ...current.current,
                    name: workspaceName.trim().slice(0, 80),
                    sql,
                  });
                  setWorkspaceName("");
                }}
              >
                Rename
              </button>
              <button
                disabled={busy || workspaces.length < 2}
                onClick={removeWorkspace}
              >
                Delete
              </button>
            </div>
            <div className="backup-actions">
              <button
                disabled={busy || !active}
                onClick={() =>
                  download(
                    "sql-playground-backup.json",
                    serializeWorkspace({ ...current.current, sql }),
                  )
                }
              >
                Export backup
              </button>
              <button
                disabled={busy || !active}
                onClick={() => importFile.current.click()}
              >
                Import backup
              </button>
              <input
                ref={importFile}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={importWorkspace}
              />
            </div>
          </div>
          <div className="eyebrow">EXPLORER</div>
          <h2>
            <span>▱</span> {active?.name || "workspace"}.db
          </h2>
          <p className="muted">Your space to experiment.</p>
          <div className="table-label">
            TABLES <span>{tables.length}</span>
          </div>
          {tables.map((table) => (
            <details key={table.name} open>
              <summary>
                <span>▦</span> {table.name}
                <button
                  title={`Preview ${table.name}`}
                  aria-label={`Preview ${table.name}`}
                  disabled={busy}
                  onClick={(event) => {
                    event.preventDefault();
                    setSql(`SELECT * FROM ${quote(table.name)} LIMIT 100;`);
                    setSelected("");
                    editor.current?.focus();
                  }}
                >
                  ↗
                </button>
              </summary>
              <ul>
                {table.columns.map((column) => (
                  <li key={column.name}>
                    <span className={column.primary ? "key" : ""}>
                      {column.primary ? "⚿" : "·"} {column.name}
                    </span>
                    <small>{column.type}</small>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <div className="aside-note">
            <strong>A fresh start, anytime.</strong>
            <p>
              Workspaces are saved in this browser. Reset restores only this
              database; saved queries and history stay.
            </p>
            <button
              className="reset"
              disabled={busy || !active}
              onClick={() => {
                if (
                  window.confirm(
                    "Restore this workspace’s original dataset? Database edits will be lost.",
                  )
                ) {
                  clearTimeout(draftTimer.current);
                  display({ ...current.current, sql });
                  boot({ ...current.current, bytes: null });
                }
              }}
            >
              ↻ Reset database
            </button>
          </div>
        </aside>
        <main id="main-content">
          {storageError && (
            <div role="alert" className="error">
              {storageError}{" "}
              <button
                disabled={busy}
                onClick={() =>
                  active
                    ? update({ ...current.current, sql })
                    : location.reload()
                }
              >
                Retry save
              </button>
            </div>
          )}
          <div className="intro">
            <div className="eyebrow">LEARN BY DOING</div>
            <h1>A little SQL. Endless possibilities.</h1>
            <p>Write a query, explore your data, and see what happens.</p>
          </div>
          <div className="workspace-heading">
            <span>{active?.name || "Opening workspace…"}</span>
            <button
              disabled={busy || !active}
              onClick={() => switchWorkspace(active.id)}
            >
              ↻ Reopen saved database
            </button>
          </div>
          <section className="editor-panel">
            <div className="toolbar">
              <div>
                <span className="green-dot" /> SQL editor
              </div>
              <label className="example-label">
                Try an example{" "}
                <select
                  disabled={busy}
                  aria-label="Example query"
                  value={selected}
                  onChange={(event) => {
                    setSelected(event.target.value);
                    setSql(examples[event.target.value]);
                  }}
                >
                  <option value="" disabled>
                    Custom query
                  </option>
                  {Object.keys(examples).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="code">
              <div className="line-numbers" aria-hidden="true">
                {sql.split("\n").map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <textarea
                disabled={busy || !active}
                ref={editor}
                aria-label="SQL editor"
                spellCheck="false"
                value={sql}
                onChange={(event) => {
                  setSql(event.target.value);
                  setSelected("");
                }}
                onKeyDown={(event) => {
                  if (
                    (event.metaKey || event.ctrlKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault();
                    run();
                  }
                  if (event.key === "Tab") {
                    event.preventDefault();
                    const target = event.currentTarget;
                    const start = target.selectionStart;
                    setSql(
                      sql.slice(0, start) +
                        "  " +
                        sql.slice(target.selectionEnd),
                    );
                    requestAnimationFrame(() => {
                      target.selectionStart = target.selectionEnd = start + 2;
                    });
                  }
                }}
              />
            </div>
            <div className="editor-footer">
              <span>
                SQLite ·{" "}
                {busy
                  ? "Working…"
                  : ready
                    ? "Ready to query"
                    : "Reset required"}
              </span>
              <button
                className="run"
                disabled={busy || !ready || !sql.trim()}
                onClick={run}
              >
                ▶ {busy ? "Working…" : "Run query"} <kbd>⌘ / Ctrl ↵</kbd>
              </button>
            </div>
          </section>
          <section className="results" aria-live="polite" aria-busy={busy}>
            <div className="results-title">
              <h2>Query results</h2>
              {response && !response.error && response.results?.length > 0 && (
                <span className="timing">
                  ✓ Completed in {response.elapsed.toFixed(1)} ms
                </span>
              )}
            </div>
            {response?.error ? (
              <div role="alert" className="error">
                <strong>Something needs a second look</strong>
                <pre>{response.error}</pre>
                <p>
                  Check your SQL and try again. Earlier successful statements in
                  a batch may already be applied.
                </p>
              </div>
            ) : response?.results?.length ? (
              response.results.map((result, index) => (
                <div className="result-set" key={index}>
                  {response.results.length > 1 && (
                    <h3>Statement {index + 1}</h3>
                  )}
                  {result.columns.length ? (
                    <>
                      <div className="result-meta">
                        <button
                          className="csv-download"
                          onClick={() =>
                            download(
                              "query-results.csv",
                              csvResult(result),
                              "text/csv;charset=utf-8",
                            )
                          }
                        >
                          Export CSV
                        </button>
                        {result.rows.length}{" "}
                        {result.rows.length === 1 ? "row" : "rows"} returned
                        {result.truncated ? " · Showing first 500 rows" : ""}
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th className="row-index">#</th>
                              {result.columns.map((column, i) => (
                                <th key={i}>{column}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {result.rows.map((row, i) => (
                              <tr key={i}>
                                <td className="row-index">{i + 1}</td>
                                {row.map((value, j) => (
                                  <td key={j}>
                                    {value === null ? (
                                      <em>NULL</em>
                                    ) : (
                                      String(value)
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!result.rows.length && (
                          <p className="empty-rows">
                            Query succeeded. No matching rows.
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="success">
                      ✓ Statement executed · {result.affected} rows affected
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="empty">
                <span>⌘</span>
                <h3>Your next discovery starts with a query.</h3>
                <p>Run the example above, or write something of your own.</p>
              </div>
            )}
          </section>
          <section className="library">
            <div className="library-tabs">
              <button
                aria-pressed={panel === "saved"}
                onClick={() => setPanel("saved")}
              >
                Saved queries ({active?.saved.length || 0})
              </button>
              <button
                aria-pressed={panel === "history"}
                onClick={() => setPanel("history")}
              >
                Query history ({active?.history.length || 0})
              </button>
            </div>
            {panel === "saved" ? (
              <>
                <form onSubmit={saveQuery}>
                  <input
                    aria-label="Query name"
                    placeholder="Name this query"
                    value={savedName}
                    onChange={(event) => setSavedName(event.target.value)}
                    maxLength={80}
                  />
                  <button
                    disabled={
                      busy || !active || !savedName.trim() || !sql.trim()
                    }
                  >
                    Save query
                  </button>
                </form>
                {!active?.saved.length && (
                  <p>
                    No saved queries yet. Save your editor query to reuse it.
                  </p>
                )}
                {active?.saved.map((query) => (
                  <article key={query.id}>
                    <button
                      className="query-load"
                      disabled={busy}
                      onClick={() => {
                        setSql(query.sql);
                        setSelected("");
                        editor.current?.focus();
                      }}
                    >
                      <strong>{query.name}</strong>
                      <code>{query.sql}</code>
                    </button>
                    <button
                      disabled={busy}
                      aria-label={"Delete saved query " + query.name}
                      onClick={() =>
                        update({
                          ...current.current,
                          saved: current.current.saved.filter(
                            (item) => item.id !== query.id,
                          ),
                        })
                      }
                    >
                      Delete
                    </button>
                  </article>
                ))}
              </>
            ) : (
              <>
                {!!active?.history.length && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Clear query history for this workspace?",
                        )
                      )
                        update({ ...current.current, history: [] });
                    }}
                  >
                    Clear history
                  </button>
                )}
                {!active?.history.length && (
                  <p>Run a query to start your history.</p>
                )}
                {active?.history.map((item) => (
                  <article key={item.id}>
                    <button
                      className="query-load"
                      disabled={busy}
                      onClick={() => {
                        setSql(item.sql);
                        setSelected("");
                        editor.current?.focus();
                      }}
                    >
                      <strong>
                        {item.error ? "Error" : "Success"} ·{" "}
                        {new Date(item.at).toLocaleString()} ·{" "}
                        {item.elapsed.toFixed(1)} ms
                      </strong>
                      <code>{item.sql}</code>
                      {item.error && <span>{item.error}</span>}
                    </button>
                  </article>
                ))}
              </>
            )}
          </section>
          <footer>
            <span>Made for curious minds.</span>
            <span role="status">{saveStatus} · No account required</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
