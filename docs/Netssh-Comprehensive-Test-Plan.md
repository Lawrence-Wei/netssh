# Netssh 全面测试方案

适用版本：Netssh 1.1.x  
适用对象：Windows 本地优先 SSH / 串口运维工作台  
测试目标：覆盖从开发验证、人工验收、真实设备实验室、安装升级到上线巡检的完整流程，确保 Netssh 能安全、稳定地服务 Infra、Network、SRE、Ops、IT Admin 和实验室用户。

## 0. 测试范围与上线口径

Netssh 不是移动 App，也不是通用聊天终端。本测试方案将通用 App 测试模板转换为 Windows 桌面运维工具场景：

- 兼容性重点从 Android/iOS 机型切换为 Windows 10/11、WebView2、显示缩放、输入法、不同 Shell、不同 SSH/串口设备。
- 权限重点从手机权限切换为 Windows 文件权限、Credential Manager、COM 端口占用、`~/.ssh` 只读导入、安装器权限。
- 安全重点是凭据不落库、主机密钥 TOFU、防 host key mismatch、命令内容不进日志、危险命令二次确认。
- 业务重点是资产清单、站点分组、SSH 配置导入、快速连接、串口控制台、片段库、连接日志和本地持久化。

### 上线优先级

| 优先级 | 必须通过的范围 | 说明 |
| --- | --- | --- |
| P0 | 自动化验证、核心功能、安全边界、安装启动、基本 SSH/串口 smoke | 每次发版必须通过 |
| P1 | 真实设备兼容、弱网、升级迁移、长会话稳定性、UI/UX 回归 | 候选发布前必须完成 |
| P2 | 大规模资产、性能压测、可访问性、极端环境、安全专项扩展 | 中大型版本或公开发布前完成 |

### 自动化测试入口

| 类型 | 命令 | 当前用途 |
| --- | --- | --- |
| 标准验证门禁 | `tools\ai-loop\run-validation.ps1` | lint、Vitest、前端 build、Rust tests |
| 前端单测/组件 | `npm test -- --run` | React、状态、终端错误、TOFU、设置页 |
| Rust 测试 | `cargo test --manifest-path src-tauri\Cargo.toml` | known_hosts、存储、SSH/安全逻辑 |
| 构建/typecheck | `npm run build` | TypeScript + Vite 生产构建 |
| Tauri E2E | `npm run test:e2e` | App shell、侧边栏、设置页、基本交互 |
| 完整构建 | `npm run tauri:build` | 生成 Windows 安装包并收集 release artifacts |

## 1. 功能测试

核心目标：每个页面、按钮、流程、交互都符合 Netssh 产品方向，并能跑通真实运维工作流。

### 1.1 资产清单与站点分组

| ID | 优先级 | 用例 | 步骤 | 预期结果 | 自动化建议 |
| --- | --- | --- | --- | --- | --- |
| F-001 | P0 | 首次启动空资产 | 清空测试数据后启动 App | 首页显示空拓扑和导入/添加入口，无报错 | E2E |
| F-002 | P0 | 新增 SSH 主机 | 添加 alias、hostname、user、port、group | 主机出现在侧边栏、拓扑和详情页 | E2E + 组件 |
| F-003 | P0 | 新增串口资产 | 选择 Serial，填写 COM 口和预设 | 主机保存为串口类型，详情页显示串口信息 | 组件 |
| F-004 | P0 | 拖拽主机到站点 | 将主机从未分配拖到无锡/上海等站点 | `group` 更新，侧边栏分组和拓扑同步变化 | E2E |
| F-005 | P0 | 重命名站点 | 创建站点后重命名 | 站点名更新，已有主机不丢失 | 组件/E2E |
| F-006 | P1 | 删除站点 | 删除含主机的站点 | 主机移动到未分配，弹窗有明确提示 | 组件 |
| F-007 | P1 | 搜索资产 | 搜索 alias、hostname、tag、assetType | 侧边栏和拓扑同步过滤 | 已有 E2E 可扩展 |
| F-008 | P1 | 大量资产 | 导入 500 个主机、20 个站点 | 列表可滚动，搜索和分组无明显卡顿 | 性能 + E2E |

### 1.2 SSH 配置导入

| ID | 优先级 | 用例 | 步骤 | 预期结果 | 自动化建议 |
| --- | --- | --- | --- | --- | --- |
| F-009 | P0 | 读取 `~/.ssh/config` | 点击导入 SSH 配置 | 只读解析并展示预览，不直接写用户文件 | Rust + E2E |
| F-010 | P0 | `# SITE:` 注释分组 | 配置中加入 `# SITE: Office Lab` | 导入后主机归入对应站点 | Rust |
| F-011 | P0 | 多 alias | `Host gw gw-lan` | 保留主 alias 和 aliases，不丢失别名 | Rust |
| F-012 | P0 | 缺失 IdentityFile | 指向不存在的私钥 | 诊断区提示缺失，不阻塞其他主机导入 | 已有测试可扩展 |
| F-013 | P1 | duplicate Host | 重复 alias / hostname | 诊断重复项，用户确认后再导入 | 已有测试可扩展 |
| F-014 | P1 | known_hosts 导入 | 包含普通主机、`[host]:port`、逗号列表 | 能解析并匹配正确 host/port | Rust 已覆盖一部分 |
| F-015 | P1 | 恶意/异常 config | 超长行、特殊字符、通配符 Host | 不崩溃，不注入 UI，不写 OpenSSH 文件 | Rust + 安全 |

### 1.3 快速连接与终端

| ID | 优先级 | 用例 | 步骤 | 预期结果 | 自动化建议 |
| --- | --- | --- | --- | --- | --- |
| F-016 | P0 | 手动 SSH 连接 | 输入 host/user/port，连接测试主机 | 打开终端，状态从 connecting 到 connected | 实机 |
| F-017 | P0 | 保存凭据连接 | 选择 Credential Profile 后连接 | 用户名/密钥路径可复用，密码来自 Credential Manager | 实机 + 安全检查 |
| F-018 | P0 | 新主机 TOFU | 连接未信任主机 | 弹出 host key 指纹确认，保存后进入信任库 | 已有组件测试 + 实机 |
| F-019 | P0 | Host key mismatch | 替换服务端 host key 后连接 | 阻断连接，禁止直接接受，显示高风险提示 | 已有组件测试 + 实机 |
| F-020 | P0 | 认证失败 | 错密码、错 key、缺 passphrase | 显示可理解错误，不泄露 secret | Rust/实机 |
| F-021 | P1 | DNS/路由/端口错误 | 不存在域名、不可达 IP、关闭端口 | 显示对应诊断，不误报认证失败 | 实机 |
| F-022 | P1 | 终端复制粘贴 | 选中即复制、右键粘贴、Ctrl+C | 与设置一致，不破坏终端中断快捷键 | E2E/人工 |
| F-023 | P1 | 终端设置即时生效 | 修改字体、字号、光标、回滚行数 | 新终端/当前终端按设计生效 | 已有设置测试可扩展 |
| F-024 | P1 | 本地 Shell | 新建 PowerShell/cmd/WSL/Git Bash/custom shell | 环境变量、窗口大小、关闭行为正常 | 实机 |

### 1.4 串口控制台

| ID | 优先级 | 用例 | 步骤 | 预期结果 | 自动化建议 |
| --- | --- | --- | --- | --- | --- |
| F-025 | P0 | 枚举 COM 端口 | 插入 USB-Serial 后打开串口列表 | 显示 COM 名称、厂商/VID/PID 等信息 | 实机 |
| F-026 | P0 | 打开 9600 8N1 | Cisco/Huawei/H3C 预设连接设备 | 可以收发数据，行结束符正确 | 实机 |
| F-027 | P0 | 打开 115200 8N1 | OpenWRT/Linux SBC 预设 | 控制台可交互，断开后可重连 | 实机 |
| F-028 | P1 | COM 口被占用 | 用其他工具占用端口后连接 | 显示端口占用错误，不崩溃 | 实机 |
| F-029 | P1 | 非法串口参数 | baud 越界、data bits/parity/stop bits 非法 | 前端阻止或后端返回明确错误 | Rust + 组件 |
| F-030 | P1 | 拔插设备 | 会话中拔掉 USB-Serial | 会话退出并提示，重新插入后可重新打开 | 实机 |

### 1.5 设置、片段、日志与会话

| ID | 优先级 | 用例 | 步骤 | 预期结果 | 自动化建议 |
| --- | --- | --- | --- | --- | --- |
| F-031 | P0 | 设置页导航 | 打开外观、语言、Shell、密钥、凭据、终端、高级、关于 | 所有分区可访问，无空按钮 | 已有 E2E/组件 |
| F-032 | P0 | 凭据新增/删除 | 新增密码/密钥型凭据，删除后验证不可用 | secret 存 Credential Manager，profile 元数据留本地 | 组件 + 安全检查 |
| F-033 | P0 | 高级危险项 | SSH config 写入、遥测、开机自启等未实现项 | 默认禁用或需要明确确认，无静默副作用 | 组件 |
| F-034 | P1 | 片段库搜索/运行 | 搜索片段并发送到会话 | 命令进入终端，但连接日志不记录命令正文 | 组件 + 安全 |
| F-035 | P1 | 生产资产危险命令 | 在 production host 执行 reboot/rm/dd 等片段 | 弹出二次确认，取消后不发送 | 组件/实机 |
| F-036 | P1 | 连接日志 | 打开/关闭 SSH 或串口会话 | 记录 host、时间、bytes、exit/error，不记录命令文本 | Rust |

## 2. 兼容性测试

| 分类 | 覆盖项 | 验收点 |
| --- | --- | --- |
| Windows 系统 | Windows 10 22H2、Windows 11 23H2/24H2，普通用户/管理员用户 | 安装、启动、窗口控制、Credential Manager、COM 口访问正常 |
| WebView2 | 系统自带、运行时缺失/旧版 | 缺失时安装器或启动错误可理解 |
| 显示适配 | 100%、125%、150%、200% 缩放；1080p、2K、4K；多屏；窗口极小/最大化 | 文本不重叠，终端 fit 正常，弹窗不超屏 |
| 主题 | 浅色、深色、Windows mica/透明效果关闭 | 对比度足够，主题切换不丢设置 |
| 输入法/键盘 | 中文 IME、英文键盘、笔记本键盘、外接键盘 | 终端输入、快捷键、复制粘贴不冲突 |
| Shell | PowerShell 5/7、cmd、WSL、Git Bash、自定义 exe | 新标签打开正确 Shell，路径不存在时报错明确 |
| SSH 设备 | Linux/OpenSSH、OpenWRT/iStoreOS、PVE、NAS、老路由器、云 VPS | key 算法、banner、认证方式、断线处理兼容 |
| SSH Key | ed25519、rsa、ecdsa、带 passphrase、无 passphrase、缺失文件 | 认证和错误提示正确，passphrase 不落库 |
| Serial | CH340、CP210x、FTDI，Cisco/Huawei/H3C/OpenWRT console | 枚举、打开、收发、拔插、端口占用处理正常 |

## 3. 性能测试

| ID | 优先级 | 场景 | 指标建议 | 观测方式 |
| --- | --- | --- | --- | --- |
| P-001 | P0 | 冷启动 | 常规机器 3 秒内出现主界面 | 录屏/脚本计时 |
| P-002 | P1 | 热启动/窗口恢复 | 1 秒内恢复可交互 | 人工 + 日志 |
| P-003 | P1 | 500 主机 + 20 站点 | 搜索/分组切换 300ms 内反馈 | Performance profile |
| P-004 | P1 | 终端持续输出 | 10MB 输出不明显卡死，CPU/内存可回落 | 实机 SSH `yes`/日志流 |
| P-005 | P1 | 多会话 | 10 个 SSH/本地 shell 标签并存 | 内存稳定，关闭后资源释放 |
| P-006 | P2 | 大型导入 | 5000 hosts config/CSV/JSON | 不崩溃，有进度/错误诊断 |
| P-007 | P2 | 长回滚 | scrollback 10000/50000 行 | 滚动不卡顿，内存可接受 |

## 4. 稳定性测试

| ID | 优先级 | 场景 | 预期 |
| --- | --- | --- | --- |
| S-001 | P0 | App 连续打开关闭 20 次 | 无启动失败、DB 锁死、残留进程异常 |
| S-002 | P0 | 连接中关闭标签/退出 App | 后端 session 清理，App 不崩溃 |
| S-003 | P1 | Windows 锁屏/解锁 | 会话状态可恢复或清晰提示断开 |
| S-004 | P1 | 睡眠/唤醒 | SSH/串口状态不误判，重连路径可用 |
| S-005 | P1 | 长会话 8 小时 | 无明显内存持续增长、终端不失焦 |
| S-006 | P1 | 随机点击/快速切页 | 不出现白屏、React error、数据损坏 |
| S-007 | P2 | 断电/强杀进程后重启 | settings/hosts JSON 不损坏，可从备份恢复 |

## 5. 网络测试

| ID | 优先级 | 场景 | 预期 |
| --- | --- | --- | --- |
| N-001 | P0 | 正常 LAN SSH | 能连接并交互 |
| N-002 | P0 | 云 VPS SSH | 公网延迟下连接正常 |
| N-003 | P0 | 无网络/断网 | 本地资产和设置可打开，连接给出无网/不可达提示 |
| N-004 | P1 | DNS 失败 | 显示域名解析失败 |
| N-005 | P1 | IP 不可达 | 显示路由/超时诊断 |
| N-006 | P1 | 端口拒绝 | 显示连接被拒绝 |
| N-007 | P1 | Wi-Fi/VPN 切换 | 旧会话断开提示明确，新连接可用 |
| N-008 | P1 | 高延迟/丢包 | loading/连接中状态可见，不重复提交 |
| N-009 | P2 | 代理/DNS 劫持 | 连接失败不信任错误 host key，不误保存指纹 |

## 6. 安全测试

P0 安全门禁必须逐项验证。

| ID | 优先级 | 场景 | 检查方法 | 预期 |
| --- | --- | --- | --- | --- |
| SEC-001 | P0 | 密码不落前端持久化 | 搜索 localStorage/SQLite/settings JSON | 不存在 password/passphrase/ephemeralPassword 明文 |
| SEC-002 | P0 | 凭据使用 OS Credential Manager | 新增凭据后检查 DB | DB 只存 profile 元数据，secret 在 Windows 凭据管理器 |
| SEC-003 | P0 | 私钥不复制入 App 数据目录 | 添加 identity file | 仅保存路径，不复制私钥内容 |
| SEC-004 | P0 | `~/.ssh/config` 只读导入 | 导入前后 hash 对比 | 文件内容不变 |
| SEC-005 | P0 | OpenSSH `known_hosts` 不被写入 | TOFU 保存后对比用户 known_hosts | 不写用户文件，只写 Netssh SQLite trusted keys |
| SEC-006 | P0 | 未知 host key | 首连新设备 | 必须用户确认 TOFU 后才继续 |
| SEC-007 | P0 | Host key mismatch | 替换服务端 key | 阻断连接，禁止直接接受 |
| SEC-008 | P0 | 连接日志脱敏 | 执行命令后检查 `connection_log` | 无命令正文、密码、token |
| SEC-009 | P1 | XSS/导入注入 | alias/tag/notes 包含 HTML/script | UI 作为文本显示，不执行 |
| SEC-010 | P1 | 路径注入 | identity/custom shell 路径含特殊字符 | 不拼接 shell 执行，错误可控 |
| SEC-011 | P1 | 危险命令确认 | production asset 上运行危险片段 | 二次确认，取消不发送 |
| SEC-012 | P1 | Debug/release 日志 | release 运行并收集日志 | 无 secret、无命令正文 |

## 7. UI/UX 界面体验测试

| 分类 | 用例 | 预期 |
| --- | --- | --- |
| 信息架构 | 首页、侧边栏、拓扑、详情、设置、片段、终端之间跳转 | 运维用户可以快速定位资产并连接 |
| 视觉一致性 | 按钮、图标、卡片、表单、弹窗、终端状态 | 风格一致，不像营销页 |
| 文本溢出 | 长 alias、IPv6、长 Windows 路径、中文站点名、错误堆栈 | 不挤压、不遮挡、不破坏布局 |
| 空状态 | 无主机、无片段、无凭据、无 COM 口、无搜索结果 | 提示清楚，有下一步操作 |
| 加载状态 | 导入、连接、检测端口、保存设置 | 有明确 loading/disabled 状态，防重复点击 |
| 错误文案 | 认证失败、host key mismatch、端口占用、DB 写入失败 | 可理解、可操作，不暴露内部堆栈给普通用户 |
| 键盘可用性 | Tab 焦点、Enter 连接、Esc 关闭弹窗、快捷键 | 不困焦，不误发送危险命令 |
| 终端体验 | 字体、光标、复制、粘贴、右键、窗口 resize | 符合 Windows/PuTTY 用户习惯 |

## 8. 权限与本机场景专项

| 场景 | 测试点 | 预期 |
| --- | --- | --- |
| Credential Manager 不可用 | 组策略/权限限制下保存凭据 | 提示失败，不把 secret fallback 到明文存储 |
| AppData 无写权限 | 阻止写 `AppData\Roaming\Netssh` | 启动/保存错误清楚，不损坏数据 |
| `.ssh` 无权限 | 无法读取 config/key/known_hosts | 导入或连接给出权限提示 |
| COM 口权限/占用 | 端口不存在、被占用、驱动异常 | 提示具体端口问题 |
| 杀毒/安全软件拦截 | 安装器、pty、serial、credential 调用 | 有可排查错误，不静默失败 |
| 多用户 Windows | 另一个 Windows 用户运行 | 数据、Credential Manager、AppData 隔离 |
| UAC/管理员 | 普通用户和管理员分别运行 | 不依赖管理员权限完成日常功能 |

## 9. 本地化与合规测试

| ID | 优先级 | 场景 | 预期 |
| --- | --- | --- | --- |
| L-001 | P0 | 中英文切换 | 设置保存，重启后保持，UI 无混杂 key |
| L-002 | P0 | i18n key 对齐 | 比对 `en.json` 与 `zh.json` | key 完全一致 |
| L-003 | P1 | 中文路径/用户名 | `C:\Users\中文用户\.ssh\id_ed25519` | 路径显示和连接正常 |
| L-004 | P1 | 日期/时区 | TZ/LANG/LC_ALL 设置 | 传给 SSH/PTTY 环境，回退合理 |
| L-005 | P1 | 隐私口径 | 关于页/文档/日志策略 | 明确本地优先、无命令内容日志 |
| L-006 | P2 | 企业合规 | 离线环境、无遥测、数据留本机 | 可作为企业内网工具运行 |

## 10. 灰度、安装、升级与线上巡检

| ID | 优先级 | 场景 | 步骤 | 预期 |
| --- | --- | --- | --- | --- |
| R-001 | P0 | 标准验证门禁 | 运行 `tools\ai-loop\run-validation.ps1` | 全部通过 |
| R-002 | P0 | 生产构建 | 运行 `npm run tauri:build` | release artifacts 进入 `releases\vX.Y.Z` |
| R-003 | P0 | 本机安装 | 使用 NSIS 安装器覆盖安装 | App 可启动，版本正确 |
| R-004 | P0 | 数据保留 | 从旧版本升级 | hosts/groups/settings/credentials metadata 保留 |
| R-005 | P1 | 卸载重装 | 卸载后重装 | 行为符合安装器策略，残留数据可解释 |
| R-006 | P1 | DB 迁移 | 用旧版 `db.sqlite` 启动新版 | 自动迁移或兼容读取，不丢数据 |
| R-007 | P1 | 崩溃巡检 | 运行后查看日志/事件查看器 | 无高频 crash/error |
| R-008 | P2 | 小范围灰度 | 给 1-3 台真实运维机使用 1 周 | 收集连接失败、串口兼容、UI 卡点 |

## 11. Netssh 业务专项测试

| 业务域 | 专项用例 | 通过标准 |
| --- | --- | --- |
| 网络设备 | 路由器/交换机/防火墙/NAS/PVE/OpenWRT 快速连接 | 资产识别、端口、用户名、连接诊断符合设备习惯 |
| 多站点运维 | 上海、无锡、Cloud、Homelab、Field 等站点 | 分组、搜索、拓扑和详情同步 |
| 安全连接 | TOFU、mismatch、known_hosts 解析、trusted key 存储 | 不静默信任，不写用户 OpenSSH 文件 |
| 串口救援 | COM 口选择、Cisco/Huawei/H3C/OpenWRT 预设 | 插线即可定位端口并打开 console |
| 凭据复用 | root/switch/ops 等凭据 profile | secret 不落库，profile 可绑定资产 |
| 危险操作 | production 标记 + 片段/命令确认 | 防误操作，不记录命令正文 |
| 离线本地 | 无网状态下管理资产、设置、片段 | 核心本地功能可用 |

## 12. 自动化覆盖现状与缺口

### 已有自动化可覆盖

| 范围 | 文件/命令 | 覆盖点 |
| --- | --- | --- |
| 前端 smoke | `src/test/smoke.test.tsx`、`src/test/e2e/smoke.e2e.ts` | App shell、侧边栏、首页拓扑 |
| 交互 E2E | `src/test/e2e/interaction.e2e.ts` | 新增主机、详情页、搜索与拓扑同步 |
| 设置页 | `src/test/settings-ui.test.tsx`、`src/test/e2e/settings.e2e.ts` | 设置导航、主题、关于版本、偏好 |
| 导入诊断 | `src/test/import-diagnostics.test.tsx` | duplicate/missing identity 等导入提示 |
| 主机表单 | `src/test/host-form-connection-type.test.tsx` | SSH/Serial 表单切换 |
| 串口预设 | `src/test/serial-presets.test.ts` | Cisco/Huawei/H3C/OpenWRT 预设 |
| 终端错误 | `src/test/terminal-errors.test.ts` | 错误分类/文案 |
| TOFU | `src/test/terminal-tofu.test.tsx`、`src-tauri/tests/integration.rs` | 未知 host key、mismatch、known_hosts 解析 |
| SSH open mapping | `src/test/ssh-open-api-mapping.test.ts` | 前端参数传给 Tauri API |
| Rust 核心 | `src-tauri/tests/integration.rs` | storage、known_hosts、host key、安全逻辑 |

### 主要缺口

| 缺口 | 风险 | 建议补充 |
| --- | --- | --- |
| 真实 SSH 实机矩阵不足 | OpenWRT、老路由、云 VPS、NAS 行为不一致 | 建 3-5 台固定测试资产，记录 host key 和认证方式 |
| 串口硬件自动化不足 | USB-Serial 芯片和设备差异大 | 准备 CH340/CP210x/FTDI + loopback + 真实网络设备 |
| 安装升级自动化不足 | installer、AppData、DB 迁移容易漏 | 增加安装器 smoke 和旧 DB 回归包 |
| 性能基线不足 | 大资产和长终端输出可能退化 | 增加 500/5000 hosts fixture 和终端吞吐脚本 |
| 安全扫描不足 | secret 泄露需要持续防线 | 增加 DB/localStorage/logs secret grep 和 release 日志检查 |
| 长时间稳定性不足 | 睡眠唤醒、锁屏、长会话仅人工发现 | 建立 8 小时 overnight checklist |

## 13. 发布前最小必跑清单

P0 发布前必须全部通过：

1. `tools\ai-loop\run-validation.ps1`
2. `npm run tauri:build`
3. 安装最新 `releases\vX.Y.Z\nsis` 包并启动 App
4. 空数据启动、已有数据启动各一次
5. 新增 SSH 主机、站点分组、搜索、打开详情
6. 导入测试 `~/.ssh/config`，确认只读且诊断正确
7. 连接一台真实 SSH 主机，验证 unknown host key TOFU
8. 用替换 host key 的测试主机验证 mismatch 阻断
9. 新增/使用/删除 Credential Profile，检查 secret 不在 SQLite/localStorage/logs
10. 插入 USB-Serial，枚举端口，打开一个 loopback 或真实 console
11. 设置页所有分区逐一点击，确认无空功能、无报错
12. 中英文切换并重启验证持久化
13. 关闭 App 后确认无异常残留进程和 DB 锁

## 14. 测试记录模板

| 字段 | 内容 |
| --- | --- |
| 测试版本 | 例如 `1.1.17` |
| 测试日期 | `YYYY-MM-DD` |
| 测试环境 | Windows 版本、WebView2 版本、显示缩放、网络、设备 |
| 测试类型 | 功能/兼容/性能/稳定/网络/安全/UI/升级 |
| 用例 ID | 对应本文 ID |
| 步骤证据 | 截图、日志路径、命令输出、录屏 |
| 结果 | PASS / FAIL / BLOCKED / N/A |
| 缺陷链接 | issue/commit/report |
| 备注 | 复现条件、影响范围、下一步 |

## 15. 建议下一步

1. 将 P0 发布前最小必跑清单固化为 `.ai` release checklist。
2. 为真实 SSH/串口测试建立固定实验室资产清单，避免每次发布临时找设备。
3. 增加 secret 扫描脚本，自动检查 SQLite、localStorage mock、日志和 release 输出。
4. 增加安装升级 smoke：构建、安装、启动、验证版本、验证旧 DB 数据。
5. 增加大规模 fixture：500/5000 hosts，覆盖导入、搜索、拓扑、分组性能。
