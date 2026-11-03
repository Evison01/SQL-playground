"""Command-line entry point for the Phase 1 SQLite engine."""
import argparse
import json
import sqlite3
import sys
from engine import SQLiteEngine


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', default='sample.db', help='SQLite file or :memory:')
    parser.add_argument('--init', action='store_true', help='Create and seed the employees table')
    parser.add_argument('--query', help='Execute one SQL statement and print JSON')
    parser.add_argument('--params', default='[]', help='JSON array of positional query parameters')
    args = parser.parse_args()
    try:
        parameters = json.loads(args.params)
        if not isinstance(parameters, list):
            raise ValueError('--params must be a JSON array')
        if any(not isinstance(value, (str, int, float, type(None))) for value in parameters):
            raise ValueError('--params values must be strings, numbers, booleans, or null')
        with SQLiteEngine(args.database) as engine:
            if args.init:
                engine.create_sample_database()
            result = engine.execute(
                args.query if args.query is not None else 'SELECT * FROM employees ORDER BY id',
                parameters,
            )
            # SQLite BLOB values use an explicit hex representation in JSON.
            print(json.dumps(result.to_dict(), indent=2,
                             default=lambda value: {'hex': value.hex()}))
            return 0 if result.success else 1
    except (sqlite3.Error, ValueError, TypeError, OverflowError) as error:
        print(json.dumps({'success': False, 'error': str(error)}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
