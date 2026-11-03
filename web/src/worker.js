import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { SAMPLE, schema, execute } from './database.js';
let db;
const ready = initSqlJs({locateFile: () => wasmUrl}).then(SQL => {
  db = new SQL.Database();
  db.run(SAMPLE);
});
self.onmessage = async ({data}) => {
  const start = performance.now();
  try {
    await ready;
    const results = data.type === 'run' ? execute(db, data.sql) : [];
    self.postMessage({results, schema:schema(db),elapsed:performance.now()-start});
  } catch (error) {
    // Earlier successful statements in a batch remain applied, like a SQL console.
    self.postMessage({error:error.message,schema:db ? schema(db) : [],elapsed:performance.now()-start});
  }
};
