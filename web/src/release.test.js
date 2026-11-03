import { test } from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import { createSession } from "./session.js";
import { datasets } from "./datasets.js";
import { newWorkspace, recordHistory } from "./storage.js";
import { serializeWorkspace, parseWorkspace, csvResult } from "./backup.js";
const SQL = await initSqlJs();
test("every dataset and its examples execute without errors", () => {
  for (const [dataset, value] of Object.entries(datasets)) {
    const session = createSession(SQL);
    assert.equal(session.handle({ type: "init", dataset }).error, undefined);
    for (const sql of Object.values(value.examples))
      assert.equal(session.handle({ type: "run", sql }).error, undefined, sql);
    session.close();
  }
});
test("snapshot reload preserves data and enforces foreign keys after export", () => {
  const session = createSession(SQL);
  session.handle({ type: "init" });
  const result = session.handle({
    type: "run",
    sql: "INSERT INTO users VALUES(5,'new','new@example.com')",
  });
  const reopened = createSession(SQL);
  reopened.handle({ type: "init", bytes: result.bytes });
  assert.equal(
    reopened.handle({ type: "run", sql: "SELECT COUNT(*) FROM users" })
      .results[0].rows[0][0],
    5,
  );
  assert.match(
    reopened.handle({
      type: "run",
      sql: "INSERT INTO posts VALUES(8,99,'invalid')",
    }).error,
    /FOREIGN KEY/,
  );
  session.close();
  reopened.close();
});
test("failed batches preserve prior committed changes; open transactions roll back explicitly", () => {
  const session = createSession(SQL);
  session.handle({ type: "init" });
  const result = session.handle({
    type: "run",
    sql: "CREATE TABLE notes (id); INSERT INTO notes VALUES(1); SELEC 1",
  });
  assert.match(result.error, /syntax/);
  assert.deepEqual(
    session.handle({ type: "run", sql: "SELECT * FROM notes" }).results[0].rows,
    [[1]],
  );
  const open = session.handle({
    type: "run",
    sql: "BEGIN; INSERT INTO notes VALUES(2)",
  });
  assert.match(open.error, /rolled back/);
  assert.deepEqual(
    session.handle({ type: "run", sql: "SELECT * FROM notes" }).results[0].rows,
    [[1]],
  );
  assert.equal(
    session.handle({
      type: "run",
      sql: "BEGIN; INSERT INTO notes VALUES(3); COMMIT;",
    }).error,
    undefined,
  );
  assert.equal(
    session.handle({ type: "run", sql: "SELECT * FROM notes" }).results[0].rows
      .length,
    2,
  );
  session.close();
});
test("backup round trip preserves bytes and library but gives imports distinct identities", () => {
  const session = createSession(SQL);
  const result = session.handle({ type: "init", dataset: "bookstore" });
  let workspace = {
    ...newWorkspace("Books", "SELECT * FROM books"),
    dataset: "bookstore",
    bytes: result.bytes,
    saved: [{ id: "a", name: "Books", sql: "SELECT * FROM books" }],
  };
  workspace = recordHistory(workspace, workspace.sql, { elapsed: 2 });
  const imported = parseWorkspace(serializeWorkspace(workspace));
  assert.notEqual(imported.id, workspace.id);
  assert.notEqual(imported.saved[0].id, "a");
  assert.deepEqual(imported.bytes, workspace.bytes);
  assert.equal(imported.dataset, "bookstore");
  assert.equal(imported.history[0].sql, workspace.sql);
  session.close();
});
test("invalid, oversized and corrupt backups are rejected", () => {
  assert.throws(() => parseWorkspace("not json"));
  assert.throws(() => parseWorkspace("{}"), /supported/);
  assert.throws(
    () => parseWorkspace("x".repeat(20 * 1024 * 1024 + 1)),
    /limit/,
  );
  const value = JSON.parse(
    serializeWorkspace(newWorkspace("Test", "SELECT 1")),
  );
  value.workspace.bytes = [1, 2, 3];
  assert.throws(() => parseWorkspace(JSON.stringify(value)), /SQLite/);
  value.workspace.bytes = null;
  value.workspace.history = [{ sql: "bad", at: "invalid" }];
  assert.throws(() => parseWorkspace(JSON.stringify(value)), /history/);
});
test("CSV escapes separators, quotes, newlines and preserves empty cells", () => {
  assert.equal(
    csvResult({
      columns: ["name", "note"],
      rows: [
        ["a,b", 'a"b'],
        [null, "line\nbreak"],
      ],
    }),
    '"name","note"\r\n"a,b","a""b"\r\n"","line\nbreak"',
  );
});
