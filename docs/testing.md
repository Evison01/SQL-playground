# Release verification

Run from the repository root:

```sh
npm run setup
npm test
python3 -m unittest discover -s tests -v
npm run build
npm run preview
```

## Automated checks

- Browser SQLite: seeds, joins, duplicate column names, empty results, NULL values,
  CRUD, unusual table names, schema refresh, SQL errors, foreign keys, result limits.
- Worker protocol: each dataset's example queries, snapshot reopen, foreign keys
  after export, partial batch failures, complete transactions, and explicit rollback
  of unfinished transactions.
- IndexedDB: close/reopen, snapshot bytes, isolated workspaces, saved queries, failed
  history entries, rename/delete/clear operations, 100-entry cap and storage failures.
- Export/import: database bytes and library round trip, fresh imported IDs, oversized
  and invalid backups, corrupt header rejection, and CSV escaping.
- Python CLI: sample initialization, parameter binding, CRUD, aggregation, rollback,
  errors/recovery, file persistence, cleanup, JSON output and exit codes.

GitHub Actions runs all of these with `npm ci` and multiple Python versions. It
builds the production app and retains its static output as a downloadable artifact.

## Browser acceptance checklist

Use an isolated local preview origin so tests do not modify an existing workspace.

1. Run a sample query. Verify row values and headers; run a syntax error and recover.
2. Create a Bookstore workspace. Run its join and revenue examples.
3. Edit a draft and immediately switch away/back; verify it is retained.
4. Create a table and row, save a named query, and reload. Verify data/library/history.
5. Export a workspace backup; import it and confirm a new independent workspace.
6. Download a CSV and inspect headings and quoted values.
7. Open another tab at the same origin; verify the second tab blocks editing.
8. Run a recursive query beyond five seconds; reopen and verify last snapshot recovery.
9. Run `BEGIN; INSERT ...` without COMMIT; verify explicit rollback and unchanged data.
10. At narrow and wide viewport sizes, verify readable controls, keyboard focus,
    scrolling results, and accessible labels.

A worker timeout cannot enforce a hard memory budget. Unit tests do not replace
real-browser layout and worker/WASM checks. CI has no browser-automation job; manual
browser verification is recorded when performing release checks.

## Verified for the 1.0.0 release

Local production-preview checks confirmed Bookstore joins/revenue, CSV download
(with inspected contents), IndexedDB recovery from existing Phase 3 records, immediate
draft switching, separate workspace creation, JSON import, explicit open-transaction
rollback, five-second timeout and reopen recovery, second-tab blocking, rename,
saved-query creation, and desktop/mobile layouts without page overflow.
The automated suite has 12 web tests and 8 Python tests.
