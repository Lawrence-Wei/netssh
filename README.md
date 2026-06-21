# Netssh

[中文版本](README_ZH.md)

![Netssh app screenshot](docs/assets/netssh-app-screenshot.png)

**Netssh** is a local-first Windows SSH, serial console, and infrastructure asset workbench for network engineers, infra engineers, SREs, ops teams, IT admins, and lab users.

It is built for daily connection work: find the right device, inspect its metadata, connect safely, and keep credentials local.

Current version: **1.1.18**

---

## Highlights

- **Asset inventory** for servers, switches, routers, firewalls, NAS devices, PVE nodes, Docker hosts, SBCs, PCs, Macs, and cloud instances.
- **SSH and serial profiles** with a focused editor for the required connection fields first, then advanced metadata below.
- **Sidebar-first workflow** with sites/groups, search, favorites, recent hosts, manual ordering, and topology sync.
- **Tabbed terminal workspace** with SSH, local shells, serial sessions, and up to four-pane split view.
- **Safe host key handling** with user-confirmed TOFU and mismatch blocking.
- **Local credential boundary** using the OS credential manager/keyring instead of storing passwords in app state.
- **Bilingual UI** with English and Chinese support.
- **Four themes**: Aurora Purple, Cobalt Blue, Windows Mica, and Daylight.
- **AI-assisted QA rails** with an automated click audit that produces reproducible bug reports.

---

## Installation

Download the latest Windows installer from [GitHub Releases](https://github.com/team-gabage/netssh/releases).

Recommended packages:

- **NSIS installer** - best for most Windows users.
- **MSI package** - useful for enterprise deployment and managed environments.

Release artifacts are stored under:

```text
releases/vMAJOR.MINOR.PATCH/
```

---

## Quick Start

### 1. Add a Host

Click **Add host** in the left sidebar and fill in the required connection fields.

| Field | Description |
|---|---|
| Alias | Display name, for example `core-switch` or `pve-lab` |
| Connection type | SSH or Serial |
| Hostname / Port | SSH target, for example `192.168.1.1:22` |
| User | SSH login user, for example `root` or `admin` |
| Serial profile | COM port, baud rate, data bits, parity, stop bits, flow control, and line ending |
| Site / Group | Inventory grouping for location, network, lab, or cloud scope |
| Role / Tags / Notes | Optional metadata for filtering and operations context |

Netssh currently supports:

- **SSH** - remote terminal sessions.
- **Serial** - COM-port console sessions for switches, routers, OpenWRT/Linux SBCs, and generic devices.

### 2. Connect

- **Single-click** a host to open its detail panel.
- **Double-click** a host to connect immediately.
- **Right-click** a host for connect, edit, favorite, move, and delete actions.
- Use **New tab** for one-off manual connections without saving a host.

On first connection, Netssh shows a host-key challenge. Verify the fingerprint before trusting it. If a known host key changes, the connection is blocked.

### 3. Import Existing Hosts

Use **Import** to preview and import from:

- `~/.ssh/config` in read-only mode.
- Excel / XLSX files.
- JSON files.
- CSV files.

The import preview reports duplicates, missing identity files, duplicate hostnames, and other diagnostics before writing anything into Netssh.

---

## Core Features

### Asset Management

- Site/group buckets with local, cloud, and hybrid deployment scope.
- Favorites, recent connection timestamps, tags, roles, notes, and manual ordering.
- Device metadata and icon hints for Ubuntu, Debian, Windows, Raspberry Pi, Proxmox, OpenWRT, Huawei, Cisco, NAS devices, and more.
- SSH config alias preservation, including multi-alias `Host` entries.

### Terminal Workbench

- SSH sessions powered by Rust `russh`.
- Local PowerShell, CMD, WSL, and custom shell support through Windows ConPTY.
- Serial backend with presets for Cisco, Huawei, H3C, OpenWRT/Linux SBC, and generic consoles.
- Multi-tab workspace and quad split mode.
- Session rail, status strip, terminal font controls, cursor controls, locale/timezone preferences, and snippets.

### Safety and Privacy

- Passwords, passphrases, and private keys are never persisted in frontend state.
- Credentials are stored through the OS credential manager/keyring.
- Netssh-trusted host keys are stored in local SQLite, not in the user's OpenSSH files.
- SSH config import is read-only unless the user explicitly chooses an import action.
- Host key mismatch blocks the connection.
- Operation logs do not record command text.
- Dangerous command confirmation is available for high-risk operations.

### Appearance

- Aurora Purple, Cobalt Blue, Windows Mica, and Daylight themes.
- English and Chinese UI.
- Windows acrylic/translucency controls.
- Configurable terminal font, font size, cursor style, cursor blinking, scrollback, copy-on-select, and right-click paste.

---

## Development

Prerequisites:

- Windows 10 or Windows 11
- Node.js and npm
- Rust toolchain
- Tauri prerequisites for Windows

Install dependencies:

```powershell
npm install
```

Run the frontend dev server:

```powershell
npm run dev
```

Run the Tauri app in development:

```powershell
npm run tauri:dev
```

Run the standard validation gate:

```powershell
tools\ai-loop\run-validation.ps1
```

Useful focused commands:

```powershell
npm run lint
npm test -- --run
npm run build
cargo test --manifest-path src-tauri\Cargo.toml
```

Build release installers:

```powershell
npm run tauri:build
```

---

## AI Click Audit

Netssh includes an automated frontend click audit for catching interaction regressions and producing AI-readable bug reports.

Run a quick audit:

```powershell
npm run test:e2e:click-audit -- -MaxClicks 80
```

The audit:

- Builds and launches a private browser preview.
- Uses a temporary browser profile.
- Seeds non-sensitive test hosts.
- Clicks visible interactive nodes.
- Captures runtime errors, browser console errors, app-shell health failures, click failures, screenshots, and action traces.
- Writes Markdown and JSON reports to `.ai/reports/`.

This gives AI agents concrete reproduction evidence instead of vague "the UI feels broken" reports.

---

## System Requirements

| Item | Minimum |
|---|---|
| OS | Windows 10 / Windows 11 |
| Architecture | x64 |
| Runtime | Microsoft Edge WebView2 Runtime |
| Network | Required only for remote connections and package downloads |

Netssh is Windows-first. Tauri bundle targets for other platforms may exist in configuration, but the current product experience is designed and validated primarily for Windows operators.

---

## Project Direction

Netssh is not a generic chat terminal or a marketing shell. The goal is a practical operations workbench for infrastructure and network assets:

- local-first inventory
- fast, safe connections
- private credential handling
- SSH config compatibility
- serial console workflows
- repeatable validation and AI-assisted bug hunting
