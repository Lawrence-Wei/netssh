$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $repoRoot "package.json"
$bundleRoot = Join-Path $repoRoot "src-tauri\target\release\bundle"
$releasesRoot = Join-Path $repoRoot "releases"

if (!(Test-Path $packageJsonPath)) {
  throw "package.json not found at $packageJsonPath"
}

if (!(Test-Path $bundleRoot)) {
  throw "Tauri bundle output not found at $bundleRoot. Run npm run tauri:build first."
}

$packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
$version = [string]$packageJson.version
if ([string]::IsNullOrWhiteSpace($version)) {
  throw "package.json version is empty."
}

$tag = "v$version"
$releaseDir = Join-Path $releasesRoot $tag
$releasesRootPath = [System.IO.Path]::GetFullPath($releasesRoot)
$releaseDirPath = [System.IO.Path]::GetFullPath($releaseDir)
$bundleRootPath = (Resolve-Path $bundleRoot).Path

if (!$releaseDirPath.StartsWith($releasesRootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to write outside releases directory: $releaseDirPath"
}

$artifacts = Get-ChildItem -Path $bundleRootPath -Recurse -File |
  Where-Object { $_.Name -like "*$version*" }

if (!$artifacts) {
  throw "No Tauri bundle artifacts matching version $version were found under $bundleRootPath."
}

if (Test-Path $releaseDirPath) {
  Remove-Item -LiteralPath $releaseDirPath -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $releaseDirPath | Out-Null

foreach ($artifact in $artifacts) {
  $relativePath = $artifact.FullName.Substring($bundleRootPath.Length).TrimStart('\', '/')
  $targetPath = Join-Path $releaseDirPath $relativePath
  New-Item -ItemType Directory -Force -Path (Split-Path $targetPath) | Out-Null
  Copy-Item -LiteralPath $artifact.FullName -Destination $targetPath -Force
  Write-Host "Copied $relativePath"
}

Write-Host "Release artifacts copied to $releaseDirPath"
