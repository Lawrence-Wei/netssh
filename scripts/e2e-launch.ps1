#!/usr/bin/env pwsh
# Netssh E2E 自动化启动脚本
#
# 使用: npm run test:e2e
#
# 流程:
#   1. 确保 msedgedriver.exe 在 PATH 中（自动下载匹配 WebView2 版本）
#   2. cargo build (Rust 后端)
#   3. npm run build (前端)
#   4. 启动 tauri-driver (WebDriver 代理, 端口 4444)
#   5. wdio 自动启动 App 并运行测试
#   6. 清理: 关 App, 关 driver

$ErrorActionPreference = "Continue"
$projectRoot = Split-Path -Parent $PSScriptRoot
$driverPort = 4444

# ── 确保 msedgedriver.exe 可用 ────────────────────────────────
function Ensure-EdgeDriver {
    $edgePath = "$env:USERPROFILE\.cargo\bin\msedgedriver.exe"
    $currentPath = (Get-Command msedgedriver -ErrorAction SilentlyContinue).Source

    if ($currentPath) {
        Write-Host "msedgedriver found: $currentPath"
        return
    }

    # 检测 WebView2 版本
    $wv2 = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue
    if (-not $wv2) { $wv2 = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue }
    if (-not $wv2) { throw "WebView2 not found" }
    $ver = $wv2.pv
    Write-Host "WebView2 version: $ver"

    $url = "https://msedgedriver.microsoft.com/$ver/edgedriver_win64.zip"
    $zip = "$env:TEMP\msedgedriver_$ver.zip"
    $extract = "$env:TEMP\msedgedriver_$ver"

    Write-Host "Downloading msedgedriver from $url ..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::'Tls13','Tls12'
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add("User-Agent", "Mozilla/5.0")
    $wc.DownloadFile($url, $zip)

    Expand-Archive -Path $zip -DestinationPath $extract -Force
    New-Item -ItemType Directory -Path (Split-Path $edgePath) -Force | Out-Null
    Copy-Item "$extract\msedgedriver.exe" $edgePath -Force
    Write-Host "msedgedriver installed to $edgePath"
}

function Cleanup {
    Write-Host "--- E2E cleanup ---"
    Get-Process -Name "tauri-driver" -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process -Name "netssh" -ErrorAction SilentlyContinue | Stop-Process -Force
    $p = Get-NetTCPConnection -LocalPort $driverPort -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($p) { Stop-Process -Id $p.OwningProcess -Force -ErrorAction SilentlyContinue }
}
trap { Cleanup; exit 1 }

Push-Location $projectRoot
try {
    Ensure-EdgeDriver

    # 编译 (release 模式，App 启动更快)
    Write-Host "--- Cargo build (release) ---"
    cargo build --manifest-path src-tauri/Cargo.toml --release
    if ($LASTEXITCODE -ne 0) { throw "Cargo build failed" }

    Write-Host "--- npm build ---"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm build failed" }

    # 清理端口
    $p = Get-NetTCPConnection -LocalPort $driverPort -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($p) { Stop-Process -Id $p.OwningProcess -Force; Start-Sleep 1 }

    # 启动 tauri-driver
    Write-Host "--- Starting tauri-driver ---"
    $driver = Start-Process -FilePath "tauri-driver" -ArgumentList "--port", $driverPort -PassThru -NoNewWindow
    Write-Host "tauri-driver PID: $($driver.Id)"
    $i = 0
    while ($i -lt 20) {
        try { $null = Invoke-WebRequest "http://127.0.0.1:4444/status" -TimeoutSec 2 -ErrorAction Stop; Write-Host "tauri-driver ready"; break }
        catch { Start-Sleep 1; $i++ }
    }
    if ($i -ge 20) { throw "tauri-driver did not start" }

    # 运行 E2E 测试 (wdio 会自动启动 App)
    Write-Host "--- Running E2E tests ---"
    npx wdio run webdriverio.conf.ts
    $testExit = $LASTEXITCODE

    Cleanup
    if ($testExit -ne 0) { Write-Host "E2E tests FAILED" -ForegroundColor Red; exit $testExit }
    Write-Host "E2E tests PASSED" -ForegroundColor Green
} finally {
    Pop-Location
}
