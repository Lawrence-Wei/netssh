# Netssh

[中文版本](README_ZH.md)

![Netssh app screenshot](docs/assets/netssh-app-screenshot.png)

**Netssh** is a Windows desktop SSH & serial console workstation for ops, network engineers, SREs, and IT admins. Manage your assets locally and connect to devices fast.

---

## Installation

Current release: **Latest**

Download from [GitHub Releases](https://github.com/team-gabage/netssh/releases):

- **NSIS installer** (recommended) — best for most Windows users
- **MSI package** — suited for enterprise deployment

If you use the npm package, install the latest tagged release:

```bash
npm install @lawrence-wei/netssh@latest --registry=https://npm.pkg.github.com
```

You can also omit `@latest` because npm defaults to that tag:

```bash
npm install @lawrence-wei/netssh --registry=https://npm.pkg.github.com
```

---

## Quick Start

### 1. Add a Host

Click **"+ New host"** at the bottom of the left panel and fill in connection details:

| Field | Description |
|-------|-------------|
| Alias | Display name, e.g. "core-switch" |
| Hostname | IP address or domain, e.g. `192.168.1.1` |
| User | SSH login username, e.g. `root` |
| Port | SSH port, default `22` |
| Site | Site group (e.g. Shanghai, Cloud) for organization |
| Notes | Free-form notes |

Click **Save**. Two connection types are supported:

- **SSH** — standard remote connection
- **Serial** — console access via COM port for switches/routers

### 2. Connect to a Host

- **Single-click** a host in the sidebar → detail panel on the right
- **Double-click** a host → open SSH connection immediately
- **Right-click** a host → connect, edit, favorite, delete, and more

On first connection to a host, a host-key confirmation dialog appears — verify the fingerprint before trusting.

### 3. Import from SSH Config

Click **"Import config"** at the bottom left, then choose **"Read ~/.ssh"** to bulk-import hosts from your `~/.ssh/config`. Excel, JSON, and CSV files are also supported.

A preview with diagnostics (duplicates, missing keys) is shown before anything is written.

### 4. Manual Connect (one-off)

Don't want to save a host? Use the manual connect panel — enter IP/hostname, port, username, and password to open a one-off SSH session without adding it to your inventory.

---

## Features

### Host Management
- **Site groups** — organize hosts by location or purpose (Shanghai, Cloud, Homelab, etc.)
- **Tags & favorites** — mark commonly used hosts for quick filtering
- **Search & filter** — search by alias, IP, or tag; filter by All / Favorites / Recent
- **SSH config import** — read-only import from `~/.ssh/config`; never modifies the original file

### Terminal Sessions
- **Multi-tab** — open multiple SSH / local shell tabs simultaneously
- **Quad split** — split the terminal area into up to 4 panes
- **Local shell** — embedded PowerShell, CMD, or WSL via Windows ConPTY
- **Command snippets** — preloaded useful commands (system, network, Docker, monitoring); drag or double-click to run
- **Status bar** — shows latency, cipher, session uptime per connection

### Security
- **Credential protection** — passwords and key passphrases are stored in Windows Credential Manager / keyring, never in local files
- **Host key verification** — TOFU (Trust On First Use) confirmation required; mismatched keys block the connection
- **No command logging** — operation logs exclude user command text

### Appearance & Preferences
- **Themes** — Aurora Purple, Cobalt Blue, Windows Mica
- **Language** — English / Chinese UI switch; terminal LC_ALL/LANG follows
- **Acrylic translucency** — follows your Windows transparency preference
- **Font & cursor** — customizable terminal font, size, and cursor style

---

## System Requirements

| Item | Minimum |
|------|---------|
| OS | Windows 10 / Windows 11 |
| Architecture | x64 or ARM64 |
