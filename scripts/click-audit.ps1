#!/usr/bin/env pwsh
param(
    [string]$BaseUrl = "",
    [int]$Port = 0,
    [int]$MaxClicks = 80,
    [switch]$Headed,
    [string]$ReportDir = ".ai\reports"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$previewJob = $null
$exitCode = 1

function Get-FreeTcpPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try {
        return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    } finally {
        $listener.Stop()
    }
}

function Wait-Http([string]$Url) {
    for ($i = 0; $i -lt 40; $i++) {
        try {
            $response = Invoke-WebRequest $Url -TimeoutSec 1 -ErrorAction Stop
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    throw "Preview server did not become ready at $Url"
}

Push-Location $projectRoot
try {
    if (-not $BaseUrl) {
        if ($Port -le 0) {
            $Port = Get-FreeTcpPort
        }

        Write-Host "Building browser preview..." -ForegroundColor Cyan
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build failed with exit $LASTEXITCODE"
        }

        $BaseUrl = "http://127.0.0.1:$Port/"
        Write-Host "Starting Vite preview at $BaseUrl" -ForegroundColor Cyan
        $previewJob = Start-Job -Name "netssh-click-audit-preview" -ScriptBlock {
            param($Root, $PreviewPort)
            Set-Location $Root
            npm run preview -- --host 127.0.0.1 --port $PreviewPort --strictPort
        } -ArgumentList $projectRoot, $Port

        Wait-Http $BaseUrl
    }

    $reportPath = if ([System.IO.Path]::IsPathRooted($ReportDir)) {
        $ReportDir
    } else {
        Join-Path $projectRoot $ReportDir
    }
    New-Item -ItemType Directory -Path $reportPath -Force | Out-Null

    $env:NETSSH_CLICK_AUDIT_BASE_URL = $BaseUrl
    $env:NETSSH_CLICK_AUDIT_MAX_CLICKS = [string]$MaxClicks
    $env:NETSSH_CLICK_AUDIT_REPORT_DIR = $reportPath
    $env:NETSSH_CLICK_AUDIT_HEADLESS = if ($Headed) { "0" } else { "1" }

    npx tsx scripts/click-audit.ts
    $exitCode = $LASTEXITCODE
} finally {
    if ($previewJob) {
        Stop-Job $previewJob -ErrorAction SilentlyContinue | Out-Null
        Remove-Job $previewJob -Force -ErrorAction SilentlyContinue | Out-Null
    }
    Pop-Location
}

exit $exitCode
