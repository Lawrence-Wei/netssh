$newVersion = "1.1.14"

# package.json
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$pkg.version = $newVersion
$pkg | ConvertTo-Json -Depth 10 | Set-Content package.json.tmp
Move-Item -Force package.json.tmp package.json

# Cargo.toml — ^ 锚定行首，只改 [package] 下的 version
(Get-Content src-tauri/Cargo.toml) -replace '^version = ".*"', "version = ""$newVersion""" | Set-Content src-tauri/Cargo.toml

# tauri.conf.json
(Get-Content src-tauri/tauri.conf.json) -replace '"version": ".*"', """version"": ""$newVersion""" | Set-Content src-tauri/tauri.conf.json

Write-Host "Version bumped to $newVersion"
