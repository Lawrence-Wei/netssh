# Autonomous Iteration Rules

Each Codex iteration must work like a small engineering change, not an open-ended rewrite.

## Required Context

Before changing code, read:

- `AGENTS.md`
- `.ai/product-vision.md`
- `.ai/backlog.md`
- This file

## Work Rules

- Pick one small task from `.ai/backlog.md`.
- Keep changes scoped to the task.
- Do not delete or revert user changes.
- Prefer existing React, Zustand, Tauri, and Rust module patterns.
- Keep passwords, passphrases, and private keys out of persisted frontend state.
- Keep Windows user habits in mind: `.ssh/config`, OpenSSH keys, COM ports, PuTTY-style expectations, and right-click workflows.

## Validation Gate

Run these before considering a task complete:

```powershell
npm run lint
npm test -- --run
npm run build
cargo test --manifest-path src-tauri\Cargo.toml
```

If any command fails, fix the failure or write the blocker into `.ai/reports/`.

## Checkpoint Rules

- Record what changed and what passed in `.ai/reports/YYYY-MM-DD-HHMM.md`.
- Keep failed experiments documented instead of hiding them.
- Do not merge or preserve a change that fails the validation gate unless the report clearly marks it as blocked.
