#!/usr/bin/env pwsh
param(
    [ValidateSet("debug", "release")]
    [string]$Profile = "debug",
    [int]$DriverPort = 0
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$bin = if ($Profile -eq "release") {
    Join-Path $projectRoot "src-tauri\target\release\netssh.exe"
} else {
    Join-Path $projectRoot "src-tauri\target\debug\netssh.exe"
}
$dataDir = Join-Path $env:TEMP ("netssh-e2e-data-" + [guid]::NewGuid().ToString("N"))

function Get-FreeTcpPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try {
        return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    } finally {
        $listener.Stop()
    }
}

function Ensure-EdgeDriver {
    $currentPath = (Get-Command msedgedriver -ErrorAction SilentlyContinue).Source
    if ($currentPath) {
        Write-Host "msedgedriver found: $currentPath" -ForegroundColor Green
        return
    }

    Write-Host "msedgedriver not in PATH. Installing to ~/.cargo/bin..." -ForegroundColor Yellow
    $wv2 = Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue
    if (-not $wv2) {
        $wv2 = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" -ErrorAction SilentlyContinue
    }
    if (-not $wv2) { throw "WebView2 runtime not found; install Microsoft Edge WebView2 Runtime first." }

    $ver = $wv2.pv
    $url = "https://msedgedriver.microsoft.com/$ver/edgedriver_win64.zip"
    $zip = Join-Path $env:TEMP "msedgedriver_$ver.zip"
    $out = Join-Path $env:TEMP "msedgedriver_$ver"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add("User-Agent", "Mozilla/5.0")
    $wc.DownloadFile($url, $zip)
    Expand-Archive $zip $out -Force

    $targetDir = Join-Path $env:USERPROFILE ".cargo\bin"
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    Copy-Item (Join-Path $out "msedgedriver.exe") (Join-Path $targetDir "msedgedriver.exe") -Force
}

function Wait-Driver([int]$Port) {
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $null = Invoke-WebRequest "http://127.0.0.1:$Port/status" -TimeoutSec 1 -ErrorAction Stop
            return
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    throw "tauri-driver did not become ready on port $Port"
}

Push-Location $projectRoot
$driverJob = $null
try {
    if (-not (Test-Path $bin)) {
        throw "Binary not found: $bin. Run cargo build --manifest-path src-tauri/Cargo.toml first."
    }

    if ($DriverPort -le 0) {
        $DriverPort = Get-FreeTcpPort
    }

    $portOwner = Get-NetTCPConnection -LocalPort $DriverPort -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($portOwner) {
        throw "Port $DriverPort is already in use by PID $($portOwner.OwningProcess). Set -DriverPort to another value."
    }

    Ensure-EdgeDriver
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

    Write-Host "Binary: $bin" -ForegroundColor Cyan
    Write-Host "Driver port: $DriverPort" -ForegroundColor Cyan
    Write-Host "NETSSH_DATA_DIR: $dataDir" -ForegroundColor Cyan

    $driverJob = Start-Job -Name "netssh-e2e-tauri-driver" -ScriptBlock {
        param($Port, $DataDir)
        $env:NETSSH_DATA_DIR = $DataDir
        tauri-driver --port $Port
    } -ArgumentList $DriverPort, $dataDir

    Wait-Driver $DriverPort
    Write-Host "tauri-driver ready" -ForegroundColor Green

    $env:NETSSH_DATA_DIR = $dataDir
    $env:NETSSH_E2E_DRIVER_PORT = [string]$DriverPort
    $env:NETSSH_E2E_APP = $bin

    npx wdio run wdio.conf.ts
    $exitCode = $LASTEXITCODE
} finally {
    if ($driverJob) {
        Stop-Job $driverJob -ErrorAction SilentlyContinue | Out-Null
        Remove-Job $driverJob -Force -ErrorAction SilentlyContinue | Out-Null
    }
    Pop-Location
}

if ($exitCode -eq 0) {
    Write-Host "ALL E2E PASSED" -ForegroundColor Green
} else {
    Write-Host "E2E FAILED (exit $exitCode)" -ForegroundColor Red
}
exit $exitCode
