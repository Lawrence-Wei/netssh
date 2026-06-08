$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$backlog = Join-Path $repoRoot ".ai\backlog.md"

if (-not (Test-Path $backlog)) {
  throw "Missing backlog: $backlog"
}

$line = Get-Content $backlog | Where-Object { $_ -match '^\s*-\s+\[\s\]\s+' } | Select-Object -First 1

if ($line) {
  $line -replace '^\s*-\s+\[\s\]\s+', ''
} else {
  "No unchecked backlog item found."
}
