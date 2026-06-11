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

# ── Lint ──
npm run lint                 # eslint src --ext .ts,.tsx

# ── E2E（需要桌面环境 + WebView2）──
npm run test:e2e             # 自动启动 tauri-driver + wdio 运行端到端测试（首次自动下载 msedgedriver）
```

## 架构分层

```
┌─ 前端 (src/)              ─ React 18 + TypeScript
│  ├─ pages/                   App, TerminalPane, HostDetail, Settings...
│  ├─ layouts/                 TitleBar, Sidebar, Workspace, ContextMenu
│  ├─ store/                   Zustand stores（见下方 stores 清单）
│  ├─ api/tauri.ts             前端唯一调用 Rust 的通道（invoke + event listen）
│  ├─ config/types.ts          所有共享类型（Host, Tab, Credential...）
│  ├─ config/defaults.ts       默认值（serial 预设、snippet 库、空 mock hosts）
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

## Stores 清单与持久化

前端共 8 个 zustand stores，其中 4 个用 `persist` middleware 持久化：

| Store | 文件 | 持久化 | 职责 |
|-------|------|--------|------|
| `useHosts` | `store/hosts.ts` | `netssh.hosts` | 主机列表、分组管理、SSH config 导入 |
| `useSessions` | `store/sessions.ts` | — | 打开的 Tab 和分屏状态 |
| `useSettings` | `store/settings.ts` | `netssh.settings` | 主题、语言、字体、终端偏好 |
| `useCredentials` | `store/credentials.ts` | `netssh.credentials` | 凭据元数据（仅存 `hasPassword: bool`，不含密码明文） |
| `useIdentities` | `store/identities.ts` | `netssh.identities` | SSH 密钥对列表 |
| `useReachability` | `store/reachability.ts` | — | 主机 ping 延时缓存 |
| `useSnippets` | `store/snippets.ts` | — | 命令片段库过滤状态 |

### 持久化链路

```
zustand persist middleware
  → createJSONStorage(() => appStorage)   ← store/persistence.ts
    → appStatePut(key, json)              ← api/tauri.ts (Tauri invoke)
      → Rust storage.rs → SQLite
    ↓ 失败时自动 fallback
    → window.localStorage
```

- **`persistence.ts`** 是 zustand ↔ Tauri IPC 的桥接层：`getItem` 调 `app_state_get`，`setItem` 调 `app_state_put`，失败时回退 `localStorage`
- **`partialize`** 在持久化前剥离 `ephemeralPassword` 字段，确保密码不落盘

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

## SSH Config 导入流程

App 启动时 `App.tsx` 必须调用 `loadFromSshConfig()`（通过 `useEffect` 触发）：

```
App.tsx mount → loadFromSshConfig()
  → parseSshConfig()                         ← api/tauri.ts
    → invoke("config_parse")                 ← Tauri IPC
      → ssh_config::parse()                  ← Rust (ssh2-config crate)
        → 读取 ~/.ssh/config
        → 解析 Host/HostName/User/Port/IdentityFile
        → 解析 # SITE: 注释推断分组
        → 返回 HostEntry[]
  → 与 store 中已有 hosts 合并（刷新字段 + 追加新 host）
```

首次导入也支持 Excel/JSON/CSV 文件（前端 xlsx 库解析，通过 `importHosts()` 写入 store）。

## host key TOFU 流程

`ClientHandler::check_server_key` → 检查 `accepted_keys` 集合 → 如果不在，emit `ssh:host-key-challenge` → 前端弹出 overlay → 用户选择 AcceptOnce / AcceptAndRemember / Reject → 前端调 `ssh_host_key_decide` → oneshot channel 返回决策 → Rust 继续或拒绝连接

## Serial 预设

`config/defaults.ts` 内置 5 种厂商预设（`SERIAL_PRESETS`）：Cisco 9600 8N1、Huawei 9600 8N1、H3C 9600 8N1、OpenWRT 115200 8N1、Generic 9600 8N1。串口连接时前端通过 `serialOpen()` 传入 `SerialProfile` 参数。

## 关键注意点

- **密码不落盘**：密码/私钥 passphrase 通过 `credentials::store` 写入 Windows 凭据管理器，前端 `credentials.ts` store 只存 `hasPassword: bool`；`hosts.ts` persist 时通过 `partialize` 剔除 `ephemeralPassword`
- **`loadFromSshConfig` 必须在 App 启动时调用**：该函数在 `hosts.ts` 中定义但无内部触发，`App.tsx` 的 `useEffect` 负责在 mount 时调用。如果遗漏，侧边栏不会加载 SSH config 中的主机
- **frontendDist 路径**：`tauri.conf.json` 里 `build.frontendDist = "../dist"`，所以 npm build 必须先于 tauri build
- **russh 0.46**：纯 Rust SSH，无 OpenSSH 依赖。`check_server_key` 的返回值 `Ok(false)` 表示拒绝连接
- **CSP 限制**：`tauri.conf.json` 的 CSP 只允许 `self` + google fonts，加外部资源需改 CSP
- **WebView2**：Windows 10/11 自带，不需要额外安装
- **msedgedriver**：E2E 测试需要匹配 WebView2 版本的 Edge WebDriver。`npm run test:e2e` 的脚本会检测 WebView2 版本并自动下载匹配的 driver 到 `~/.cargo/bin/`
- **Tauri 插件**：`plugin-fs`（文件读写）、`plugin-os`（系统信息）、`plugin-shell`（shell 命令）
- **测试 mock 注意**：`src/test/setup.ts` mock 了 `../services/tauri` 路径，但该文件并不存在——mock 是为了防止测试中意外引入真实 Tauri 调用
