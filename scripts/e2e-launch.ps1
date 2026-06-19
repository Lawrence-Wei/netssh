#!/usr/bin/env pwsh
# Full desktop E2E: build frontend + release backend, then run the isolated
# tauri-driver WDIO suite through e2e-quick.ps1.

param(
    [int]$DriverPort = 0
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

Push-Location $projectRoot
try {
    Write-Host "--- Cargo build (release) ---" -ForegroundColor Cyan
    cargo build --manifest-path src-tauri/Cargo.toml --release
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "--- npm build ---" -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host "--- Running isolated desktop E2E ---" -ForegroundColor Cyan
    pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/e2e-quick.ps1 -Profile release -DriverPort $DriverPort
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
