# Phase 1 — SQLite Engine

A dependency-free Python 3.9+ engine that creates a sample database, executes SQL,
returns structured results, and reports SQL errors without crashing the session.

## Run

```sh
python3 main.py --init
python3 main.py --query "SELECT department, AVG(salary) AS average_salary FROM employees GROUP BY department"
python3 main.py --query "SELECT * FROM employees WHERE salary > ?" --params '[80000]'
python3 main.py --query "INSERT INTO employees VALUES (?, ?, ?, ?)" --params '[5, "Eve", "Sales", 72000]'
python3 main.py --query "SELECT * FROM missing_table"
```

The first command creates `sample.db` and seeds four employees. `--init` can be
repeated without overwriting existing rows. Use `--database path.db` to choose
another file or `--database :memory: --init` for an ephemeral database.
Without `--query`, the CLI lists employees ordered by ID.

Results are JSON with `success`, ordered `columns`, `rows` as arrays,
`row_count`, `affected_rows`, and `error`. Arrays preserve duplicate column names.
BLOB values are represented as objects containing a hex string in CLI output.
The CLI exits with 0 for success and 1 for errors.

## Python API

```python
from engine import SQLiteEngine

with SQLiteEngine(':memory:') as engine:
    engine.create_sample_database()
    result = engine.execute('SELECT name FROM employees WHERE department = ?', ['Engineering'])
    print(result.to_dict())
```

One SQL statement is accepted per execution. Successful statements commit;
failed statements roll back. Fetching completes before commit, supporting
statements that return rows. Foreign key enforcement is enabled. Use bound
parameters for external values. Database opening and initialization errors raise
SQLite exceptions in the Python API; the CLI catches these and returns JSON.

This is a local engine for trusted SQL. It permits schema changes and deletions;
it is not an untrusted-query sandbox or a public API. Results are fetched into
memory, so large datasets will need pagination in a later phase.

## Verify

```sh
python3 -m unittest discover -s tests -v
```

Tests cover seeding, persistence, parameter binding, aggregation, CRUD, empty
results, SQL errors, constraint rollback, connection cleanup, and CLI JSON/exit
codes. GitHub Actions runs the suite on Python 3.9, 3.12, and 3.13.

## Phase 2 — React SQL Playground

The `web/` app is a React + Vite SQL editor. It runs a separate, disposable
SQLite database inside a browser Web Worker using sql.js/WebAssembly. No SQL
is sent to a backend, and the Phase 1 Python CLI remains available independently.
The browser database is seeded with `users`, `posts`, and `comments`, linked by
foreign keys. This is playground data, not application accounts.

Requires Node.js 20.19+ or 22.12+.

```sh
cd web
npm ci
npm run dev
```

Open the URL printed by Vite. Write SQL, then click **Run query** or press
**Cmd/Ctrl+Enter**. Examples demonstrate selection, joins, and grouping. The
explorer shows tables, columns, types, and primary keys; click a table's arrow
to put a preview query in the editor. Run that query to see its rows.

- CREATE, INSERT, UPDATE, DELETE, SELECT, joins and multi-statement batches work.
- Each statement gets its own results or affected-row count. Empty SELECTs retain
  headers, NULL is labeled, and SQL errors appear inline.
- The explorer refreshes after execution, including schema changes.
- Results are capped at 500 displayed rows per statement. Queries are terminated
  after 5 seconds; use Reset to recreate the worker and sample database afterward.
- Earlier statements in a batch remain applied if a later statement fails. Use
  SQL transactions explicitly when you want transactional batches.
- This is session-only: reload/reset discards edits. Persistence is Phase 3.
- Browser worker isolation and a timeout are safeguards, not a hard memory quota.
  Excessively large queries can still exhaust browser resources.

```sh
npm test
npm run build
npm run preview
```

The production files are generated in `web/dist/`; no backend is required.
The SQLite WASM asset is bundled locally. Google Fonts are optional and have
system-font fallbacks. Browser database files are not shared with `sample.db`.
