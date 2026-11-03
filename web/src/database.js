export const SAMPLE = `PRAGMA foreign_keys = ON;
CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE);
CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), caption TEXT NOT NULL);
CREATE TABLE comments (id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id), user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL);
INSERT INTO users VALUES (1,'alex','alex@example.com'),(2,'sam','sam@example.com'),(3,'john','john@example.com'),(4,'maya','maya@example.com');
INSERT INTO posts VALUES (1,1,'Morning light in the city'),(2,2,'A little weekend adventure'),(3,1,'Learning something new');
INSERT INTO comments VALUES (1,1,2,'Beautiful shot!'),(2,2,3,'Where is this?'),(3,3,4,'Keep going!');`;
export const quote = name => '"' + name.replaceAll('"', '""') + '"';
export function schema(db) {
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return (tables[0]?.values || []).map(([name]) => ({name, columns: db.exec(`PRAGMA table_info(${quote(name)})`)[0]?.values.map(row => ({name:row[1],type:row[2],primary:!!row[5]})) || []}));
}
export function execute(db, sql, limit = 500) {
  const results = [];
  // Iterate statements so even zero-row SELECTs preserve their column headings.
  for (const statement of db.iterateStatements(sql)) {
    const before = db.exec("SELECT total_changes()")[0].values[0][0];
    const columns = statement.getColumnNames();
    const rows = [];
    let truncated = false;
    while (statement.step()) {
      if (rows.length === limit) { truncated = true; break; }
      rows.push(statement.get().map(value => value instanceof Uint8Array ? `0x${Array.from(value, x => x.toString(16).padStart(2,'0')).join('')}` : value));
    }
    results.push({columns,rows,truncated,affected: columns.length || db.exec("SELECT total_changes()")[0].values[0][0] === before ? 0 : db.getRowsModified()});
  }
  return results;
}
