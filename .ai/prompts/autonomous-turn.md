# Autonomous Turn Prompt

You are the main Codex integrator for netssh.

Read:

- `AGENTS.md`
- `.ai/product-vision.md`
- `.ai/agents.md`
- `.ai/backlog.md`
- `.ai/iteration-rules.md`

Then execute one small iteration.

## Required Flow

1. Select one unchecked backlog item that is small, valuable, and independently testable.
2. Decide whether sub-agents are useful.
3. If using sub-agents, assign each one a concrete role and disjoint scope.
4. Implement or integrate the selected task.
5. Run `tools\ai-loop\run-validation.ps1`.
6. Update `.ai/backlog.md`.
7. Write a checkpoint report under `.ai/reports/`.

## Constraints

- Do not modify unrelated files.
- Do not revert user changes.
- Do not persist passwords, passphrases, or private key contents in frontend state.
- Keep Windows Infra + Network workflows first-class.
- Treat `.ssh/config` import and serial console support as product priorities.
