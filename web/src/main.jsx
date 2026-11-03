import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {quote} from './database.js';
import './style.css';
import {openStorage,listWorkspaces,saveWorkspace,deleteWorkspace,newWorkspace,recordHistory} from './storage.js';
const examples = {
  'First query': 'SELECT id, username, email\nFROM users\nWHERE id <= 3;',
  'Join tables': 'SELECT users.username, posts.caption\nFROM posts\nJOIN users ON users.id = posts.user_id;',
  'Count posts': 'SELECT users.username, COUNT(posts.id) AS post_count\nFROM users\nLEFT JOIN posts ON posts.user_id = users.id\nGROUP BY users.id\nORDER BY post_count DESC;'
};
function App() {
  const [sql,setSql] = useState(examples['First query']);
  const [tables,setTables] = useState([]);
  const [response,setResponse] = useState(null);
  const [busy,setBusy] = useState(true);
  const [ready,setReady] = useState(false);
  const [selected,setSelected] = useState('First query');
  const worker = useRef(null), timer = useRef(null), editor = useRef(null);
  const [workspaces,setWorkspaces] = useState([]);
  const [active,setActive] = useState(null);
  const [storageError,setStorageError] = useState('');
  const [savedName,setSavedName] = useState('');
  const [workspaceName,setWorkspaceName] = useState('');
  const [panel,setPanel] = useState('saved');
  const storage = useRef(null), current = useRef(null), draftTimer = useRef(null);
  const pending = useRef(null);
  function display(value) {
    current.current = value; setActive(value);
    setWorkspaces(items => [...items.filter(item=>item.id !== value.id),value].sort((a,b)=>a.name.localeCompare(b.name)));
  }
  async function persist(value) {
    if (!storage.current) throw new Error('Browser storage is unavailable. Reload to retry.');
    await saveWorkspace(storage.current,value);
    setStorageError('');
  }
  async function update(value) {
    display(value);
    try { await persist(value); }
    catch(error) { setStorageError('Changes could not be saved: '+error.message); }
  }
  function boot(value) {
    clearTimeout(timer.current); worker.current?.terminate();
    setBusy(true); setReady(false); setResponse(null); setTables([]);
    const instance = new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    worker.current = instance;
    instance.onmessage = async ({data}) => {
      clearTimeout(timer.current);
      if (worker.current !== instance) return;
      setTables(data.schema || []); setResponse(data);
      let next = {...current.current,bytes:data.bytes || current.current.bytes,updatedAt:Date.now()};
      if (pending.current) next = recordHistory(next,pending.current,data);
      pending.current = null;
      await update(next);
      if (worker.current !== instance) return;
      setBusy(false); setReady(!!data.bytes);
    };
    const fail = async message => {
      instance.terminate(); clearTimeout(timer.current); setReady(false);
      setResponse({error:message});
      if (pending.current) await update(recordHistory(current.current,pending.current,{error:message}));
      pending.current = null; setBusy(false);
    };
    instance.onerror = () => fail('The database worker failed. Reopen this workspace to restore its last saved state.');
    timer.current = setTimeout(()=>fail('Database initialization timed out. Reopen the workspace to retry.'),15000);
    instance.postMessage({type:'init',bytes:value.bytes});
  }
  useEffect(() => {
    let cancelled = false;
    (async()=>{
      try {
        const db = await openStorage();
        if(cancelled){db.close();return;}
        storage.current = db;
        let items = await listWorkspaces(db);
        if(!items.length){const value=newWorkspace('Instagram',examples['First query']);await saveWorkspace(db,value);items=[value];}
        if(cancelled)return;
        setWorkspaces(items);display(items[0]);setSql(items[0].sql);setSelected('');boot(items[0]);
      } catch(error) {setStorageError('Could not open browser storage: '+error.message);setBusy(false);}
    })();
    return ()=>{cancelled=true;worker.current?.terminate();clearTimeout(timer.current);clearTimeout(draftTimer.current);storage.current?.close();};
  },[]);
  useEffect(()=>{
    if(!active || sql === current.current.sql)return;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(()=>update({...current.current,sql,updatedAt:Date.now()}),300);
    return ()=>clearTimeout(draftTimer.current);
  },[sql,active?.id]);
  async function switchWorkspace(id) {
    if(busy)return;
    clearTimeout(draftTimer.current);
    if(current.current) {
      try {await persist({...current.current,sql});display({...current.current,sql});}
      catch(error){setStorageError('Could not save before switching: '+error.message);return;}
    }
    const value = workspaces.find(item=>item.id===id);
    if(!value)return;
    display(value);setSql(value.sql);setSelected('');boot(value);
  }
  async function createWorkspace() {
    const name=workspaceName;if(!name.trim())return;
    const value=newWorkspace(name.trim().slice(0,80),examples['First query']);
    try {await persist({...current.current,sql});await persist(value);setWorkspaceName('');display(value);setSql(value.sql);setSelected('');boot(value);}
    catch(error){setStorageError('Could not create workspace: '+error.message);}
  }
  async function removeWorkspace() {
    if(workspaces.length<2 || !window.confirm('Delete this workspace, its database, saved queries and history? This cannot be undone.'))return;
    try {
      clearTimeout(draftTimer.current);
      await deleteWorkspace(storage.current,current.current.id);
      const remaining=workspaces.filter(item=>item.id!==current.current.id);
      setWorkspaces(remaining);display(remaining[0]);setSql(remaining[0].sql);boot(remaining[0]);
    } catch(error){setStorageError('Could not delete workspace: '+error.message);}
  }
  function run() {
    if(busy || !ready || !sql.trim())return;
    clearTimeout(draftTimer.current);display({...current.current,sql});
    pending.current=sql;setBusy(true);setResponse(null);
    worker.current.postMessage({type:'run',sql});
    timer.current=setTimeout(async()=>{
      worker.current.terminate();setReady(false);
      const error='Query exceeded 5 seconds. Reopen the workspace to restore its last saved database.';
      setResponse({error});await update(recordHistory(current.current,sql,{error,elapsed:5000}));pending.current=null;setBusy(false);
    },5000);
  }
  function saveQuery(event) {
    event.preventDefault();if(!savedName.trim() || !sql.trim())return;
    const name=savedName.trim();
    const existing=current.current.saved.find(query=>query.name===name);
    if(existing && !window.confirm('Replace the saved query named '+name+'?'))return;
    update({...current.current,sql,saved:[...current.current.saved.filter(query=>query.name!==name),{id:existing?.id || crypto.randomUUID(),name,sql}]});setSavedName('');
  }
  return <div className="app">
    <header><a className="brand" href="./"><span className="logo">▤</span> SQL Playground <span className="badge">SQLITE</span></a><span className="local"><i/> Runs in your browser</span></header>
    <div className="workspace">
      <aside><div className="workspace-controls"><label htmlFor="workspace-select">WORKSPACE</label><select id="workspace-select" value={active?.id || ''} disabled={busy} onChange={event=>switchWorkspace(event.target.value)}>{workspaces.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><input className="workspace-name" aria-label="Workspace name" placeholder="Workspace name" maxLength={80} value={workspaceName} onChange={event=>setWorkspaceName(event.target.value)}/><div><button disabled={busy || !active || !workspaceName.trim()} onClick={createWorkspace}>+ New</button><button disabled={busy || !active || !workspaceName.trim()} onClick={()=>{update({...current.current,name:workspaceName.trim().slice(0,80),sql});setWorkspaceName('');}}>Rename</button><button disabled={busy || workspaces.length<2} onClick={removeWorkspace}>Delete</button></div></div><div className="eyebrow">EXPLORER</div><h2><span>▱</span> instagram.db</h2><p className="muted">Your space to experiment.</p>
        <div className="table-label">TABLES <span>{tables.length}</span></div>
        {tables.map(table => <details key={table.name} open><summary><span>▦</span> {table.name}<button title={`Preview ${table.name}`} aria-label={`Preview ${table.name}`} onClick={event => {event.preventDefault();setSql(`SELECT * FROM ${quote(table.name)} LIMIT 100;`);setSelected('');editor.current?.focus();}}>↗</button></summary><ul>{table.columns.map(column => <li key={column.name}><span className={column.primary ? 'key' : ''}>{column.primary ? '⚿' : '·'} {column.name}</span><small>{column.type}</small></li>)}</ul></details>)}
        <div className="aside-note"><strong>A fresh start, anytime.</strong><p>Workspaces are saved in this browser. Reset restores only this database; saved queries and history stay.</p><button className="reset" disabled={busy || !active} onClick={() => {if(window.confirm('Restore sample data for this workspace? Database edits will be lost.')) boot({...current.current,bytes:null});}}>↻ Reset database</button></div>
      </aside>
      <main>{storageError && <div role="alert" className="error">{storageError} <button onClick={()=>active && update({...current.current,sql})}>Retry save</button></div>}<div className="intro"><div className="eyebrow">LEARN BY DOING</div><h1>A little SQL. Endless possibilities.</h1><p>Write a query, explore your data, and see what happens.</p></div>
        <div className="workspace-heading"><span>{active?.name || 'Opening workspace…'}</span><button disabled={busy || !active} onClick={()=>switchWorkspace(active.id)}>↻ Reopen saved database</button></div><section className="editor-panel"><div className="toolbar"><div><span className="green-dot"/> SQL editor</div><label className="example-label">Try an example <select aria-label="Example query" value={selected} onChange={event => {setSelected(event.target.value);setSql(examples[event.target.value]);}}><option value="" disabled>Custom query</option>{Object.keys(examples).map(name => <option key={name}>{name}</option>)}</select></label></div>
          <div className="code"><div className="line-numbers" aria-hidden="true">{sql.split('\n').map((_,i) => <div key={i}>{i+1}</div>)}</div><textarea disabled={busy || !active} ref={editor} aria-label="SQL editor" spellCheck="false" value={sql} onChange={event => {setSql(event.target.value);setSelected('');}} onKeyDown={event => {if((event.metaKey || event.ctrlKey) && event.key === 'Enter'){event.preventDefault();run();} if(event.key === 'Tab'){event.preventDefault();const target=event.currentTarget;const start=target.selectionStart;setSql(sql.slice(0,start)+'  '+sql.slice(target.selectionEnd));requestAnimationFrame(()=>{target.selectionStart=target.selectionEnd=start+2;});}}}/></div>
          <div className="editor-footer"><span>SQLite · {busy ? 'Working…' : ready ? 'Ready to query' : 'Reset required'}</span><button className="run" disabled={busy || !ready || !sql.trim()} onClick={run}>▶ {busy ? 'Working…' : 'Run query'} <kbd>⌘ / Ctrl ↵</kbd></button></div>
        </section>
        <section className="results" aria-live="polite" aria-busy={busy}><div className="results-title"><h2>Query results</h2>{response && !response.error && response.results?.length > 0 && <span className="timing">✓ Completed in {response.elapsed.toFixed(1)} ms</span>}</div>
          {response?.error ? <div role="alert" className="error"><strong>Something needs a second look</strong><pre>{response.error}</pre><p>Check your SQL and try again. Earlier successful statements in a batch may already be applied.</p></div> : response?.results?.length ? response.results.map((result,index) => <div className="result-set" key={index}>{response.results.length > 1 && <h3>Statement {index+1}</h3>}{result.columns.length ? <><div className="result-meta">{result.rows.length} {result.rows.length === 1 ? 'row' : 'rows'} returned{result.truncated ? ' · Showing first 500 rows' : ''}</div><div className="table-scroll"><table><thead><tr><th className="row-index">#</th>{result.columns.map((column,i) => <th key={i}>{column}</th>)}</tr></thead><tbody>{result.rows.map((row,i) => <tr key={i}><td className="row-index">{i+1}</td>{row.map((value,j) => <td key={j}>{value === null ? <em>NULL</em> : String(value)}</td>)}</tr>)}</tbody></table>{!result.rows.length && <p className="empty-rows">Query succeeded. No matching rows.</p>}</div></> : <div className="success">✓ Statement executed · {result.affected} rows affected</div>}</div>) : <div className="empty"><span>⌘</span><h3>Your next discovery starts with a query.</h3><p>Run the example above, or write something of your own.</p></div>}
        </section>
        <section className="library"><div className="library-tabs"><button aria-pressed={panel==='saved'} onClick={()=>setPanel('saved')}>Saved queries ({active?.saved.length || 0})</button><button aria-pressed={panel==='history'} onClick={()=>setPanel('history')}>Query history ({active?.history.length || 0})</button></div>
        {panel==='saved' ? <><form onSubmit={saveQuery}><input aria-label="Query name" placeholder="Name this query" value={savedName} onChange={event=>setSavedName(event.target.value)} maxLength={80}/><button disabled={busy || !active || !savedName.trim() || !sql.trim()}>Save query</button></form>{!active?.saved.length && <p>No saved queries yet. Save your editor query to reuse it.</p>}{active?.saved.map(query=><article key={query.id}><button className="query-load" disabled={busy} onClick={()=>{setSql(query.sql);setSelected('');editor.current?.focus();}}><strong>{query.name}</strong><code>{query.sql}</code></button><button disabled={busy} aria-label={'Delete saved query '+query.name} onClick={()=>update({...current.current,saved:current.current.saved.filter(item=>item.id!==query.id)})}>Delete</button></article>)}</> : <>{!!active?.history.length && <button disabled={busy} onClick={()=>{if(window.confirm('Clear query history for this workspace?'))update({...current.current,history:[]});}}>Clear history</button>}{!active?.history.length && <p>Run a query to start your history.</p>}{active?.history.map(item=><article key={item.id}><button className="query-load" disabled={busy} onClick={()=>{setSql(item.sql);setSelected('');editor.current?.focus();}}><strong>{item.error ? 'Error' : 'Success'} · {new Date(item.at).toLocaleString()} · {item.elapsed.toFixed(1)} ms</strong><code>{item.sql}</code>{item.error && <span>{item.error}</span>}</button></article>)}</>}
        </section><footer><span>Made for curious minds.</span><span>Saved on this device · No account required</span></footer>
      </main>
    </div>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
