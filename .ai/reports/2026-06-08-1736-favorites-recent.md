# Iteration Report: Favorites and Recent Connections

## Backlog Item

- Phase 1: Add favorites and recent connection timestamps.

## Changes

- Added `favorite` and `lastConnectedAt` host metadata.
- Added store actions to toggle favorites and mark a host as connected.
- Mark managed hosts as recently connected when opened or reconnected from the main app flow.
- Added a Favorites sidebar filter and changed Recent to use real connection timestamps.
- Added recent connection chips in the sidebar and real last-connected text in host detail.
- Added right-click favorite/unfavorite action and row-level favorite toggle.

## Files

- `src/config/types.ts`
- `src/store/hosts.ts`
- `src/pages/App.tsx`
- `src/layouts/Sidebar.tsx`
- `src/layouts/ContextMenu.tsx`
- `src/layouts/Workspace.tsx`
- `src/pages/HostDetail.tsx`
- `src/assets/app.css`
- `src/assets/i18n/en.json`
- `src/assets/i18n/zh.json`
- `src/test/host-metadata.test.tsx`
- `src/test/smoke.test.tsx`
- `.ai/backlog.md`

## Validation

- `npm test -- --run src/test/host-metadata.test.tsx src/test/smoke.test.tsx`: passed.
- Full validation gate: passed. See `.ai/reports/2026-06-08-1736-validation.md`.
