#!/usr/bin/env pwsh
# 快速 E2E 测试 — 兼容 debug/release，自动清理
param(
    [string]$Profile = "debug"
)

$ErrorActionPreference = "Continue"
$projectRoot = (Get-Location).Path
$driverPort = 4444

# 选二进制
$bin = if ($Profile -eq "release") {
    "$projectRoot\src-tauri\target\release\netssh.exe"
} else {
    "$projectRoot\src-tauri\target\debug\netssh.exe"
}

Write-Host "Binary: $bin" -ForegroundColor Cyan
if (-not (Test-Path $bin)) { Write-Host "Not found! Run cargo build first." -ForegroundColor Red; exit 1 }

# 确保 msedgedriver 可用
$driver = Get-Command msedgedriver -ErrorAction SilentlyContinue
if (-not $driver) {
    Write-Host "msedgedriver not in PATH. Installing..." -ForegroundColor Yellow
    $wv2 = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue
    $ver = $wv2.pv; $url = "https://msedgedriver.microsoft.com/$ver/edgedriver_win64.zip"
    $zip = "$env:TEMP\msedgedriver_quick.zip"; $out = "$env:TEMP\msedgedriver_quick"
    $wc = New-Object System.Net.WebClient; $wc.Headers.Add("User-Agent", "Mozilla/5.0")
    $wc.DownloadFile($url, $zip)
    Expand-Archive $zip $out -Force
    Copy-Item "$out\msedgedriver.exe" "$env:USERPROFILE\.cargo\bin\msedgedriver.exe" -Force
    Write-Host "Installed." -ForegroundColor Green
}

# 干掉残留
taskkill /f /im netssh.exe 2>$null | Out-Null
taskkill /f /im tauri-driver.exe 2>$null | Out-Null
Start-Sleep 1

# 启动 tauri-driver (后台)
Write-Host "Starting tauri-driver..." -ForegroundColor Yellow
$driverJob = Start-Job -Name tauri-driver -ScriptBlock { tauri-driver --port 4444 }
Start-Sleep 3

# 检查 driver 就绪
try {
    $null = Invoke-WebRequest "http://127.0.0.1:4444/status" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "tauri-driver ready" -ForegroundColor Green
} catch {
    Write-Host "tauri-driver FAILED to start" -ForegroundColor Red
    Receive-Job $driverJob; Remove-Job $driverJob -Force; exit 1
}

# 跑 wdio
Write-Host "Running E2E tests..." -ForegroundColor Yellow
Push-Location $projectRoot
npx wdio run webdriverio.conf.ts
$exitCode = $LASTEXITCODE
Pop-Location

# 清理
Write-Host "Cleaning up..." -ForegroundColor Yellow
taskkill /f /im netssh.exe 2>$null | Out-Null
Stop-Job -Name tauri-driver -ErrorAction SilentlyContinue | Out-Null
Remove-Job -Name tauri-driver -Force -ErrorAction SilentlyContinue | Out-Null
taskkill /f /im tauri-driver.exe 2>$null | Out-Null
Start-Sleep 1

Get-Process netssh, tauri-driver -ErrorAction SilentlyContinue | Select-Object Name, Id

if ($exitCode -eq 0) {
    Write-Host "ALL E2E PASSED" -ForegroundColor Green
} else {
    Write-Host "E2E FAILED (exit $exitCode)" -ForegroundColor Red
}
exit $exitCode
