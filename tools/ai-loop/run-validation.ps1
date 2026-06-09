param(
  [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

$commands = @(
  @{ Name = "lint"; Command = "npm.cmd"; Args = @("run", "lint") },
  @{ Name = "test"; Command = "npm.cmd"; Args = @("test", "--", "--run") },
  @{ Name = "build"; Command = "npm.cmd"; Args = @("run", "build") },
  @{ Name = "cargo-test"; Command = "cargo"; Args = @("test", "--manifest-path", "src-tauri\Cargo.toml") }
)

$results = @()
$startedAt = Get-Date

function Invoke-ValidationCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [string[]]$Arguments
  )

  $resolvedCommand = (Get-Command $Command -ErrorAction Stop).Source
  $streamedOutput = New-Object System.Collections.Generic.List[string]
  Push-Location $repoRoot
  try {
    & $resolvedCommand @Arguments 2>&1 | ForEach-Object {
      $line = $_.ToString()
      $streamedOutput.Add($line)
      Write-Host $line
    }
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }

  [pscustomobject]@{
    ExitCode = $exitCode
    Output = ($streamedOutput -join [Environment]::NewLine).Trim()
  }
}

foreach ($item in $commands) {
  Write-Host "==> $($item.Name)" -ForegroundColor Cyan
  $run = Invoke-ValidationCommand -Command $item.Command -Arguments $item.Args
  $exitCode = $run.ExitCode
  $results += [pscustomobject]@{
    Name = $item.Name
    ExitCode = $exitCode
    Output = $run.Output
  }

  if ($exitCode -ne 0) {
    Write-Host $run.Output
    break
  }
}

$failed = $results | Where-Object { $_.ExitCode -ne 0 } | Select-Object -First 1

if ($ReportPath) {
  $overallStatus = if ($failed) { "failed" } else { "passed" }
  $reportFullPath = if ([System.IO.Path]::IsPathRooted($ReportPath)) {
    $ReportPath
  } else {
    Join-Path $repoRoot $ReportPath
  }
  $reportDir = Split-Path -Parent $reportFullPath
  if ($reportDir) {
    New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
  }

  $lines = @(
    "# Validation Report",
    "",
    "- Started: $($startedAt.ToString("yyyy-MM-dd HH:mm:ss"))",
    "- Finished: $((Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))",
    "- Result: $overallStatus",
    "",
    "## Commands"
  )

  foreach ($result in $results) {
    $status = if ($result.ExitCode -eq 0) { "passed" } else { "failed" }
    $lines += ""
    $lines += "### $($result.Name): $status"
    $lines += ""
    $lines += '```text'
    $lines += (($result.Output -split '\r?\n') | Select-Object -Last 80)
    $lines += '```'
  }

  Set-Content -Path $reportFullPath -Value $lines -Encoding UTF8
}

if ($failed) {
  exit $failed.ExitCode
}

exit 0
