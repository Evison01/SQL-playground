import { test } from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import { SAMPLE, execute, schema } from "./database.js";
const SQL = await initSqlJs();
function sample() {
  const db = new SQL.Database();
  db.run(SAMPLE);
  return db;
}
test("sample, joins, duplicate headings, empty SELECT and null values", () => {
  const db = sample();
  assert.equal(execute(db, "SELECT * FROM users")[0].rows.length, 4);
  assert.equal(
    execute(
      db,
      "SELECT users.username, posts.caption FROM posts JOIN users ON users.id=posts.user_id",
    )[0].rows.length,
    3,
  );
  assert.deepEqual(execute(db, "SELECT id FROM users WHERE 0")[0].columns, [
    "id",
  ]);
  assert.deepEqual(execute(db, "SELECT 1 AS x, NULL AS x")[0], {
    columns: ["x", "x"],
    rows: [[1, null]],
    truncated: false,
    affected: 0,
  });
  db.close();
});
test("create, insert, update, delete and explorer schema refresh", () => {
  const db = sample();
  execute(
    db,
    'CREATE TABLE "odd table" (id INTEGER PRIMARY KEY, text TEXT); INSERT INTO "odd table" VALUES(1,\'hello\');',
  );
  assert.equal(
    schema(db).find((t) => t.name === "odd table").columns[0].primary,
    true,
  );
  assert.equal(
    execute(db, "UPDATE \"odd table\" SET text='new'")[0].affected,
    1,
  );
  assert.deepEqual(execute(db, 'SELECT * FROM "odd table"')[0].rows, [
    [1, "new"],
  ]);
  assert.equal(execute(db, 'DELETE FROM "odd table"')[0].affected, 1);
  assert.equal(execute(db, 'DROP TABLE "odd table"')[0].affected, 0);
  assert.equal(schema(db).length, 3);
  db.close();
});
test("SQL errors recover, foreign keys enforce integrity, result cap works", () => {
  const db = sample();
  assert.throws(() => execute(db, "SELEC 1"));
  assert.throws(() => execute(db, "INSERT INTO posts VALUES(10,99,'invalid')"));
  assert.equal(execute(db, "SELECT 1")[0].rows[0][0], 1);
  const result = execute(
    db,
    "WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000) SELECT * FROM n",
  )[0];
  assert.equal(result.rows.length, 500);
  assert.equal(result.truncated, true);
  db.close();
});
