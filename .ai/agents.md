# netssh Multi-Agent Operating Manual

This file defines how Codex should run multi-agent development for netssh.

## Command Model

One main Codex thread acts as the owner of the working tree. Sub-agents may analyze, plan, or implement scoped work, but the main Codex thread is responsible for review, validation, and checkpointing.

## Roles

### Main Codex / Integrator

Responsibilities:

- Read `AGENTS.md`, `.ai/product-vision.md`, `.ai/backlog.md`, and `.ai/iteration-rules.md`.
- Select one small iteration goal.
- Spawn sub-agents only for independent, bounded work.
- Keep the critical path local when waiting would block progress.
- Review all sub-agent outputs before accepting them.
- Run the validation gate.
- Update `.ai/backlog.md` and write a checkpoint report.

### Planner

Responsibilities:

- Select the next smallest valuable backlog item.
- Split work into disjoint file ownership.
- Define acceptance criteria.
- Avoid broad rewrites.

### Frontend Worker

Responsibilities:

- Own React, Zustand, CSS, and frontend API wrapper changes.
- Avoid editing Rust files unless explicitly assigned.
- Preserve Windows operator workflows.
- Keep visible strings localizable when practical.

Typical write scope:

- `src/config/**`
- `src/api/**`
- `src/store/**`
- `src/pages/**`
- `src/components/**`
- `src/layouts/**`
- `src/assets/**`
- `src/test/**`

### Rust Backend Worker

Responsibilities:

- Own Tauri commands, Rust modules, storage, SSH, PTY, serial, and credentials.
- Keep command surfaces thin and typed.
- Avoid editing React files unless explicitly assigned.

Typical write scope:

- `src-tauri/src/**`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`

### Reviewer

Responsibilities:

- Read-only review unless explicitly assigned a patch.
- Prioritize security, data loss, broken workflows, and missing tests.
- Check that changes align with Infra + Network product direction.

### Evaluator

Responsibilities:

- Run the validation gate.
- Summarize failures with exact commands and likely owners.
- Never hide failing commands.

## Parallelism Rules

- Spawn sub-agents only when the user explicitly asks for sub-agents or parallel work.
- Give each coding worker a disjoint write set.
- Prefer read-only explorers for uncertain architecture or security questions.
- Do not ask two agents to solve the same task.
- Do not let workers merge or checkpoint directly.
- Main Codex makes the final decision.

## Validation Gate

```powershell
tools\ai-loop\run-validation.ps1
```

The script must run:

- `npm run lint`
- `npm test -- --run`
- `npm run build`
- `cargo test --manifest-path src-tauri\Cargo.toml`

## Checkpoint Output

Each iteration writes:

- `.ai/reports/YYYY-MM-DD-HHMM.md`
- updated `.ai/backlog.md`

Reports should include:

- task
- files changed
- validation results
- sub-agent summaries
- next recommended task
