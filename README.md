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
