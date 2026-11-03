import { schema, execute } from "./database.js";
import { datasets } from "./datasets.js";

// The worker and unit tests share this protocol. SQL never reaches app storage.
export function createSession(SQL) {
  let db;
  return {
    close() {
      db?.close();
    },
    handle(data) {
      const start = performance.now();
      let results = [],
        error;
      try {
        if (data.type === "init") {
          db?.close();
          db = data.bytes ? new SQL.Database(data.bytes) : new SQL.Database();
          if (!data.bytes)
            db.run((datasets[data.dataset] || datasets.instagram).schema);
          db.run("PRAGMA foreign_keys = ON");
        } else if (data.type === "run" && db) {
          results = execute(db, data.sql);
        } else {
          throw new Error("Initialize a workspace before executing SQL.");
        }
      } catch (failure) {
        error = failure.message;
      }
      try {
        // An open transaction cannot survive export. Roll it back explicitly
        // and tell the caller instead of silently losing its writes.
        if (db) {
          try {
            db.run("ROLLBACK");
            error =
              (error ? error + " " : "") +
              "Uncommitted transaction rolled back. Complete BEGIN … COMMIT in one run.";
            results = [];
          } catch {
            /* No transaction was open. */
          }
        }
        const bytes = db?.export();
        db?.run("PRAGMA foreign_keys = ON");
        return {
          results,
          error,
          bytes,
          schema: db ? schema(db) : [],
          elapsed: performance.now() - start,
        };
      } catch (failure) {
        return {
          results: [],
          error: failure.message,
          schema: [],
          elapsed: performance.now() - start,
        };
      }
    },
  };
}
