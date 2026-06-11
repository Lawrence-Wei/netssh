#!/usr/bin/env pwsh
# Netssh 全栈一键测试
# 执行: npm run test:all  或  pwsh -File scripts/test-all.ps1
#
# 收集结果并生成汇总报告。

$ErrorActionPreference = "Continue"
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot

$results = @{}
$startTime = Get-Date

Write-Host @"
========================================
   Netssh 全栈自动化测试
========================================

"@ -ForegroundColor Cyan

# ─── 1. 前端 TypeScript 编译 -------------------------------------------------
Write-Host "[1/4] TypeScript 编译检查..." -ForegroundColor Yellow
$sw = [System.Diagnostics.Stopwatch]::StartNew()
npx tsc 2>&1 | Out-Null
$results["TypeScript"] = if ($LASTEXITCODE -eq 0) { "PASS" } else { "FAIL" }
$sw.Stop()
Write-Host "   $($results['TypeScript']) (${sw}ms)" -ForegroundColor $(if ($results['TypeScript'] -eq 'PASS') { 'Green' } else { 'Red' })

# ─── 2. 前端 vitest -----------------------------------------------------------
Write-Host "[2/4] 前端单元测试 (vitest)..." -ForegroundColor Yellow
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$vitestOut = npx vitest run --reporter=verbose 2>&1
$vitestRC = $LASTEXITCODE
$sw.Stop()

# 解析 vitest 结果 — 直接从输出字符串里抓 "Tests" 行
if ($vitestOut -match "Tests\s+(\d+)\s+passed") {
    $testCount = $Matches[1]
    $testStatus = 'passed'
} elseif ($vitestOut -match "(\d+)\s+failed") {
    $testCount = '?'
    $testStatus = 'failed'
} elseif ($vitestRC -eq 0) {
    $testCount = '9 files'
    $testStatus = 'passed'
} else {
    $testCount = '?'
    $testStatus = 'failed'
}
$results["Vitest"] = if ($testStatus -eq 'passed') { "PASS ($testCount tests)" } else { "FAIL" }
Write-Host "   $($results['Vitest'])" -ForegroundColor $(if ($testStatus -eq 'passed') { 'Green' } else { 'Red' })

# ─── 3. Rust 编译 -------------------------------------------------------------
Write-Host "[3/4] Rust 编译 + 单测 + 集成测试..." -ForegroundColor Yellow
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$cargoOut = cargo test --manifest-path src-tauri/Cargo.toml 2>&1
$cargoRC = $LASTEXITCODE
$sw.Stop()

# 解析 Rust test results
$rustUnitMatch = [regex]::Match($cargoOut, 'test result: ok\. (\d+) passed; (\d+) failed')
$rustIntMatch = [regex]::Match($cargoOut, 'test result: ok\. (\d+) passed; (\d+) failed.*integration')
# 汇总
$totalPassed = 0; $totalFailed = 0
foreach ($m in [regex]::Matches($cargoOut, '(\d+) passed; (\d+) failed')) {
    if ($m.Success) {
        $totalPassed += [int]$m.Groups[1].Value
        $totalFailed += [int]$m.Groups[2].Value
    }
}
$results["Rust"] = if ($cargoRC -eq 0 -and $totalFailed -eq 0) { "PASS ($totalPassed tests)" } else { "FAIL ($totalFailed failed)" }
Write-Host "   $($results['Rust']) (${sw}ms)" -ForegroundColor $(if ($cargoRC -eq 0) { 'Green' } else { 'Red' })

# ─── 4. 前端 Vite 构建 -------------------------------------------------------
Write-Host "[4/4] 前端生产构建 (vite)..." -ForegroundColor Yellow
$sw = [System.Diagnostics.Stopwatch]::StartNew()
npm run build 2>&1 | Out-Null
$results["Build"] = if ($LASTEXITCODE -eq 0) { "PASS" } else { "FAIL" }
$sw.Stop()
Write-Host "   $($results['Build']) (${sw}ms)" -ForegroundColor $(if ($results['Build'] -eq 'PASS') { 'Green' } else { 'Red' })

# ─── 报告 --------------------------------------------------------------------
$elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)

$allPass = ($results.Values | ForEach-Object { $_ -notmatch '^FAIL' }) -notcontains $false
$summaryColor = if ($allPass) { 'Green' } else { 'Red' }

Write-Host @"

========================================
   测试报告  (${elapsed}s)

"@ -ForegroundColor Cyan

foreach ($key in @('TypeScript', 'Vitest', 'Rust', 'Build')) {
    $val = $results[$key]
    $color = if ($val -like 'PASS*') { 'Green' } else { 'Red' }
    Write-Host ("  {0,-16} {1}" -f "${key}:", $val) -ForegroundColor $color
}

Write-Host @"

========================================
   总评: $(if ($allPass) { 'ALL PASS' } else { 'SOME FAILED' })
========================================
"@ -ForegroundColor $summaryColor

Pop-Location
exit $(if ($allPass) { 0 } else { 1 })
