# NetSSH 发布 SOP（新手版）

## 目标
让仓库发布变成可复现流程：
- 修改代码 -> 推代码
- 自动触发/手动触发 release
- 自动产出 Windows + macOS + npm（当前不含 Linux）

---

## 一次性结论
本项目当前 Release 工作流里，**Linux 版本构建已移除**。
你只需要关注：
- Windows（x64 + arm64）
- macOS（x64 + aarch64 + universal）
- npm package 发布

---

## 一、查看发布是否可用（先看这个）

### 1) 看 workflow
```bash
gh workflow list
gh workflow view Release --yaml
```

### 2) 看最近一次发布状态
```bash
gh run list --workflow Release --limit 5
```

### 3) 看 run 详情
```bash
gh run view <RUN_ID> --json status,conclusion
gh run view <RUN_ID> --json jobs
```

---

## 二、手动触发 release（推荐）

### 1) 先打标签（如果没有）
```bash
git checkout main
git pull
git tag v1.1.13
git push origin v1.1.13
```

### 2) 或直接手动触发（workflow_dispatch）
```bash
gh workflow run Release --field tag=v1.1.13
```

### 3) 拿到 run 链接
命令会返回一个链接，记录后继续步骤 4。

### 4) 监控作业状态（重点）
```bash
gh run view <RUN_ID> --json jobs --jq '.jobs | map(.name + "|" + .status + "|" + (.conclusion // "")) | .[]'
```
正常成功应看到：
- test: success
- build-windows: success
- build-macos: success
- publish-npm: success
- create-release: success

---

## 三、确认是否真正发布到 GitHub Release

```bash
gh release view <TAG>
gh release view <TAG> --json assets --jq '.assets | map(.name) | .[]'
```
例如：`v1.1.13`

---

## 四、如果失败了，按这个顺序排查

### 情况 A：`create-release` skipped 或失败
1. 看上游 jobs 是否失败/已跳过。
2. 常见因：
   - 其中一项关键 job 未成功（build-windows/build-macos/publish-npm）。
   - `create-release` 的 `needs` 没满足。

### 情况 B：Windows 打包失败
- 在 run 日志点开 `build-windows`
- 多为依赖或签名/打包配置问题（先看最后 30 行）

### 情况 C：macOS 打包失败
- 查看 `build-macos` 日志
- 常见问题是目标平台没装或脚本路径问题

### 情况 D：npm publish 失败
- 查看 `publish-npm` 步骤日志
- 检查 token、package version、`package.json` 版本冲突

---

## 五、为什么 Linux 被移除（给新手看的解释）

以前 Linux（尤其 arm64）常见失败点在 `apt` 依赖源和交叉编译环境。
为了先稳定发布链路，先把 Linux job 下线。

后续如果需要加回：
1. 新建独立 workflow（例如 `release-linux.yml`）
2. 不要让其成为 `create-release` 的硬依赖
3. 先在单独 branch 做连续 3 次成功后再接入主流程

---

## 六、变更原则（团队版）

1. 任何改动先提最小 PR：
- 先改一个 job，不要一次改 3个平台。

2. 任何发布问题都以 `create-release` 成功为验收口径。

3. 变更后务必补一条“手动验证记录”（tag + run id）。

4. 如果只是临时修复：
- 不先改复杂逻辑，先调整 `needs` 降低影响面。

---

## 七、当前有效标签建议

- 本次稳定发布链路触发 run 已验证通过。
- 你现在可直接复用该流程发布后续版本。

---

## 附：本次关键提交
- `ci(release): remove linux build jobs from release workflow`（`2eb75f2`）
- 已验证 run：`27195070216`
- 相关 release：`v1.1.12`
