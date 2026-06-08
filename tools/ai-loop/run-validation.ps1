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
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $resolvedCommand
  $startInfo.Arguments = ($Arguments | ForEach-Object { ConvertTo-ProcessArgument $_ }) -join " "
  $startInfo.WorkingDirectory = $repoRoot
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  [pscustomobject]@{
    ExitCode = $process.ExitCode
    Output = (($stdout, $stderr) -join [Environment]::NewLine).Trim()
  }
}

function ConvertTo-ProcessArgument {
  param([string]$Value)

  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  '"' + ($Value -replace '\\(?=\\*")', '$0$0' -replace '"', '\"') + '"'
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
