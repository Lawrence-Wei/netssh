# Netssh Change Version Guide

This guide shows how to change the Netssh version with one variable. Example: update from `v1.1.14` to `v1.1.15`.

Run all commands from the repository root:

```powershell
cd D:\projects\netssh
```

## Version Rules

Git tags use the `v` prefix:

```text
v1.1.15
```

Project files use plain SemVer without `v`:

```text
1.1.15
```

Files that must stay aligned:

- `package.json`
- `package-lock.json`
- `src-tauri\Cargo.toml`
- `src-tauri\tauri.conf.json`

## One-Variable Update

Change only `$newTag`.

```powershell
$oldTag = "v1.1.15"
$newTag = "v1.1.16"

$oldVersion = $oldTag -replace '^v', ''
$newVersion = $newTag -replace '^v', ''

Write-Host "Changing version from $oldTag to $newTag"
Write-Host "File version: $oldVersion -> $newVersion"

# Update package.json and package-lock.json through npm.
npm version $newVersion --no-git-tag-version
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Update Rust package version.
(Get-Content src-tauri\Cargo.toml) `
  -replace '^version = ".*"', "version = ""$newVersion""" |
  Set-Content src-tauri\Cargo.toml

# Update Tauri app version.
(Get-Content src-tauri\tauri.conf.json) `
  -replace '"version": ".*"', """version"": ""$newVersion""" |
  Set-Content src-tauri\tauri.conf.json

Write-Host "Version updated to $newVersion"
```

## Verify Version Values

Check all version fields:

```powershell
rg '"version": "1.1.15"|^version = "1.1.15"' package.json package-lock.json src-tauri\Cargo.toml src-tauri\tauri.conf.json
```

Expected result should include:

```text
package.json:  "version": "1.1.15",
package-lock.json:  "version": "1.1.15",
src-tauri\Cargo.toml:version = "1.1.15"
src-tauri\tauri.conf.json:  "version": "1.1.15",
```

`package-lock.json` can show more than one matching line. That is normal.

## Build / Validation After Version Change

Run the validation gate:

```powershell
tools\ai-loop\run-validation.ps1
```

Build the installable desktop app:

```powershell
npm run tauri:build
```

`npm run tauri:build` runs `tauri build` and then `scripts\collect-release-artifacts.ps1`. The collector reads `package.json`, creates `releases\v<version>`, and copies only bundle files whose names include the current version.

Expected local release directory for this version:

```text
D:\projects\netssh\releases\v1.1.15
```

If the app was built with `npx tauri build` or another direct command, collect the release bundles manually:

```powershell
$releaseDir = "D:\projects\netssh\releases\$newTag"
$bundleRoot = "src-tauri\target\release\bundle"
$bundleRootPath = (Resolve-Path $bundleRoot).Path

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

Get-ChildItem -Path $bundleRootPath -Recurse -File | ForEach-Object {
  $relativePath = $_.FullName.Substring($bundleRootPath.Length).TrimStart('\', '/')
  $targetPath = Join-Path $releaseDir $relativePath
  New-Item -ItemType Directory -Force -Path (Split-Path $targetPath) | Out-Null
  Copy-Item -LiteralPath $_.FullName -Destination $targetPath -Force
}
```

All compiled, packaged, installer, and release outputs must live under:

```text
D:\projects\netssh\releases
```

`releases` is ignored by Git. Do not stage or commit generated binaries, installers, archives, or release bundles.

## Commit and Tag

Stage the version files:

```powershell
git add package.json package-lock.json src-tauri\Cargo.toml src-tauri\tauri.conf.json
```

Commit:

```powershell
git commit -m "bump version to 1.1.15"
```

Create the tag:

```powershell
git tag v1.1.15
```

Push:

```powershell
git push origin main
git push origin v1.1.15
```

## Reusable Script Template

Copy this block and only change `$newTag` next time.

```powershell
$newTag = "v1.1.15"
$newVersion = $newTag -replace '^v', ''

npm version $newVersion --no-git-tag-version
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

(Get-Content src-tauri\Cargo.toml) `
  -replace '^version = ".*"', "version = ""$newVersion""" |
  Set-Content src-tauri\Cargo.toml

(Get-Content src-tauri\tauri.conf.json) `
  -replace '"version": ".*"', """version"": ""$newVersion""" |
  Set-Content src-tauri\tauri.conf.json

rg """version"": ""$newVersion""|^version = ""$newVersion""" package.json package-lock.json src-tauri\Cargo.toml src-tauri\tauri.conf.json
```
