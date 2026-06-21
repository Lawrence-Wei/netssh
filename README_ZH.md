# Netssh

[English version](README.md)

![Netssh 应用截图](docs/assets/netssh-app-screenshot.png)

**Netssh** 是一个本地优先的 Windows SSH、串口控制台与基础设施资产工作台，面向网络工程师、基础设施工程师、SRE、运维、IT 管理员和实验室用户。

它服务的是日常连接工作：快速找到设备、查看资产信息、安全连接，并把凭据留在本机。

当前版本：**1.1.18**

---

## 亮点

- **资产清单**：管理服务器、交换机、路由器、防火墙、NAS、PVE 节点、Docker 主机、SBC、PC、Mac 和云主机。
- **SSH 与串口配置**：编辑主机时先填写必需连接字段，再在高级区域维护元数据。
- **侧栏优先工作流**：站点/分组、搜索、收藏、最近连接、手动排序，并与首页拓扑同步。
- **多标签终端工作台**：支持 SSH、本地 Shell、串口会话和最多四宫格分屏。
- **安全主机密钥处理**：未知主机密钥需要用户确认 TOFU，密钥不匹配会阻断连接。
- **本地凭据边界**：密码使用系统凭据管理器/密钥环，不写入前端状态。
- **中英文界面**：可在设置中切换。
- **四套主题**：极光紫、钴蓝、Windows 云母、日间浅色。
- **AI 辅助 QA**：内置自动点击巡检，生成可复现的 bug 报告。

---

## 安装

从 [GitHub Releases](https://github.com/team-gabage/netssh/releases) 下载最新 Windows 安装包。

推荐包：

- **NSIS 安装包** - 适合大多数 Windows 用户。
- **MSI 安装包** - 适合企业部署和托管环境。

发布产物会放在：

```text
releases/vMAJOR.MINOR.PATCH/
```

---

## 快速开始

### 1. 添加主机

点击左侧侧栏的 **Add host**，填写必要连接字段。

| 字段 | 说明 |
|---|---|
| 别名 | 显示名称，例如 `core-switch` 或 `pve-lab` |
| 连接类型 | SSH 或 Serial |
| 主机名 / 端口 | SSH 目标，例如 `192.168.1.1:22` |
| 用户 | SSH 登录用户，例如 `root` 或 `admin` |
| 串口配置 | COM 端口、波特率、数据位、校验位、停止位、流控和换行方式 |
| 站点 / 分组 | 按位置、网络、实验室或云范围组织资产 |
| 角色 / 标签 / 备注 | 可选元数据，用于筛选和运维上下文 |

当前支持：

- **SSH** - 远程终端会话。
- **Serial** - 通过 COM 端口连接交换机、路由器、OpenWRT/Linux SBC 和通用设备控制台。

### 2. 连接

- **单击**主机打开详情面板。
- **双击**主机立即连接。
- **右键**主机执行连接、编辑、收藏、移动、删除等操作。
- 使用 **New tab** 做一次性手动连接，不必保存到资产清单。

首次连接某台主机时，Netssh 会显示主机密钥确认窗口。请核对指纹后再信任。如果已知主机密钥发生变化，连接会被阻断。

### 3. 导入已有主机

使用 **Import** 预览并导入：

- 只读读取 `~/.ssh/config`。
- Excel / XLSX 文件。
- JSON 文件。
- CSV 文件。

导入预览会在写入 Netssh 前展示重复别名、缺失密钥、重复主机名等诊断信息。

---

## 核心功能

### 资产管理

- 站点/分组桶，支持本地、云端和混合部署范围。
- 收藏、最近连接时间、标签、角色、备注和手动排序。
- 对 Ubuntu、Debian、Windows、Raspberry Pi、Proxmox、OpenWRT、Huawei、Cisco、NAS 等设备做元数据和图标提示。
- 保留 SSH config 的别名，包括多别名 `Host` 条目。

### 终端工作台

- 基于 Rust `russh` 的 SSH 会话。
- 通过 Windows ConPTY 支持本地 PowerShell、CMD、WSL 和自定义 Shell。
- 串口后端内置 Cisco、Huawei、H3C、OpenWRT/Linux SBC 和通用控制台预设。
- 多标签工作区和四宫格分屏。
- 会话侧边栏、状态条、终端字体控制、光标控制、locale/timezone 偏好和命令片段。

### 安全与隐私

- 密码、密钥口令和私钥不会持久化到前端状态。
- 凭据通过系统凭据管理器/密钥环保存。
- Netssh 信任的主机密钥保存在本地 SQLite，不写入用户 OpenSSH 文件。
- SSH config 导入默认为只读，只有用户确认导入时才写入 Netssh。
- 主机密钥不匹配会阻断连接。
- 操作日志不记录用户命令文本。
- 高风险命令支持危险操作确认。

### 外观

- 极光紫、钴蓝、Windows 云母、日间浅色四套主题。
- 中文和英文界面。
- Windows Acrylic / 透明效果控制。
- 可配置终端字体、字号、光标样式、光标闪烁、回滚行数、选中复制和右键粘贴。

---

## 开发

前置要求：

- Windows 10 或 Windows 11
- Node.js 和 npm
- Rust 工具链
- Windows Tauri 构建依赖

安装依赖：

```powershell
npm install
```

启动前端开发服务器：

```powershell
npm run dev
```

启动 Tauri 开发版：

```powershell
npm run tauri:dev
```

运行标准验证：

```powershell
tools\ai-loop\run-validation.ps1
```

常用单项命令：

```powershell
npm run lint
npm test -- --run
npm run build
cargo test --manifest-path src-tauri\Cargo.toml
```

构建发布安装包：

```powershell
npm run tauri:build
```

---

## AI 点击巡检

Netssh 内置了一个自动前端点击巡检，用来捕获交互回归，并生成适合 AI 继续修复的 bug 报告。

快速巡检：

```powershell
npm run test:e2e:click-audit -- -MaxClicks 80
```

巡检会：

- 构建并启动私有 browser preview。
- 使用临时浏览器 profile。
- 注入不含敏感信息的测试主机。
- 自动点击可见交互节点。
- 捕获 runtime error、browser console error、应用白屏/健康检查失败、点击失败、截图和操作路径。
- 将 Markdown 和 JSON 报告写入 `.ai/reports/`。

这样 AI 后续修 bug 时拿到的是明确复现证据，而不是模糊的“界面好像有问题”。

---

## 系统要求

| 项目 | 最低要求 |
|---|---|
| 操作系统 | Windows 10 / Windows 11 |
| 架构 | x64 |
| 运行时 | Microsoft Edge WebView2 Runtime |
| 网络 | 仅远程连接和下载依赖时需要 |

Netssh 当前是 Windows 优先。配置里可能存在其他平台的 Tauri bundle target，但当前产品体验主要围绕 Windows 运维用户设计和验证。

---

## 产品方向

Netssh 不是通用聊天终端，也不是营销页面。它的目标是成为基础设施与网络资产的实用工作台：

- 本地优先资产清单
- 快速、安全的连接
- 私密凭据处理
- 兼容 SSH config
- 串口控制台工作流
- 可重复验证与 AI 辅助 bug hunting
