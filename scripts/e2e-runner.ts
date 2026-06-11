#!/usr/bin/env npx tsx
/**
 * Tauri 2.0 E2E test runner.
 *
 * Spawns tauri-driver, connects via WebDriver protocol, runs test suites.
 *
 * Usage:
 *   npx tsx scripts/e2e-runner.ts
 *
 * Prerequisites:
 *   npm run build && cargo build && cargo install tauri-driver
 */

import { spawn, execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { remote, type Browser } from "webdriverio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const exe = resolve(projectRoot, "src-tauri", "target", "debug", "netssh.exe");

// ── Helpers ───────────────────────────────────────────────

function log(msg: string, color: "green" | "red" | "yellow" | "cyan" = "cyan") {
  const codes: Record<string, string> = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
  };
  console.log(`${codes[color]}${msg}\x1b[0m`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function killProcess(name: string) {
  try {
    execSync(`taskkill /f /im ${name}.exe 2>nul`, { stdio: "ignore" });
  } catch {
    // ignore
  }
}

// ── Test Suites ───────────────────────────────────────────

interface TestCase {
  name: string;
  run: (browser: Browser) => Promise<void>;
}

const suites: Record<string, TestCase[]> = {
  "Smoke Tests": [
    {
      name: "app window is visible",
      run: async (b) => {
        const app = await b.$(".app-window");
        if (!(await app.isExisting())) throw new Error(".app-window not found");
      },
    },
    {
      name: "title bar brand button exists",
      run: async (b) => {
        const btn = await b.$(".titlebar-brand");
        if (!(await btn.isExisting()))
          throw new Error(".titlebar-brand not found");
      },
    },
    {
      name: "sidebar is rendered",
      run: async (b) => {
        const sidebar = await b.$("aside.sidebar");
        if (!(await sidebar.isExisting()))
          throw new Error("aside.sidebar not found");
      },
    },
    {
      name: "workspace is rendered",
      run: async (b) => {
        const ws = await b.$("main.workspace");
        if (!(await ws.isExisting()))
          throw new Error("main.workspace not found");
      },
    },
    {
      name: "host rows exist in sidebar",
      run: async (b) => {
        const rows = await b.$$(".host-row");
        if (rows.length === 0) throw new Error("no .host-row elements found");
      },
    },
    {
      name: "host rows show alias text",
      run: async (b) => {
        const alias = await b.$(".host-row .host-alias");
        if (!(await alias.isExisting()))
          throw new Error(".host-alias not found");
        const text = await alias.getText();
        if (!text.trim()) throw new Error("alias text is empty");
      },
    },
    {
      name: "search input exists",
      run: async (b) => {
        const input = await b.$(".search input");
        if (!(await input.isExisting()))
          throw new Error(".search input not found");
      },
    },
  ],

  "Interaction Tests": [
    {
      name: "single-click host → detail panel shows",
      run: async (b) => {
        const row = await b.$(".host-row");
        await row.click();
        await sleep(400);
        const header = await b.$(".host-detail-header__alias");
        if (!(await header.isExisting()))
          throw new Error("host detail header not shown after click");
      },
    },
    {
      name: "detail shows Connect button",
      run: async (b) => {
        const btn = await b.$(".host-detail-header__actions .btn");
        if (!(await btn.isExisting()))
          throw new Error("Connect button not found");
        const text = await btn.getText();
        if (!text) throw new Error("Connect button has no text");
      },
    },
    {
      name: "detail header alias matches active sidebar host",
      run: async (b) => {
        const sidebarAlias = await (
          await b.$(".host-row.active .host-alias")
        ).getText();
        const detailAlias = await (
          await b.$(".host-detail-header__alias")
        ).getText();
        if (sidebarAlias !== detailAlias)
          throw new Error(
            `Mismatch: sidebar="${sidebarAlias}" detail="${detailAlias}"`,
          );
      },
    },
    {
      name: "home button returns to landing",
      run: async (b) => {
        const brand = await b.$(".titlebar-brand");
        await brand.click();
        await sleep(400);
        const landing = await b.$(".landing");
        if (!(await landing.isExisting()))
          throw new Error("landing page not shown after home click");
      },
    },
  ],

  "Settings Tests": [
    {
      name: "gear button opens settings",
      run: async (b) => {
        const gear = await b.$(".titlebar .icon-btn");
        await gear.click();
        await sleep(500);
        const settings = await b.$(".settings");
        if (!(await settings.isExisting()))
          throw new Error(".settings panel not found");
      },
    },
    {
      name: "settings nav exists",
      run: async (b) => {
        const nav = await b.$(".settings-nav");
        if (!(await nav.isExisting()))
          throw new Error(".settings-nav not found");
      },
    },
    {
      name: "three theme cards present",
      run: async (b) => {
        const cards = await b.$$(".theme-card");
        if (cards.length !== 3)
          throw new Error(`expected 3 theme cards, got ${cards.length}`);
      },
    },
    {
      name: "switching theme changes data-theme attribute",
      run: async (b) => {
        const inactiveCards = await b.$$(".theme-card:not(.active)");
        if (inactiveCards.length === 0) return; // all active? skip
        const target = inactiveCards[0];
        const preview = await target.getAttribute("data-theme-preview");
        await target.click();
        await sleep(500);
        const html = await b.$("html");
        const theme = await html.getAttribute("data-theme");
        if (theme !== preview)
          throw new Error(
            `expected data-theme="${preview}", got "${theme}"`,
          );
      },
    },
    {
      name: "return home closes settings",
      run: async (b) => {
        const brand = await b.$(".titlebar-brand");
        await brand.click();
        await sleep(400);
        const landing = await b.$(".landing");
        if (!(await landing.isExisting()))
          throw new Error("not back on landing page");
      },
    },
  ],
};

// ── Main ──────────────────────────────────────────────────

async function main() {
  log("══ Netssh E2E Runner ══", "cyan");

  // 1. Clean stale processes
  await killProcess("netssh");
  await killProcess("tauri-driver");

  // 2. Start tauri-driver
  log("Starting tauri-driver...", "yellow");
  const driverProc = spawn("tauri-driver", ["--port", "4444"], {
    stdio: "ignore",
    detached: false,
  });
  await sleep(2000);

  // Verify driver is ready
  try {
    const resp = await fetch("http://127.0.0.1:4444/status");
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    log("tauri-driver ready", "green");
  } catch {
    log("tauri-driver failed to start", "red");
    process.exit(1);
  }

  // 3. Connect to the Tauri app via WebDriver
  log("Connecting to Tauri app...", "yellow");
  let browser: Browser;
  try {
    browser = await remote({
      hostname: "127.0.0.1",
      port: 4444,
      path: "/",
      protocol: "http",
      capabilities: {
        // Tauri 2.0 — DO NOT set browserName; tauri-driver auto-detects
        // @ts-expect-error Tauri-specific capability
        "tauri:options": { executable: exe },
      },
      waitforTimeout: 10_000,
      connectionRetryTimeout: 30_000,
      connectionRetryCount: 3,
    });
    log("WebDriver session created", "green");
  } catch (err: any) {
    log(`Failed to create WebDriver session: ${err.message}`, "red");
    driverProc.kill();
    process.exit(1);
  }

  await sleep(1500); // Let UI fully render

  // 4. Run test suites
  let totalPassed = 0;
  let totalFailed = 0;

  for (const [suiteName, tests] of Object.entries(suites)) {
    log(`\n── ${suiteName} ──`, "cyan");

    for (const test of tests) {
      try {
        await test.run(browser);
        log(`  ✓ ${test.name}`, "green");
        totalPassed++;
      } catch (err: any) {
        log(`  ✗ ${test.name}`, "red");
        log(`    ${err.message}`, "red");
        totalFailed++;

        // Screenshot on failure
        try {
          const ts = Date.now();
          await browser.saveScreenshot(`./e2e-failure-${ts}.png`);
          log(`    screenshot saved: e2e-failure-${ts}.png`, "yellow");
        } catch {
          // screenshot may fail if session is dead
        }
      }
    }
  }

  // 5. Report
  log(`\n═══════════════════════════════`, "cyan");
  log(`  Passed: ${totalPassed}`, "green");
  if (totalFailed > 0) log(`  Failed: ${totalFailed}`, "red");
  log(`  Total:  ${totalPassed + totalFailed}`, "cyan");
  log(`═══════════════════════════════`, "cyan");

  // 6. Cleanup
  try {
    await browser.deleteSession();
  } catch {
    // session might already be dead
  }
  driverProc.kill();
  await killProcess("netssh");

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  log(`FATAL: ${err.message}`, "red");
  console.error(err);
  process.exit(1);
});
