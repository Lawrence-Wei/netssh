# Manual Host Ordering

## Task

Add a user-facing way to arrange host nodes up and down, and make the home topology follow the same order.

## Files Changed

- `src/layouts/Sidebar.tsx`
- `src/pages/App.tsx`
- `src/assets/app.css`
- `src/assets/i18n/en.json`
- `src/assets/i18n/zh.json`
- `src/test/host-metadata.test.tsx`
- `src/test/smoke.test.tsx`
- `.ai/backlog.md`

## Validation

- `npm test -- --run src/test/host-metadata.test.tsx`: passed
- `npm test -- --run src/test/smoke.test.tsx`: passed
- `tools\ai-loop\run-validation.ps1`: passed
- `npm run tauri:build`: passed; artifacts copied to `releases\v1.1.18`

Local install: passed; launched `Netssh.exe` as PID 23364.

## Notes

- Sidebar host rows now expose hover/focus up and down controls.
- Drag-and-drop reorder math now handles top and bottom insertion.
- Home topology receives the same sorted host list as the sidebar.
