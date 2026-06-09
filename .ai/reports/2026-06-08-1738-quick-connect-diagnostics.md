# Iteration Report: Quick Connect Error Diagnostics

## Backlog Item

- Phase 1: Improve quick connect error diagnostics for DNS, route, port, auth, and key-passphrase failures.

## Changes

- Extracted SSH connection error classification into `describeConnectionError`.
- Improved user-facing diagnostics for DNS resolution, route unavailability, refused ports, timeouts, authentication failures, and encrypted/private-key passphrase failures.
- Kept host-key TOFU errors separate from transport and auth errors.
- Added focused tests for representative backend error strings.

## Files

- `src/pages/TerminalPane.tsx`
- `src/test/terminal-errors.test.ts`
- `.ai/backlog.md`

## Validation

- `npm test -- --run src/test/terminal-errors.test.ts src/test/terminal-tofu.test.tsx`: passed.
- Full validation gate: passed. See `.ai/reports/2026-06-08-1738-validation.md`.
