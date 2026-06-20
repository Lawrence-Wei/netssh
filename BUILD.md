# Netssh 编译与发版指南

## 1. 版本号在哪里

三个文件需要保持一致：

| 文件 | 字段 | 当前值 |
|------|------|--------|
| `package.json` | `"version"` | `1.1.18` |
| `src-tauri/Cargo.toml` | `version` | `1.1.18` |
| `src-tauri/tauri.conf.json` | `"version"` | `1.1.18` |

## 2. 修改版本号

比如从 `1.1.17` 升到 `1.1.18`：

**方法一：手动改**

用编辑器分别打开上面三个文件，各改一处版本号即可。

**方法二：一行命令改 Cargo.toml**

```bash
sed -i 's/^version = ".*"/version = "1.1.18"/' src-tauri/Cargo.toml
```

**方法三：PowerShell 改全部三个**

```powershell
$newVersion = "1.1.18"

# package.json
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$pkg.version = $newVersion
$pkg | ConvertTo-Json -Depth 10 | Set-Content package.json.tmp
Move-Item -Force package.json.tmp package.json

# Cargo.toml（注意 ^ 锚定行首，避免误改依赖包的 version）
(Get-Content src-tauri/Cargo.toml) -replace '^version = ".*"', "version = ""$newVersion""" | Set-Content src-tauri/Cargo.toml

# tauri.conf.json
(Get-Content src-tauri/tauri.conf.json) -replace '"version": ".*"', """version"": ""$newVersion""" | Set-Content src-tauri/tauri.conf.json
```

## 3. 编译前检查

```powershell
# TypeScript 类型检查
npx tsc --noEmit

# 跑全部测试（tsc + vitest + cargo test + vite build）
npm run test:all

# 如果只想跑前端测试
npm test

# 如果只想跑 Rust 测试
cargo test --manifest-path src-tauri/Cargo.toml
```

## 4. 编译

```powershell
npm run tauri:build
```

编译成功后，安装包在以下目录：

```
releases\v1.1.18\
├── msi\   Netssh_1.1.18_x64_en-US.msi      # MSI 安装包
├── nsis\  Netssh_1.1.18_x64-setup.exe      # NSIS 安装程序（推荐）
└── ...
```

## 5. Git 提交并打 Tag

```powershell
# 提交版本号变更
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "bump version to 1.1.18"

# 打 tag
git tag v1.1.18

# 推送到远程
git push origin main
git push origin v1.1.18
```

## 6. 发 GitHub Release（可选）

**Bash (Git Bash / WSL)：**

```bash
version=1.1.18
tag="v${version}"
gh release create "$tag" \
  --title "$tag" \
  --notes "## Changes" \
  "src-tauri/target/release/bundle/msi/Netssh_${version}*_en-US.msi" \
  "src-tauri/target/release/bundle/nsis/Netssh_${version}*-setup.exe"
```

**PowerShell：**（注意用 `` ` `` 续行，路径用 `\`）

```powershell
$version = "1.1.18"
$tag = "v$version"
gh release create $tag `
  --title $tag `
  --notes "## Changes" `
  "src-tauri\target\release\bundle\msi\Netssh_$version*_en-US.msi" `
  "src-tauri\target\release\bundle\nsis\Netssh_$version*-setup.exe"
```

**如果碰到 `mintty` 错误**（Git Bash），改用 cmd 或 PowerShell 终端运行 `gh`，或者加环境变量：

```bash
# Git Bash 里需要伪装终端
MSYS=enable_pcon gh release create "$tag" ...
```

## 一步到位脚本

把下面脚本保存为 `release.ps1`，每次发版只需：

```powershell
.\release.ps1 1.1.18
```

**`release.ps1`：**

```powershell
param([string]$newVersion)

if (-not $newVersion) {
    Write-Host "Usage: .\release.ps1 1.1.18"
    exit 1
}

# 1. 改版本号
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$pkg.version = $newVersion
$pkg | ConvertTo-Json -Depth 10 | Set-Content package.json.tmp
Move-Item -Force package.json.tmp package.json

(Get-Content src-tauri/Cargo.toml) -replace '^version = ".*"', "version = ""$newVersion""" | Set-Content src-tauri/Cargo.toml

(Get-Content src-tauri/tauri.conf.json) -replace '"version": ".*"', """version"": ""$newVersion""" | Set-Content src-tauri/tauri.conf.json

Write-Host "Version bumped to $newVersion"

# 2. 编译
npm run tauri:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 3. 提交 & tag
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "bump version to $newVersion"
git tag "v$newVersion"

Write-Host "Done! Run 'git push origin main && git push origin v$newVersion' to push."
```
