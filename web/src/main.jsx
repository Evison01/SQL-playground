import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {quote} from './database.js';
import './style.css';
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
  function boot() {
    clearTimeout(timer.current);
    worker.current?.terminate();
    setBusy(true); setReady(false); setResponse(null); setTables([]);
    const instance = new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
    worker.current = instance;
    instance.onmessage = ({data}) => {
      clearTimeout(timer.current);
      setTables(data.schema || []); setResponse(data); setBusy(false); setReady(!data.error || data.schema?.length > 0);
    };
    const fail = message => {
      instance.terminate(); clearTimeout(timer.current); setReady(false); setBusy(false);
      setResponse({error:message});
    };
    instance.onerror = () => fail('The database worker could not start. Reset the database to try again.');
    timer.current = setTimeout(() => fail('Database initialization timed out. Reset to try again.'),15000);
    instance.postMessage({type:'init'});
  }
  useEffect(() => {boot(); return () => {worker.current?.terminate(); clearTimeout(timer.current);};},[]);
  function run() {
    if (busy || !ready || !sql.trim()) return;
    setBusy(true); setResponse(null);
    worker.current.postMessage({type:'run',sql});
    timer.current = setTimeout(() => {
      worker.current.terminate(); setBusy(false); setReady(false);
      setResponse({error:'Query exceeded 5 seconds. Reset the database to continue. Reset discards this session’s changes.'});
    },5000);
  }
  return <div className="app">
    <header><a className="brand" href="./"><span className="logo">▤</span> SQL Playground <span className="badge">SQLITE</span></a><span className="local"><i/> Runs in your browser</span></header>
    <div className="workspace">
      <aside><div className="eyebrow">EXPLORER</div><h2><span>▱</span> instagram.db</h2><p className="muted">Your space to experiment.</p>
        <div className="table-label">TABLES <span>{tables.length}</span></div>
        {tables.map(table => <details key={table.name} open><summary><span>▦</span> {table.name}<button title={`Preview ${table.name}`} aria-label={`Preview ${table.name}`} onClick={event => {event.preventDefault();setSql(`SELECT * FROM ${quote(table.name)} LIMIT 100;`);setSelected('');editor.current?.focus();}}>↗</button></summary><ul>{table.columns.map(column => <li key={column.name}><span className={column.primary ? 'key' : ''}>{column.primary ? '⚿' : '·'} {column.name}</span><small>{column.type}</small></li>)}</ul></details>)}
        <div className="aside-note"><strong>A fresh start, anytime.</strong><p>Changes live in this tab. Reloading or resetting restores the sample data.</p><button className="reset" onClick={() => {if(window.confirm('Restore sample data? All changes in this session will be lost.')) boot();}}>↻ Reset database</button></div>
      </aside>
      <main><div className="intro"><div className="eyebrow">LEARN BY DOING</div><h1>A little SQL. Endless possibilities.</h1><p>Write a query, explore your data, and see what happens.</p></div>
        <section className="editor-panel"><div className="toolbar"><div><span className="green-dot"/> SQL editor</div><label className="example-label">Try an example <select aria-label="Example query" value={selected} onChange={event => {setSelected(event.target.value);setSql(examples[event.target.value]);}}><option value="" disabled>Custom query</option>{Object.keys(examples).map(name => <option key={name}>{name}</option>)}</select></label></div>
          <div className="code"><div className="line-numbers" aria-hidden="true">{sql.split('\n').map((_,i) => <div key={i}>{i+1}</div>)}</div><textarea ref={editor} aria-label="SQL editor" spellCheck="false" value={sql} onChange={event => {setSql(event.target.value);setSelected('');}} onKeyDown={event => {if((event.metaKey || event.ctrlKey) && event.key === 'Enter'){event.preventDefault();run();} if(event.key === 'Tab'){event.preventDefault();const target=event.currentTarget;const start=target.selectionStart;setSql(sql.slice(0,start)+'  '+sql.slice(target.selectionEnd));requestAnimationFrame(()=>{target.selectionStart=target.selectionEnd=start+2;});}}}/></div>
          <div className="editor-footer"><span>SQLite · {busy ? 'Working…' : ready ? 'Ready to query' : 'Reset required'}</span><button className="run" disabled={busy || !ready || !sql.trim()} onClick={run}>▶ {busy ? 'Working…' : 'Run query'} <kbd>⌘ / Ctrl ↵</kbd></button></div>
        </section>
        <section className="results" aria-live="polite" aria-busy={busy}><div className="results-title"><h2>Query results</h2>{response && !response.error && response.results?.length > 0 && <span className="timing">✓ Completed in {response.elapsed.toFixed(1)} ms</span>}</div>
          {response?.error ? <div role="alert" className="error"><strong>Something needs a second look</strong><pre>{response.error}</pre><p>Check your SQL and try again. Earlier successful statements in a batch may already be applied.</p></div> : response?.results?.length ? response.results.map((result,index) => <div className="result-set" key={index}>{response.results.length > 1 && <h3>Statement {index+1}</h3>}{result.columns.length ? <><div className="result-meta">{result.rows.length} {result.rows.length === 1 ? 'row' : 'rows'} returned{result.truncated ? ' · Showing first 500 rows' : ''}</div><div className="table-scroll"><table><thead><tr><th className="row-index">#</th>{result.columns.map((column,i) => <th key={i}>{column}</th>)}</tr></thead><tbody>{result.rows.map((row,i) => <tr key={i}><td className="row-index">{i+1}</td>{row.map((value,j) => <td key={j}>{value === null ? <em>NULL</em> : String(value)}</td>)}</tr>)}</tbody></table>{!result.rows.length && <p className="empty-rows">Query succeeded. No matching rows.</p>}</div></> : <div className="success">✓ Statement executed · {result.affected} rows affected</div>}</div>) : <div className="empty"><span>⌘</span><h3>Your next discovery starts with a query.</h3><p>Run the example above, or write something of your own.</p></div>}
        </section><footer><span>Made for curious minds.</span><span>Single workspace · Session only</span></footer>
      </main>
    </div>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
