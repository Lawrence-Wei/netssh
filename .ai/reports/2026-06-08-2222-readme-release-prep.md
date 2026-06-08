# README and Release Preparation

## Task

Update the GitHub README and prepare the current Windows application for a GitHub Release.

## Files Changed

- `README.md`
- `src-tauri/tauri.conf.json`

## Changes

- Replaced the prototype handoff README with current product, security, development, build, and release guidance.
- Documented the `v0.0.7` release and expected Windows installer artifacts.
- Limited the Windows MSI bundle language list to `en-US`.

## Validation

- `tools\ai-loop\run-validation.ps1`: passed
  - frontend lint: passed
  - frontend tests: passed, 63 tests
  - frontend build: passed, with the existing large chunk warning
  - Rust tests: passed, 5 passed and 1 ignored keystore test

## Next Step

Run `npm run tauri:build` and upload the generated Windows installer artifacts to GitHub Releases as `v0.0.7`.
