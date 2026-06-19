# netssh Agent Instructions

## Package Manager
Use **npm**.

```powershell
npm install
npm run dev
npm test -- --run
npm run build
```

## Project Context
`netssh` is a local-first Windows SSH / Serial Console workstation for Infra, Network, SRE, Ops, IT Admin, and lab users.

Do not turn this project into a generic chat terminal or marketing page. It is an asset and connection workbench for daily network and infrastructure operations.

## Project Structure
- `src/`: frontend UI, routes, components, styles, state management, and Tauri API wrappers
- `src-tauri/src/`: backend business logic, Tauri commands, SSH/PTTY/Serial/Storage/Credential services
- `src-tauri/src/storage.rs`: local database, SQLite, and app state storage logic
- `src/test/`: frontend unit tests, component tests, and smoke tests
- `src-tauri/src/*` tests: Rust parser, security logic, argument conversion, and service tests
- `.ai/`: product vision, backlog, iteration rules, multi-agent rules, and checkpoint reports
- `tools/`: validation, build helper, and development scripts
- `releases/`: versioned release packages, release notes, and archived artifacts

## Build Artifacts
- Put all compiled, packaged, installer, and release outputs under `D:\projects\netssh\releases`.
- Do not commit generated binaries, installers, archives, or other build outputs; keep them ignored by `.gitignore`.

## Required References
Before autonomous iterations, read:
- `.ai/product-vision.md`
- `.ai/agents.md`
- `.ai/backlog.md`
- `.ai/iteration-rules.md`

## Security Boundaries
- Never persist passwords, passphrases, private keys, or `ephemeralPassword` in frontend state/storage.
- Credentials must use OS Credential Manager / keyring.
- Do not silently modify `~/.ssh/config` or OpenSSH `known_hosts`.
- SSH config import is read-only unless the user explicitly confirms writes.
- Unknown host keys require user-confirmed TOFU.
- Host key mismatch must block connection and show a high-risk warning.
- Store netssh-trusted host keys in local SQLite, not user OpenSSH files.
- Logs must not record user command text.

## Conventions
- Keep Tauri command handlers thin; place business logic in Rust modules.
- Frontend calls backend only through `src/api/tauri.ts`.
- Keep config, user-facing text, constants, and business logic separated.
- UI text belongs in `src/assets/i18n/en.json` and `src/assets/i18n/zh.json`; keep keys aligned.
- Add tests for security logic, parsers, imports, connection behavior, and bug fixes.
- Avoid unrelated refactors and do not revert user changes unless explicitly requested.

## Versioning
- Use SemVer with tags in the form `vMAJOR.MINOR.PATCH`.
- MAJOR: breaking changes, incompatible API changes, or major architecture changes.
- MINOR: backward-compatible feature additions.
- PATCH: backward-compatible bug fixes and small optimizations.
- Package versions in `package.json` and `src-tauri/Cargo.toml` keep `MAJOR.MINOR.PATCH` format (without `v`).
- Release workflows must be triggered from tags matching `v*` (for example, `v0.1.0`).

## File-Scoped Commands
| Task | Command |
|------|---------|
| Lint frontend | `npm run lint` |
| Test frontend file | `npm test -- --run path/to/file.test.tsx` |
| Build/typecheck frontend | `npm run build` |
| Test Rust | `cargo test --manifest-path src-tauri/Cargo.toml` |

## Validation Gate
Before marking development work complete, run:

```powershell
tools\ai-loop\run-validation.ps1
```

## Local Install Gate
After any Netssh code/UI/backend/test change passes validation and `npm run tauri:build` succeeds, automatically install and relaunch the freshly built app on this Windows machine unless the user explicitly says not to install:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File C:\Users\lawrence\.agents\skills\netssh-auto-install\scripts\install-netssh.ps1 -RepoRoot D:\projects\netssh
```

Use the installer under `D:\projects\netssh\releases\vMAJOR.MINOR.PATCH\nsis`. This replaces the previously installed local Netssh app for user `lawrence` and starts the new `Netssh.exe`.

## Final Response
For development tasks, include:
- What changed
- Key files
- Validation result
- Remaining risks or next step

## Commit Attribution
AI commits MUST include:

```text
Co-Authored-By: <agent name> <agent email>
```
