param(
  [Parameter(Mandatory = $true)]
  [string]$Task,
  [string]$Status = "draft"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$reportPath = Join-Path $repoRoot ".ai\reports\$timestamp.md"

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $reportPath) | Out-Null

$content = @(
  "# Checkpoint: $Task",
  "",
  "## Summary",
  "",
  "- Status: $Status",
  "- Created: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")",
  "",
  "## Files Changed",
  "",
  "- TBD",
  "",
  "## Validation",
  "",
  "- `npm run lint`: TBD",
  "- `npm test -- --run`: TBD",
  "- `npm run build`: TBD",
  "- `cargo test --manifest-path src-tauri\Cargo.toml`: TBD",
  "",
  "## Sub-Agent Notes",
  "",
  "- TBD",
  "",
  "## Next Task",
  "",
  "- TBD"
)

Set-Content -Path $reportPath -Value $content -Encoding UTF8
Write-Output $reportPath
