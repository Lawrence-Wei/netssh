# Netssh — Windows SSH Manager

> Personal SSH / device management app for Windows 11. Tauri 2 + React + xterm.js.
> This package is the **engineering handoff** for the prototype at `../Netssh Prototype.html`.

---

## 1 · What this is

A modern Windows desktop SSH client inspired by **Termius**, **MobaXterm**, **Xshell**, and **Windows Terminal**. The prototype defines the UX, this scaffold turns it real.

- **Source of truth for hosts:** the user's existing `~/.ssh/config`. Netssh imports, never silently writes.
- **Native shells:** PowerShell, Command Prompt, WSL, custom — opened via ConPTY.
- **Remote shells:** `russh` (pure-Rust SSH2 client) with key-based auth; passphrases held in Windows Credential Manager.
- **UI:** purple/blue/mica themes, frameless chrome, EN / 简体中文.

---

## 2 · MVP feature list (v0.1)

Ship-or-cut for the first release.

| Status | Feature |
|---|---|
| **MUST** | Import hosts from `~/.ssh/config` (read-only) |
| **MUST** | Sidebar host browser with groups, search, filter |
| **MUST** | Open SSH session in tab; xterm.js + ConPTY backend bridged via Tauri |
| **MUST** | Multiple tabs + the vertical session rail |
| **MUST** | Local shell tabs (PowerShell / CMD / WSL) |
| **MUST** | Theme switcher (purple / blue / Mica) |
| **MUST** | EN ↔ 简体中文 toggle, follows Windows system language on first launch |
| **MUST** | Credentials in Windows Credential Manager — never in plaintext |
| **MUST** | Right-click context menu on hosts (connect, pin, copy `ssh` cmd, edit) |
| SHOULD | Snippet library + per-host quick commands |
| SHOULD | Reconnect on transient failure |
| SHOULD | Connection log per session |
| COULD  | Split panes (horizontal / vertical) |
| COULD  | Port-forward configuration UI |
| WON'T (v0.1) | SFTP browser — design for it, ship in v0.2 |
| WON'T (v0.1) | Workspace save/restore — local-only autosave is fine for v0.1 |

---

## 3 · Tech stack & why

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri 2** (Rust + WebView2) | ~10 MB installer vs Electron's 100+ MB; native Win32 access; signed MSIX out of the box. |
| UI | **React 18** + **Vite** | Matches the prototype 1:1; fast HMR; mature ecosystem. |
| Styling | Hand-rolled CSS + design tokens | The aesthetic is opinionated — Tailwind would dilute it. Tokens live in `src/styles/tokens.css`. |
| Terminal | **xterm.js 5** + addons (`fit`, `web-links`, `search`, `webgl`) | The de-facto standard; supports OSC8 hyperlinks, search, GPU rendering. |
| Remote SSH | **russh** (pure Rust) | No native deps, no OpenSSH license entanglement, works inside the Tauri sidecar. |
| Local PTY | **portable-pty** (uses ConPTY on Win10+) | Production-tested by Wezterm. Handles ANSI, resize, signal forwarding. |
| Persistence | **rusqlite** (encrypted via SQLCipher) for metadata, **keyring-rs** for secrets | SQLite is overkill until host count > 50; switch to JSON file under `%APPDATA%\Netssh` if you prefer simpler. Credentials go to Windows Credential Manager via `keyring-rs`. |
| i18n | Native `t()` helper + JSON dictionaries | No `react-i18next` weight; we have ~80 keys. |

---

## 4 · UI / UX design plan

The prototype is the spec. Highlights:

- **Frameless window** with our own chrome (`<TitleBar>`). Draggable everywhere except controls. Min/max/close drawn as 38px square buttons on the right.
- **Sidebar** = MobaXterm-style left rail. Grouped collapsible host list with constellation hover effect. Search + chip filters at top. Snippets + Preferences entry at bottom.
- **Workspace** = main area. Three views depending on the active tab kind:
  - `host` + not connected → **HostDetail landing** (eyebrow labels, target card, quick commands, snippets preview)
  - `host` + connected → **Terminal pane** (conn-bar header, xterm host with per-host aurora hue, status strip)
  - `settings` / `snippets` → full-bleed routed pane
- **Session rail** (novelty) = vertical pill tabs on the right; each is a rotated alias + breathing latency dot. Click to switch sessions without disturbing the tab strip.
- **Context menu** = right-click any host. 12 actions, dividers, kbd shortcuts shown on the right.
- **Themes** swappable via Settings → Appearance OR via the Tweaks panel. Three: `purple` (Aurora), `blue` (Cobalt), `mica` (Windows-native restrained).

Eyebrow labels (uppercase 10px tracked-out Space Grotesk in `--text-eyebrow`) are used throughout — pre-section, in cards, as the only header on the session rail.

---

## 5 · Technical architecture

```
┌──────────────────────────────────────────────────────────┐
│                       WebView2 (UI)                       │
│  React 18 ▸ App.tsx ▸ TitleBar / Sidebar / Workspace      │
│  xterm.js ─── pty events ◄─┐                              │
│           └── input chars ─┼──── IPC bridge (Tauri)        │
└──────────────────────────────────┼────────────────────────┘
                                   │
┌──────────────────────────────────▼────────────────────────┐
│                    Tauri main process (Rust)              │
│  commands.rs ── ssh_open / ssh_send / pty_open / ...      │
│  ssh.rs       ◄── russh client per session                │
│  pty.rs       ◄── portable-pty (ConPTY)                    │
│  ssh_config.rs ── parse ~/.ssh/config (read-only)         │
│  credentials.rs ─ keyring-rs → Windows Credential Manager │
│  storage.rs   ── sqlite under %APPDATA%\Netssh\db.sqlite  │
└────────────────────────────────────────────────────────────┘
```

**Event channels:**
- `ssh://{session_id}/data` → bytes from remote → xterm.write
- `ssh://{session_id}/exit` → connection closed
- `pty://{session_id}/data` → same for local PTYs

**Command surface (frontend → Rust):**
```ts
ssh_open({ alias, host, user, port, identityFile }) → sessionId
ssh_send(sessionId, bytes)
ssh_resize(sessionId, cols, rows)
ssh_close(sessionId)

pty_open(shellId)  →  sessionId
pty_send(sessionId, bytes)
pty_resize(sessionId, cols, rows)

config_parse(path?)             → Host[]
config_write_block(alias, block) // ONLY after user confirms

shells_detect() → ShellInfo[]
keys_list()    → SshKey[]

cred_store(account, secret)      // → Credential Manager
cred_load(account)               // → Result<string>
cred_delete(account)
```

---

## 6 · Folder structure

```
netssh/
├─ README.md                      ← you are here
├─ ARCHITECTURE.md
├─ IMPLEMENTATION_PLAN.md
├─ TEST_PLAN.md
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
├─ index.html
├─ src/                           ← React frontend
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ types.ts
│  ├─ components/
│  │  ├─ TitleBar.tsx
│  │  ├─ Sidebar.tsx
│  │  ├─ SessionRail.tsx
│  │  ├─ ContextMenu.tsx
│  │  ├─ HostDetail.tsx
│  │  ├─ Terminal.tsx
│  │  ├─ Settings.tsx
│  │  └─ SnippetsLibrary.tsx
│  ├─ state/
│  │  ├─ hosts.ts        ← zustand store
│  │  ├─ sessions.ts
│  │  └─ settings.ts
│  ├─ services/
│  │  ├─ tauri.ts        ← typed wrappers over invoke()
│  │  ├─ ssh-config.ts
│  │  └─ i18n.ts
│  ├─ i18n/
│  │  ├─ en.json
│  │  └─ zh.json
│  └─ styles/
│     ├─ tokens.css
│     └─ themes.css
└─ src-tauri/                     ← Rust backend
   ├─ Cargo.toml
   ├─ tauri.conf.json
   ├─ build.rs
   └─ src/
      ├─ main.rs
      ├─ commands.rs       ← #[tauri::command]s
      ├─ ssh.rs            ← russh client + Channel manager
      ├─ pty.rs            ← portable-pty + ConPTY
      ├─ ssh_config.rs     ← ~/.ssh/config parser
      ├─ credentials.rs    ← keyring-rs wrappers
      └─ storage.rs        ← sqlite + migrations
```

---

## 7 · Theme & localization strategy

### Themes

CSS custom properties only. Switching theme = `document.documentElement.setAttribute('data-theme', id)`. No tree-shake, no FOUC.

```css
:root              { /* purple defaults */ }
[data-theme=blue]  { /* overrides */ }
[data-theme=mica]  { /* overrides */ }
```

Effects toggles (`translucency`, `reduceMotion`) apply additional classes on `<body>`. Translucency uses `backdrop-filter: blur()`; degrades gracefully when WebView2 has acrylic disabled.

### Localization

- **First launch:** call `i18n_detect_system()` (Rust → `windows::Globalization::Language`). Map `zh-CN/zh-Hans-CN/zh-SG` → `zh`, anything else → `en`.
- **Manual override:** writes to `localStorage["netssh.lang"]` and to the SQLite settings row. The local-storage copy is what loads instantly on next start.
- **Strings:** flat JSON dictionaries in `src/i18n/en.json` and `zh.json`. Lookup via `t(key, vars?)`. ALL visible strings are keyed — no hard-coded literals.
- **Terminal locale:** `LANG`/`LC_ALL` forwarded to remote sessions via the SSH `Env` request when supported (most distros allow `LANG`).

---

## 8 · Security considerations

| Surface | Treatment |
|---|---|
| Private keys | Never read by JS. Rust reads from `~/.ssh/`, holds in process memory only. |
| Passphrases | Windows Credential Manager via `keyring-rs`. Service name `Netssh`. Account = key fingerprint. |
| Passwords | Same as passphrases. Prompted on first use; offer "remember" → Credential Manager. |
| Known hosts | Standard `~/.ssh/known_hosts`. On mismatch, present TOFU prompt with both fingerprints. Never auto-accept. |
| `~/.ssh/config` | Read by default. Writes **require explicit user confirmation** per the brief — an "Allow Netssh to modify ~/.ssh/config" toggle in Settings → Advanced (OFF by default). |
| Snippets | Stored in the SQLite DB. Snippets tagged `danger` show a confirm dialog before execution. |
| Logs | Per-session connection logs stored under `%APPDATA%\Netssh\logs\`. Command text is NEVER logged — only metadata (timestamps, bytes-in/out, exit codes). |
| Auto-update | Tauri's signed updater. Code-signing certificate required for shipping; dev builds are unsigned. |
| WebView CSP | Strict CSP in `tauri.conf.json` — no remote scripts, no inline eval. |

---

## 9 · Implementation plan (one-week sprint cadence)

**Week 1 — Skeleton**
- [ ] Tauri 2 scaffold + frontend mounts
- [ ] Frameless window + custom titlebar (no controls yet)
- [ ] Theme token system + theme switcher
- [ ] i18n stub with EN + 简体中文
- [ ] Port prototype CSS verbatim into `src/styles/`

**Week 2 — Hosts & layout**
- [ ] `ssh_config.rs` parser (test against real-world configs — include `Match`, `Include`, `Wildcard`)
- [ ] Sidebar + grouping + search + chip filters
- [ ] HostDetail landing
- [ ] Right-click context menu

**Week 3 — Terminal**
- [ ] Local PTY: `portable-pty` integration; round-trip a PowerShell session
- [ ] xterm.js mount; event bridge (`emit`/`listen`)
- [ ] Local shell list + default selection

**Week 4 — Remote SSH**
- [ ] `russh` client; key-based auth from `IdentityFile`
- [ ] Known-hosts check + TOFU UI
- [ ] Multiple concurrent sessions

**Week 5 — Productivity**
- [ ] Snippets library + per-host quick commands
- [ ] Reconnect on transient failure
- [ ] Connection logs

**Week 6 — Polish & ship**
- [ ] Settings screens (all 7 panes)
- [ ] Credentials integration (passphrases + remembered passwords)
- [ ] Code signing + MSI installer
- [ ] Auto-update channel

---

## 10 · Test plan

| Layer | Tooling | Targets |
|---|---|---|
| Unit (Rust) | `cargo test` | `ssh_config` parser (Include/Match/Wildcard), `credentials` keyring round-trip, `pty` byte stream |
| Unit (TS) | Vitest | i18n key coverage (every dict has every key), reducers, ssh-config-to-Host shape |
| Component | React Testing Library | Sidebar render with 100 hosts, context menu actions emit correct events, theme switch swaps `data-theme` |
| E2E | Playwright + Tauri test driver | Boot → import config → open session → close session → relaunch (state restored) |
| Manual matrix | A real Win11 box | Acrylic on/off, Windows light/dark, EN/zh system, 100% / 125% / 150% DPI, narrow window 800×600, multi-monitor |
| Security | Manual + `cargo audit` | No private key bytes cross IPC boundary; CSP blocks remote scripts; Credential Manager entries deletable on uninstall |

---

## 11 · Getting started

```powershell
# prerequisites
winget install Rustlang.Rustup
winget install OpenJS.NodeJS.LTS
rustup default stable
rustup target add x86_64-pc-windows-msvc

# install deps
npm install
cd src-tauri && cargo fetch && cd ..

# dev
npm run tauri dev

# build MSI
npm run tauri build
# → src-tauri/target/release/bundle/msi/netssh_0.1.0_x64_en-US.msi
```

Run against the prototype CSS first to sanity-check the visual port:
```powershell
npm run dev  # vite only — opens in browser, sans Tauri APIs
```

---

## 12 · Working with the prototype

The HTML prototype (`../Netssh Prototype.html`) is the canonical visual spec. When in doubt:
- Lift `styles.css` wholesale into `src/styles/tokens.css` + `themes.css`.
- Port each `.jsx` file in `components/` to a typed `.tsx` of the same name in `src/components/`.
- Replace mock data imports (`window.HOSTS`, `window.SNIPPETS`) with Zustand stores fed by Tauri commands.
- Replace the fake shell with a real xterm wired to the SSH/PTY event channels.

Every visible string in the prototype is already in `data/i18n.js` — copy directly into `src/i18n/en.json` and `zh.json`.
