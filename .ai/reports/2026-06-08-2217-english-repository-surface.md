# English Repository Surface

## Task

Remove Chinese text from the current repository surface so GitHub shows English-only tracked content and refreshed English commit labels for root files.

## Files Changed

- Root metadata and docs: `.gitignore`, `CLAUDE.md`, `README.md`, `index.html`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`
- Frontend UI and tests under `src/`
- Localization catalog `src/assets/i18n/zh.json`

## Changes

- Replaced Chinese comments, inline UI fallbacks, tooltips, and test descriptions with English.
- Replaced the `zh.json` catalog values with English strings while preserving the key set.
- Removed Chinese import column aliases and Chinese device-name heuristics.
- Added small English-only updates to root files whose GitHub file-list rows previously pointed at older Chinese commit messages.

## Validation

- `git grep -n -I -P "\p{Han}"`: no tracked text matches
- `npm run lint`: passed
- `npm test -- --run`: passed, 63 tests
- `npm run build`: passed, with existing large chunk warning
- `tools\ai-loop\run-validation.ps1`: passed
  - frontend lint: passed
  - frontend tests: passed
  - frontend build: passed
  - Rust tests: passed, 5 passed and 1 ignored keystore test

## Remaining Risk

Older Git commit history still contains Chinese commit subjects. Removing those from the GitHub commit history would require a separate history rewrite and force-push.
