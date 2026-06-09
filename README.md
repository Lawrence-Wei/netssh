# Netssh

Netssh is a local-first Windows SSH and serial console workstation for infrastructure, network, SRE, ops, IT admin, and lab users.

It is an asset and connection workbench, not a generic chat terminal or a marketing shell. The app is designed around daily network operations: find an asset, inspect its metadata, connect safely, and keep credentials private on the local machine.

![Netssh app screenshot](docs/assets/netssh-app-screenshot.png)

## Current Release

Latest release: `v0.0.7`

Download the Windows installers from GitHub Releases:

- NSIS setup: best default installer for most Windows users
- MSI package: useful for managed installation workflows

## What Works

- Asset inventory with sites, groups, tags, aliases, notes, and favorites
- Read-only SSH config import from `~/.ssh/config`
- Import preview and diagnostics before hosts are added
- Duplicate alias and duplicate target diagnostics
- Missing identity file diagnostics
- Quick SSH connection tabs backed by Tauri and Rust
- Local shell tabs through Windows ConPTY
- Unknown host key TOFU confirmation before trust is stored
- Host key mismatch blocking with high-risk warning behavior
- Netssh-managed trusted host keys stored in local SQLite
- Favorites and recent connection timestamps
- Connection error explanations for DNS, routing, port, auth, and key passphrase failures
- Command snippets and per-host quick command surfaces
- English-only repository surface and GitHub documentation

Serial console profile foundations are present in the data model. Live serial backend support is still planned work.

## Security Model

- Passwords, passphrases, private keys, and ephemeral passwords must not be persisted in frontend state or local storage.
- Credentials are stored through the operating system credential manager / keyring.
- SSH config import is read-only unless the user explicitly confirms writes.
- Netssh does not silently modify OpenSSH `known_hosts`.
- Unknown host keys require user-confirmed TOFU.
- Host key mismatches block the connection.
- Netssh-trusted host keys are stored in local SQLite, not in the user's OpenSSH files.
- Logs must not record user command text.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Zustand, xterm.js
- Desktop shell: Tauri 2
- Backend: Rust
- SSH: `russh`
- Local PTY: `portable-pty` / Windows ConPTY
- Storage: SQLite through `rusqlite`
- Credentials: OS keyring through `keyring`
- Tests: Vitest, React Testing Library, Rust unit tests

## Repository Layout

```text
src/
  api/          Tauri API wrappers
  assets/       CSS and localization catalogs
  components/   Shared React components
  config/       Types and defaults
  hooks/        React hooks
  layouts/      App shell layouts
  pages/        Main app pages and panes
  store/        Zustand state stores
  test/         Frontend tests and mocks
  utils/        Shared frontend utilities

src-tauri/src/
  commands.rs     Thin Tauri command handlers
  credentials.rs  OS credential manager integration
  pty.rs          Local PTY sessions
  ssh.rs          SSH session handling and host key checks
  ssh_config.rs   OpenSSH config parsing
  storage.rs      SQLite app state and host key storage

.ai/
  Product vision, backlog, iteration rules, and checkpoint reports

tools/
  Validation and development helper scripts
```

## Development

Use npm for frontend package management.

```powershell
npm install
npm run dev
npm test -- --run
npm run build
```

Run the full validation gate before publishing development work:

```powershell
tools\ai-loop\run-validation.ps1
```

The validation gate runs:

- `npm run lint`
- `npm test -- --run`
- `npm run build`
- `cargo test --manifest-path src-tauri\Cargo.toml`

## Desktop Build

Build the Windows desktop application with:

```powershell
npm run tauri:build
```

Successful Windows builds create installer artifacts under:

```text
src-tauri/target/release/bundle/
```

Expected bundle outputs include NSIS and MSI installers when the required Windows build tooling is installed.
