# Click Audit Rails

## Task

Add an automated frontend click audit that lets AI discover reproducible click/runtime issues before fixing them.

## Files Changed

- `scripts/click-audit.ps1`
- `scripts/click-audit.ts`
- `package.json`
- `scripts/e2e-browser.ts`
- `.ai/backlog.md`

## Result

- Added `npm run test:e2e:click-audit`.
- The command builds the browser preview, starts a private Vite preview server, launches Edge with a temporary profile, seeds non-sensitive audit hosts, clicks visible interactive nodes, and writes Markdown/JSON reports under `.ai/reports`.
- The click audit records runtime errors, browser console errors, click failures, app-shell health failures, screenshots, and action traces.
- Confirmation overlays are cancelled automatically so expected unsaved-change prompts do not cascade into false positives.

## Validation

- `npm run test:e2e:click-audit -- -MaxClicks 30`: passed, 30 actions, 0 findings.
- `tools\ai-loop\run-validation.ps1`: passed.
- `npm run tauri:build`: passed.
- Local install: passed; relaunched `C:\Users\lawrence\AppData\Local\Netssh\Netssh.exe`.

## Next Recommended Task

Expand the audit with right-click/context-menu paths and a targeted host-editor form-fuzz pass.
