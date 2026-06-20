param(
  [switch]$Open,
  [string]$Browser = "electron",
  [int]$Port = 1420
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BaseUrl = "http://127.0.0.1:$Port"
$Server = $null
$StartedServer = $false

function Test-NetsshDevServer {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return [int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Wait-NetsshDevServer {
  param([string]$Url)
  $deadline = (Get-Date).AddSeconds(35)
  while ((Get-Date) -lt $deadline) {
    if (Test-NetsshDevServer -Url $Url) {
      return
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Vite dev server did not become ready at $Url"
}

try {
  if (-not (Test-NetsshDevServer -Url $BaseUrl)) {
    $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npm) {
      $npm = (Get-Command npm -ErrorAction Stop).Source
    }

    $Server = Start-Process `
      -FilePath $npm `
      -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1") `
      -WorkingDirectory $RepoRoot `
      -WindowStyle Hidden `
      -PassThru
    $StartedServer = $true
    Wait-NetsshDevServer -Url $BaseUrl
  }

  $env:CYPRESS_BASE_URL = $BaseUrl
  if ($Open) {
    & npx cypress open --e2e --browser $Browser
  } else {
    & npx cypress run --browser $Browser
  }
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  if ($StartedServer -and $Server -and -not $Server.HasExited) {
    Stop-Process -Id $Server.Id -Force
  }
}
