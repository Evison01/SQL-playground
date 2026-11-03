import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { SAMPLE, schema, execute } from './database.js';
let db;
const ready = initSqlJs({locateFile: () => wasmUrl});
self.onmessage = async ({data}) => {
  const start = performance.now();
  let results = [], error;
  try {
    const SQL = await ready;
    if (data.type === 'init') {
      db = data.bytes ? new SQL.Database(data.bytes) : new SQL.Database();
      if (!data.bytes) db.run(SAMPLE);
      db.run('PRAGMA foreign_keys = ON');
    } else {
      results = execute(db, data.sql);
    }
  } catch (failure) { error = failure.message; }
  try {
    // Export committed state even if a later statement in the batch failed.
    const bytes = db?.export();
    db?.run('PRAGMA foreign_keys = ON');
    self.postMessage({results,error,bytes,schema:db ? schema(db) : [],elapsed:performance.now()-start});
  } catch (failure) {
    self.postMessage({error:failure.message,schema:[],elapsed:performance.now()-start});
  }
};
