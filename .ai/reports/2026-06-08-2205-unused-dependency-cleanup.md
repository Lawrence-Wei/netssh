# Unused Dependency Cleanup

## Task

Remove frontend packages and test mocks that are not referenced by the netssh app.

## Files Changed

- `package.json`
- `package-lock.json`
- `src/test/setup.ts`

## Changes

- Removed unused frontend npm dependencies:
  - `@tauri-apps/plugin-os`
  - `@tauri-apps/plugin-shell`
  - `@xterm/addon-search`
- Removed matching Vitest mocks for those packages.
- Kept Rust-side Tauri plugin dependencies because `src-tauri/src/lib.rs` still registers them.

## Validation

- `npm run lint`: passed
- `npm test -- --run`: passed, 63 tests
- `npm run build`: passed, with existing Vite chunk-size warning
- `tools\ai-loop\run-validation.ps1`: passed
  - frontend lint: passed
  - frontend tests: passed
  - frontend build: passed
  - Rust tests: passed, 5 passed and 1 ignored keystore test

## Notes

- Existing working tree changes in `tools/ai-loop/run-validation.ps1` and older untracked reports were left untouched.
- Remaining visible risk is the existing large frontend chunk warning; this cleanup did not address code splitting.
