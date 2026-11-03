import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { createSession } from "./session.js";
const ready = initSqlJs({ locateFile: () => wasmUrl }).then(createSession);
self.onmessage = async ({ data }) => {
  try {
    self.postMessage((await ready).handle(data));
  } catch (error) {
    self.postMessage({
      error: error.message,
      results: [],
      schema: [],
      elapsed: 0,
    });
  }
};
