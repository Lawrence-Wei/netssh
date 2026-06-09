# Iteration Report: Missing IdentityFile Diagnostics

## Backlog Item

- Phase 1: Add diagnostics for missing identity files.

## Changes

- Added asynchronous `IdentityFile` existence checks during import preview.
- Warn when an imported SSH config references an `IdentityFile` path that is missing.
- Warn separately when the frontend cannot check a path, so import preview remains non-blocking.
- Added a focused component test for missing SSH identity diagnostics.

## Files

- `src/pages/ImportDialog.tsx`
- `src/test/import-diagnostics.test.tsx`
- `.ai/backlog.md`

## Validation

- `npm test -- --run src/test/import-diagnostics.test.tsx`: passed.
- Full validation gate: passed. See `.ai/reports/2026-06-08-1728-validation.md`.
