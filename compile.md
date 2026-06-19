# Netssh Compile Guide

This file collects the compile, build, test, validation, packaging, and release commands used by this project. Run commands from the repository root:

```powershell
cd D:\projects\netssh
```

## 1. Environment

Netssh is a Tauri 2 desktop app with a React/Vite frontend and a Rust backend. Use npm for JavaScript dependencies and scripts.

Required tools:

- Node.js and npm
- Rust toolchain with Cargo
- PowerShell
- Tauri CLI from the project dev dependencies
- Windows WebView2 runtime for app/E2E execution
- Optional for E2E: `tauri-driver` and `msedgedriver`

Install frontend dependencies:

```powershell
npm install
```

## 2. Development Compile / Run

Start only the frontend Vite dev server:

```powershell
npm run dev
```

Start the full Tauri desktop app in development mode:

```powershell
npm run tauri:dev
```

Equivalent direct Tauri command:

```powershell
npx tauri dev
```

## 3. Frontend Compile

Type-check and build the frontend production bundle:

```powershell
npm run build
```

This runs:

```powershell
tsc
vite build
```

The frontend output is written to:

```text
dist\
```

Preview the built frontend bundle:

```powershell
npm run preview
```

## 4. Rust Backend Compile

Compile the Rust/Tauri backend in debug mode:

```powershell
cargo build --manifest-path src-tauri\Cargo.toml
```

Compile the Rust/Tauri backend in release mode:

```powershell
cargo build --manifest-path src-tauri\Cargo.toml --release
```

Rust build output is written under:

```text
src-tauri\target\
```

## 5. Desktop App Package Compile

Build the full installable Tauri desktop app:

```powershell
npm run tauri:build
```

Equivalent commands:

```powershell
npm run tauri -- build
npx tauri build
```

Tauri runs the frontend build first through `src-tauri\tauri.conf.json`:

```powershell
npm run build
```

Installer outputs are written under:

```text
src-tauri\target\release\bundle\
```

Expected Windows installer folders:

```text
src-tauri\target\release\bundle\msi\
src-tauri\target\release\bundle\nsis\
```

## 6. Tests Before Compile Completion

Run frontend unit/component tests once:

```powershell
npm test -- --run
```

Run a single frontend test file:

```powershell
npm test -- --run src\test\smoke.test.tsx
```

Run Rust tests:

```powershell
cargo test --manifest-path src-tauri\Cargo.toml
```

Run the combined test helper:

```powershell
npm run test:all
```

That script performs:

```powershell
npx tsc
npx vitest run --reporter=verbose
cargo test --manifest-path src-tauri\Cargo.toml
npm run build
```

## 7. Validation Gate

Before marking development work complete, run the repository validation gate:

```powershell
tools\ai-loop\run-validation.ps1
```

The validation gate runs:

```powershell
npm run lint
npm test -- --run
npm run build
cargo test --manifest-path src-tauri\Cargo.toml
```

Optional validation report:

```powershell
tools\ai-loop\run-validation.ps1 -ReportPath .ai\reports\validation-report.md
```

## 8. E2E Compile / Test Commands

Quick E2E against an existing debug binary:

```powershell
npm run test:e2e
```

Quick E2E against an existing release binary:

```powershell
pwsh -File scripts\e2e-quick.ps1 -Profile release
```

Full E2E flow:

```powershell
npm run test:e2e:full
```

The full E2E script performs:

```powershell
cargo build --manifest-path src-tauri\Cargo.toml --release
npm run build
npx wdio run webdriverio.conf.ts
```

Browser E2E helper:

```powershell
npm run test:e2e:browser
```

Runner E2E helper:

```powershell
npm run test:e2e:runner
```

## 9. Lint and Type Check Commands

Lint frontend source:

```powershell
npm run lint
```

Run TypeScript compile/type check directly:

```powershell
npx tsc
```

Run TypeScript check without emitting output:

```powershell
npx tsc --noEmit
```

## 10. Versioning Before Release Compile

Keep these version fields aligned before release packaging:

- `package.json` -> `"version"`
- `src-tauri\Cargo.toml` -> `version`
- `src-tauri\tauri.conf.json` -> `"version"`

Current project version at the time this guide was written:

```text
1.1.14
```

Use the existing version bump script if the next release version is already set inside it:

```powershell
pwsh -File scripts\bump-version.ps1
```

Manual PowerShell version bump template:

```powershell
$newVersion = "1.1.15"

$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$pkg.version = $newVersion
$pkg | ConvertTo-Json -Depth 10 | Set-Content package.json.tmp
Move-Item -Force package.json.tmp package.json

(Get-Content src-tauri\Cargo.toml) -replace '^version = ".*"', "version = ""$newVersion""" | Set-Content src-tauri\Cargo.toml
(Get-Content src-tauri\tauri.conf.json) -replace '"version": ".*"', """version"": ""$newVersion""" | Set-Content src-tauri\tauri.conf.json
```

## 11. Release Package Flow

Recommended release compile sequence:

```powershell
npm install
tools\ai-loop\run-validation.ps1
npm run tauri:build
```

Create a SemVer tag after the release build is ready:

```powershell
git tag v1.1.15
git push origin v1.1.15
```

Release workflow tags must match:

```text
vMAJOR.MINOR.PATCH
```

Example:

```text
v1.1.15
```

## 12. Release Artifact Upload Commands

Create a GitHub release with GitHub CLI from PowerShell:

```powershell
gh release create v1.1.15 `
  --title "v1.1.15" `
  --notes "## Changes" `
  "src-tauri\target\release\bundle\msi\*.msi" `
  "src-tauri\target\release\bundle\nsis\*.exe"
```

Git Bash / WSL variant:

```bash
gh release create v1.1.15 \
  --title "v1.1.15" \
  --notes "## Changes" \
  "src-tauri/target/release/bundle/msi/*.msi" \
  "src-tauri/target/release/bundle/nsis/*.exe"
```

If Git Bash reports a `mintty` terminal issue, run `gh` from PowerShell/cmd or use:

```bash
MSYS=enable_pcon gh release create v1.1.15
```

## 13. Useful Clean / Rebuild Commands

Remove frontend build output:

```powershell
Remove-Item -Recurse -Force dist
```

Remove Rust/Tauri build output:

```powershell
cargo clean --manifest-path src-tauri\Cargo.toml
```

Reinstall npm dependencies from lockfile:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

Full local rebuild:

```powershell
npm install
npm run build
cargo build --manifest-path src-tauri\Cargo.toml --release
npm run tauri:build
```

## 14. Command Index

```powershell
npm install
npm run dev
npm run tauri:dev
npm run build
npm run preview
npm run tauri:build
npm test -- --run
npm run lint
npm run test:all
npm run test:e2e
npm run test:e2e:browser
npm run test:e2e:runner
npm run test:e2e:full
npx tsc
npx tsc --noEmit
npx tauri dev
npx tauri build
cargo build --manifest-path src-tauri\Cargo.toml
cargo build --manifest-path src-tauri\Cargo.toml --release
cargo test --manifest-path src-tauri\Cargo.toml
cargo clean --manifest-path src-tauri\Cargo.toml
tools\ai-loop\run-validation.ps1
pwsh -File scripts\bump-version.ps1
pwsh -File scripts\e2e-quick.ps1 -Profile release
```
