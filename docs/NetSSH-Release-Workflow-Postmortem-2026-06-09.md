# NetSSH Release Workflow 复盘总结（2026-06-09）

> 目标：把 `Release` 工作流从“经常失败”调整为“可稳定自动产出发布文件到 GitHub Release”。
>
---

## 1. 背景

仓库在运行 `Release` 工作流时遇到连续编译问题，尤其集中在 Linux 版本构建（x64/arm64）与 apt 源、以及后续 `create-release` 依赖条件导致发布阶段无法执行。用户要求最终实现“编译成功并自动上传到 Releases”。

我在这轮已经对流程做了三类改动：

1) 先修复 Linux arm64 失败点；
2) 运行手动 `workflow_dispatch` 验证；
3) 最终按用户要求移除 Linux 产物构建，仅保留 Windows + macOS + npm publish；
4) 再次触发验证并确认 Release 成功。

---

## 2. 问题列表（时间线）

### 问题 A：Linux arm64 失败（apt 源 404）
- 现象：`build-linux-arm64` 阶段出现大量 `404`，如 `https://security.ubuntu.com/.../noble/main/binary-arm64/Packages`。
- 影响：`create-release` 的 `needs` 依赖未满足，导致发布任务跳过。
- 根因：runner 上 `security.ubuntu.com` 不稳定提供所需 arm64 package metadata，且多来源混用导致解析失败。

### 问题 B：Linux arm64 源配置方式错误
- 现象：后续我尝试创建自定义源文件后，apt 报错 `Malformed stanza ... (type)`。
- 根因：在 `apt` 被强制按 deb822 源格式读取时，写入了 `.list` 风格内容，字段/格式不匹配。
- 影响：即便逻辑修正了，仍会失败，浪费时间。

### 问题 C：`create-release` 依赖全部成功（包括 Linux）
- 现象：Windows/macOS/npm 成功后，`create-release` 仍可能因为 Linux 阶段失败而跳过。
- 根因：`create-release` 的 `needs` 包含了失败的 Linux 作业。
- 影响：整体看似前几步成功，最终仍没有 Release 包上传。

### 问题 D：你要求“直接去掉 Linux”的变更时点
- 现象：希望停止维护 Linux 产物，避免后续失败。
- 决策：删掉 Linux 两个构建 job，精简 release 依赖。

---

## 3. 具体修复与验证

### 3.1 先尝试修复 Linux arm64（中间尝试）

在 `release.yml` 中对 `build-linux-arm64` 做过以下方向尝试：

1. 添加 `dpkg --add-architecture arm64`
2. 用自定义源列表分离 amd64 与 arm64 镜像源
3. 安装交叉编译链与 arm64 开发包
4. 改善 Node 版本警告（设置 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`）

> 但该方向仍出现配置与 runner 解析兼容性问题，最关键的是源文件格式误用导致 `Malformed stanza`。

### 3.2 按用户“stop linux version”要求的最终修正（成功）

直接修改 `release.yml`：

- 删除了 `build-linux-x64` job。
- 删除了 `build-linux-arm64` job。
- 将 `create-release` 的依赖改为：
  - `build-windows`
  - `build-macos`
  - `publish-npm`
- 删除 Linux artifact 下载步骤。

### 3.3 触发与验证

- 已提交并推送工作流修改：
  - `ci(release): remove linux build jobs from release workflow`
- 手动触发 release（`workflow_dispatch`）
  - tag: `v1.1.12`
  - Run：`27195070216`
- 检查结果：
  - `test`：success
  - `build-macos`：success
  - `publish-npm`：success
  - `build-windows`：success
  - `create-release`：success
- Release 页面可见：`v1.1.12`
- 上传 artifact 为 Windows/macOS 与 npm 相关版本。

---

## 4. 已产生的有效经验（重点）

### 4.1 CI 设计经验

- 让发布 `needs` 链尽量反映“最小可用集”。
  - 某些平台长期不稳定时，不该把整条发布链绑定上去。
- 如果某平台属于可选平台，应通过人工决策把它从 `needs` 剥离，避免阻塞全部发布。

### 4.2 Linux cross build 经验（若以后要恢复）

- Runner 上 arm64 依赖很容易受源结构影响。
- 不能混用源格式（`.list` vs deb822）和 apt 解析参数。
- 建议：
  - 在专门测试分支先单独验证 `apt` 源文件是否可读；
  - 用清晰、最小可复现命令先锁定 `dpkg --add-architecture` + `apt-cache` 流程。

### 4.3 触发与观察经验

- 手动触发建议先用 `workflow_dispatch` + tag，避免 pollute 主分支自动触发。
- 每次发起后，先看 `jobs`：
  - `build-xxx` 的状态
  - `create-release` 是否 `skipped` 或 `success`
- 一旦 `create-release` 跳过，优先查 `needs` 与失败上游 job。

---

## 5. 下次避免踩坑的执行清单

1. 新增/修改 release 平台前先写“最小可运行链条”（先单平台），确认通过后再扩展。
2. 引入新平台前，在本地先写 apt 安装脚本 dry-run（仅验证源与包可解析）。
3. 改 workflow 后立即检查：
   - `if:` 条件是否一致
   - `needs` 依赖是否包含了已弃用平台
4. 发起 workflow 后保存 run id 到备注，便于快速回溯。
5. 发布策略：
   - 仅当 `create-release` 成功才对外宣告“本次自动发布完成”。

---

## 6. 当前状态（现在起）

- Linux 构建已从 `Release` 工作流移除。
- 当前发布流程能持续产出 Windows/macOS + npm，并自动创建 GitHub Release。
- 下一步若需要 Linux，可独立新建可选工作流（非强制 `needs`）做实验再接入。

---

### 关键命令（本次已用到）

- 触发手动发布
```bash
gh workflow run 291752493 --field tag=v1.1.12
```

- 查看运行状态
```bash
gh run view 27195070216 --json jobs --jq '.jobs | map(.name + "|" + .status + "|" + (.conclusion // "")) | .[]'
```

- 查看发布结果
```bash
gh release view v1.1.12
```

---

## 7. 参考提交

- `ci(release): remove linux build jobs from release workflow`
  - `2eb75f2`
