# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

**Netssh** — Windows 桌面 SSH/串口终端工作站（Tauri 2.0 + React + Rust）。
Rust 后端链接 russh 做 SSH、ConPTY 做本地 shell、serialport 做串口；React 前端用 xterm.js 渲染终端，zustand 做状态管理。

## 构建与测试命令

```powershell
# ── 开发 ──
npm run dev                  # 仅启动 Vite 前端（端口 1420）
npx tauri dev                # 启动 Tauri App（前端 + Rust 后端）

# ── 编译 ──
npm run build                # TypeScript 检查 + Vite 构建 → dist/
cargo build --manifest-path src-tauri/Cargo.toml
cargo build --manifest-path src-tauri/Cargo.toml --release

# ── 测试 ──
npm test                     # 前端 vitest（需在项目根目录运行）
npx vitest run src/test/smoke.test.tsx   # 跑单个测试文件
npx vitest run -t "XSS"                  # 跑匹配的测试
cargo test --manifest-path src-tauri/Cargo.toml  # Rust 单测 + 集成测试
cargo test --manifest-path src-tauri/Cargo.toml --test integration  # 仅集成测试
npm run test:all             # 一键全栈：tsc + vitest + cargo test + vite build

# ── E2E（需要桌面环境 + WebView2）──
npm run test:e2e             # 自动启动 tauri-driver + wdio 运行端到端测试（首次自动下载 msedgedriver）
```

## 架构分层

```
┌─ 前端 (src/)              ─ React 18 + TypeScript
│  ├─ pages/                   App, TerminalPane, HostDetail, Settings...
│  ├─ layouts/                 TitleBar, Sidebar, Workspace, ContextMenu
│  ├─ store/                   Zustand stores: hosts, sessions, credentials, snippets...
│  ├─ api/tauri.ts             前端唯一调用 Rust 的通道（invoke + event listen）
│  ├─ config/types.ts          所有共享类型（Host, Tab, Credential...）
│  └─ test/                    vitest 测试 + mock Tauri API (setup.ts)
│
├─ Rust 后端 (src-tauri/src/)  ─ Rust + Tauri 2.0
│  ├─ commands.rs              [#tauri::command] 入口 + AppState（持有所有 Session）
│  ├─ ssh.rs                   russh SSH 连接、host key TOFU、publickey/password 认证
│  ├─ storage.rs               SQLite 持久化（host key、connection log、settings）
│  ├─ ssh_config.rs            只读解析 ~/.ssh/config
│  ├─ credentials.rs           keyring-rs → Windows Credential Manager / Keychain
│  ├─ pty.rs                   ConPTY 本地 shell (PowerShell/CMD/WSL)
│  └─ serial.rs                serialport 串口通信
│
├─ Rust 集成测试 (src-tauri/tests/) ─ 独立的 cargo test target
│  └─ integration.rs           known_hosts 解析、storage CRUD、host key 注册表、ssh config
│
└─ 编译产物
   src-tauri/target/debug/netssh.exe   — cargo build
   src-tauri/target/release/netssh.exe — cargo build --release
   dist/                               — vite build
```

## 前端 → Rust 通信模式

前端 **不直接调 Rust mod**，全部通过 Tauri IPC：

1. `src/api/tauri.ts` 用 `invoke("command_name", { args })` 调用 Rust `#[tauri::command]`
2. Rust 通过 `app.emit("channel:id:data", payload)` 推送数据到前端
3. 前端用 `listen("channel:id:data", callback)` 订阅事件
4. vitest 测试通过 `src/test/setup.ts` mock 整个 `invoke` 和 `listen`

SSH 连接的关键数据流：
```
TerminalPane → sshOpen({alias, host, user, port, identityFile, password})
  → Rust ssh::SshSession::connect()
    → russh client::connect → check_server_key (TOFU) → authenticate_*
      → channel_open_session → request_pty → request_shell
        → tokio::spawn I/O loop → emit "ssh:{id}:data"
```

## host key TOFU 流程

`ClientHandler::check_server_key` → 检查 `accepted_keys` 集合 → 如果不在，emit `ssh:host-key-challenge` → 前端弹出 overlay → 用户选择 AcceptOnce / AcceptAndRemember / Reject → 前端调 `ssh_host_key_decide` → oneshot channel 返回决策 → Rust 继续或拒绝连接

## 关键注意点

- **密码不落盘**：密码/私钥 passphrase 通过 `credentials::store` 写入 Windows 凭据管理器，前端 `credentials.ts` store 只存 `hasPassword: bool`
- **frontendDist 路径**：`tauri.conf.json` 里 `build.frontendDist = "../dist"`，所以 npm build 必须先于 tauri build
- **russh 0.46**：纯 Rust SSH，无 OpenSSH 依赖。`check_server_key` 的返回值 `Ok(false)` 表示拒绝连接
- **CSP 限制**：`tauri.conf.json` 的 CSP 只允许 `self` + google fonts，加外部资源需改 CSP
- **WebView2**：Windows 10/11 自带，不需要额外安装
- **msedgedriver**：E2E 测试需要匹配 WebView2 版本的 Edge WebDriver。`npm run test:e2e` 的脚本会检测 WebView2 版本并自动下载匹配的 driver 到 `~/.cargo/bin/`
