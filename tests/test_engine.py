import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from engine import SQLiteEngine


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.engine = SQLiteEngine()
        self.engine.create_sample_database()

    def tearDown(self):
        self.engine.close()

    def test_sample_and_repeat_initialization(self):
        self.engine.create_sample_database()
        result = self.engine.execute('SELECT * FROM employees ORDER BY id')
        self.assertTrue(result.success)
        self.assertEqual(result.columns, ['id', 'name', 'department', 'salary'])
        self.assertEqual(result.row_count, 4)
        self.assertEqual(result.rows[0], [1, 'Alice', 'Engineering', 95000])

    def test_parameters_and_aggregation(self):
        result = self.engine.execute(
            'SELECT department, SUM(salary) FROM employees WHERE department = ? GROUP BY department',
            ['Engineering'])
        self.assertEqual(result.rows, [['Engineering', 200000]])

    def test_crud_and_returning(self):
        result = self.engine.execute(
            'INSERT INTO employees VALUES (?, ?, ?, ?)', [5, "O'Brien", 'Sales', 70000])
        self.assertEqual(result.affected_rows, 1)
        self.assertTrue(self.engine.execute('UPDATE employees SET salary = 71000 WHERE id = 5').success)
        self.assertEqual(self.engine.execute('SELECT salary FROM employees WHERE id = 5').rows, [[71000]])
        self.assertEqual(self.engine.execute('DELETE FROM employees WHERE id = 5').affected_rows, 1)

    def test_sql_errors_and_recovery(self):
        for sql, params in [('SELEC * FROM employees', ()),
                            ('SELECT * FROM missing', ()),
                            ('SELECT ?', ()),
                            ('SELECT 1; SELECT 2', ())]:
            with self.subTest(sql=sql):
                result = self.engine.execute(sql, params)
                self.assertFalse(result.success)
                self.assertTrue(result.error)
        self.assertTrue(self.engine.execute('SELECT 1').success)

    def test_constraint_rollback(self):
        result = self.engine.execute('UPDATE employees SET salary = -1')
        self.assertFalse(result.success)
        self.assertEqual(self.engine.execute('SELECT SUM(salary) FROM employees').rows, [[355000]])

    def test_empty_results(self):
        result = self.engine.execute('SELECT name FROM employees WHERE id = -1')
        self.assertEqual(result.columns, ['name'])
        self.assertEqual(result.rows, [])
        self.assertEqual(result.row_count, 0)

    def test_disk_persistence_and_close(self):
        with tempfile.TemporaryDirectory() as folder:
            database = Path(folder) / 'sample.db'
            with SQLiteEngine(database) as engine:
                engine.create_sample_database()
                engine.execute('UPDATE employees SET salary = 1 WHERE id = 1')
            with self.assertRaises(sqlite3.ProgrammingError):
                engine.connection.execute('SELECT 1')
            with SQLiteEngine(database) as reopened:
                reopened.create_sample_database()
                self.assertEqual(reopened.execute('SELECT salary FROM employees WHERE id = 1').rows, [[1]])

    def test_cli(self):
        root = Path(__file__).resolve().parents[1]
        for arguments, code in [(['--init'], 0),
                                (['--query', 'SELEC 1'], 1),
                                (['--params', '{}'], 1),
                                (['--params', '[{}]'], 1),
                                (['--query', "SELECT x'CAFE'"], 0)]:
            result = subprocess.run(
                [sys.executable, str(root / 'main.py'), '--database', ':memory:'] + arguments,
                capture_output=True, text=True)
            self.assertEqual(result.returncode, code, result.stderr)
            self.assertEqual(json.loads(result.stdout)['success'], code == 0)


if __name__ == '__main__':
    unittest.main()
