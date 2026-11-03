"""Small SQLite query engine using only the Python standard library."""
import sqlite3
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Union


@dataclass
class QueryResult:
    success: bool
    columns: List[str] = field(default_factory=list)
    rows: List[List[Any]] = field(default_factory=list)
    row_count: int = 0
    affected_rows: int = 0
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class SQLiteEngine:
    """Execute one statement per call, committing successes and rolling back failures.

    SQL is trusted input: callers can modify or delete the selected database.
    Use parameters for values supplied by users.
    """

    def __init__(self, database: Union[str, Path] = ':memory:'):
        self.connection = sqlite3.connect(str(database))
        self.connection.execute('PRAGMA foreign_keys = ON')

    def execute(self, sql: str, parameters: Sequence[Any] = ()) -> QueryResult:
        try:
            with self.connection:
                cursor = self.connection.execute(sql, parameters)
                columns = [column[0] for column in cursor.description or []]
                rows = [list(row) for row in cursor.fetchall()] if columns else []
                affected = max(cursor.rowcount, 0)
            return QueryResult(True, columns, rows, len(rows), affected)
        except (sqlite3.Error, sqlite3.Warning, OverflowError) as error:
            return QueryResult(False, error=str(error))

    def create_sample_database(self) -> None:
        """Seed a fresh database atomically; repeat calls preserve existing data."""
        with self.connection:
            self.connection.execute('''CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                department TEXT NOT NULL,
                salary INTEGER NOT NULL CHECK (salary >= 0)
            )''')
            self.connection.executemany(
                'INSERT INTO employees (id, name, department, salary) VALUES (?, ?, ?, ?) '
                'ON CONFLICT(id) DO NOTHING',
                [(1, 'Alice', 'Engineering', 95000),
                 (2, 'Bob', 'Design', 80000),
                 (3, 'Charlie', 'Engineering', 105000),
                 (4, 'Diana', 'Marketing', 75000)],
            )

    def close(self) -> None:
        self.connection.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()
