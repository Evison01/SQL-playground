import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import initSqlJs from "sql.js";
import {
  openStorage,
  listWorkspaces,
  saveWorkspace,
  deleteWorkspace,
  newWorkspace,
  recordHistory,
} from "./storage.js";
import { SAMPLE, execute } from "./database.js";
test("workspace database, drafts, saved queries and history survive reopen and remain isolated", async () => {
  const factory = new IDBFactory();
  let store = await openStorage(factory);
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(SAMPLE);
  execute(db, "INSERT INTO users VALUES(5,'test','test@example.com')");
  let first = newWorkspace("First", "SELECT * FROM users");
  first = {
    ...first,
    bytes: db.export(),
    saved: [{ id: "saved", name: "All users", sql: "SELECT * FROM users" }],
  };
  first = recordHistory(first, "SELECT * FROM missing", {
    error: "no such table: missing",
    elapsed: 2,
  });
  const second = newWorkspace("Second", "SELECT 2");
  await saveWorkspace(store, first);
  await saveWorkspace(store, second);
  store.close();
  store = await openStorage(factory);
  const values = await listWorkspaces(store);
  const restored = values.find((w) => w.id === first.id);
  assert.equal(restored.sql, "SELECT * FROM users");
  assert.equal(restored.saved[0].name, "All users");
  assert.equal(restored.history[0].error, "no such table: missing");
  const reopened = new SQL.Database(restored.bytes);
  assert.equal(
    execute(reopened, "SELECT COUNT(*) FROM users")[0].rows[0][0],
    5,
  );
  assert.equal(values.find((w) => w.id === second.id).bytes, null);
  await saveWorkspace(store, {
    ...restored,
    name: "Renamed",
    saved: [],
    history: [],
  });
  await deleteWorkspace(store, second.id);
  const remaining = await listWorkspaces(store);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].name, "Renamed");
  assert.deepEqual(remaining[0].saved, []);
  assert.deepEqual(remaining[0].history, []);
  store.close();
  db.close();
  reopened.close();
});
test("history keeps latest 100 attempts including failures", () => {
  let value = newWorkspace("History", "");
  for (let i = 0; i < 105; i++)
    value = recordHistory(value, String(i), {
      elapsed: i,
      error: i === 104 ? "failed" : null,
    });
  assert.equal(value.history.length, 100);
  assert.equal(value.history[0].sql, "104");
  assert.equal(value.history[0].error, "failed");
  assert.equal(value.history.at(-1).sql, "5");
});
test("storage errors reject rather than reporting a successful save", async () => {
  const db = await openStorage(new IDBFactory());
  db.close();
  await assert.rejects(saveWorkspace(db, newWorkspace("Cannot save", "")));
});
