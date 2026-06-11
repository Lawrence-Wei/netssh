#!/usr/bin/env npx tsx
/**
 * Browser-based E2E test runner for Netssh frontend.
 *
 * Tests the React UI against the Vite dev server using a real browser (Edge/Chrome).
 * The Tauri backend is mocked (same as vitest setup).
 *
 * Usage:
 *   1. Terminal 1: npm run dev          (starts Vite on :1420)
 *   2. Terminal 2: npx tsx scripts/e2e-browser.ts
 *
 * Requirements: msedgedriver in PATH (installed by e2e-quick.ps1)
 */

import { spawn, execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { remote, type Browser } from "webdriverio";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// ── Helpers ───────────────────────────────────────────────

function log(msg: string, color: "green" | "red" | "yellow" | "cyan" = "cyan") {
  const codes: Record<string, string> = {
    green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m",
  };
  console.log(`${codes[color]}${msg}\x1b[0m`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Test Suites ───────────────────────────────────────────

interface TestCase {
  name: string;
  run: (browser: Browser) => Promise<void>;
}

// Simpler selectors that work with browser-based WebDriver
const suites: Record<string, TestCase[]> = {
  "Render Tests": [
    {
      name: "app-window is rendered",
      run: async (b) => {
        const el = await b.$(".app-window");
        if (!(await el.isExisting())) throw new Error(".app-window missing");
      },
    },
    {
      name: "titlebar is rendered",
      run: async (b) => {
        const el = await b.$(".titlebar");
        if (!(await el.isExisting())) throw new Error(".titlebar missing");
      },
    },
    {
      name: "sidebar is rendered",
      run: async (b) => {
        const el = await b.$(".sidebar");
        if (!(await el.isExisting())) throw new Error(".sidebar missing");
      },
    },
    {
      name: "workspace is rendered",
      run: async (b) => {
        const el = await b.$(".workspace");
        if (!(await el.isExisting())) throw new Error(".workspace missing");
      },
    },
    {
      name: "page title is Netssh",
      run: async (b) => {
        const title = await b.getTitle();
        if (title !== "Netssh") throw new Error(`title is "${title}"`);
      },
    },
  ],

  "Sidebar Tests": [
    {
      name: "host rows exist",
      run: async (b) => {
        const rows = await b.$$(".host-row");
        if (rows.length === 0) throw new Error("no host rows");
      },
    },
    {
      name: "host rows show alias text",
      run: async (b) => {
        const alias = await b.$(".host-row .host-alias");
        if (!(await alias.isExisting())) throw new Error(".host-alias missing");
        const txt = await alias.getText();
        if (!txt.trim()) throw new Error("alias is empty");
      },
    },
    {
      name: "search input exists",
      run: async (b) => {
        const inp = await b.$(".search input");
        if (!(await inp.isExisting())) throw new Error("search input missing");
      },
    },
    {
      name: "click host row opens detail panel",
      run: async (b) => {
        const rows = await b.$$(".host-row");
        if (rows.length === 0) return;
        await rows[0].click();
        await sleep(500);
        const header = await b.$(".host-detail-header__alias");
        if (!(await header.isExisting()))
          throw new Error("detail header not shown");
      },
    },
    {
      name: "detail shows Connect button",
      run: async (b) => {
        const btn = await b.$(".host-detail-header__actions .btn");
        if (!(await btn.isExisting())) throw new Error("Connect btn missing");
        const txt = await btn.getText();
        if (!txt.trim()) throw new Error("Connect btn has no text");
      },
    },
    {
      name: "click brand button goes home",
      run: async (b) => {
        const brand = await b.$(".titlebar-brand");
        await brand.click();
        await sleep(300);
        const landing = await b.$(".landing");
        if (!(await landing.isExisting()))
          throw new Error("landing not shown");
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
        const panel = await b.$(".settings");
        if (!(await panel.isExisting())) throw new Error("settings missing");
      },
    },
    {
      name: "three theme cards present",
      run: async (b) => {
        const cards = await b.$$(".theme-card");
        if (cards.length !== 3)
          throw new Error(`expected 3 cards, got ${cards.length}`);
      },
    },
    {
      name: "click theme card changes active state",
      run: async (b) => {
        const inactive = await b.$$(".theme-card:not(.active)");
        if (inactive.length === 0) return;
        const preview = await inactive[0].getAttribute("data-theme-preview");
        await inactive[0].click();
        await sleep(300);
        // Check the card is now active
        const cls = await inactive[0].getAttribute("class");
        if (!cls.includes("active"))
          throw new Error("card did not become active");

        // Check data-theme on html
        const html = await b.$("html");
        const theme = await html.getAttribute("data-theme");
        if (theme !== preview)
          throw new Error(`expected ${preview}, got ${theme}`);
      },
    },
    {
      name: "switch language tab in settings",
      run: async (b) => {
        const navBtns = await b.$$(".settings-nav button");
        if (navBtns.length < 2) return;
        await navBtns[1].click();
        await sleep(300);
        const section = await b.$(".settings-section");
        if (!(await section.isExisting()))
          throw new Error("section not found after switching");
      },
    },
  ],
};

// ── Main ──────────────────────────────────────────────────

async function main() {
  log("══ Netssh Browser E2E ══", "cyan");

  // 1. Check dev server
  log("Checking Vite dev server...", "yellow");
  let devReady = false;
  for (let i = 0; i < 10; i++) {
    try {
      const resp = await fetch("http://localhost:1420");
      if (resp.ok) { devReady = true; break; }
    } catch {}
    await sleep(1000);
  }
  if (!devReady) {
    log("Vite dev server not running. Start with: npm run dev", "red");
    process.exit(1);
  }
  log("Vite dev server ready", "green");

  // 2. Kill stale msedge processes that might interfere
  try { execSync("taskkill /f /im msedge.exe 2>nul", { stdio: "ignore" }); } catch {}

  // 3. Start msedgedriver
  log("Starting msedgedriver...", "yellow");
  const driver = spawn("msedgedriver", ["--port=9515"], {
    stdio: "ignore",
  });
  await sleep(2000);

  // Check driver
  try {
    const r = await fetch("http://127.0.0.1:9515/status");
    if (!r.ok) throw new Error("not ok");
    log("msedgedriver ready", "green");
  } catch {
    log("msedgedriver failed to start", "red");
    driver.kill();
    process.exit(1);
  }

  // 4. Create browser session
  log("Starting Edge browser...", "yellow");
  let browser: Browser;
  try {
    browser = await remote({
      hostname: "127.0.0.1",
      port: 9515,
      path: "/",
      protocol: "http",
      capabilities: {
        browserName: "msedge",
        "ms:edgeOptions": {
          args: ["--headless=new", "--window-size=1280,800", "--no-sandbox"],
          binary: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        },
      },
      waitforTimeout: 10_000,
    });
    log("Browser session created", "green");
  } catch (err: any) {
    log(`Failed: ${err.message}`, "red");
    driver.kill();
    process.exit(1);
  }

  // 5. Navigate to the app
  await browser.url("http://localhost:1420");
  await sleep(2000); // Let React render
  log("Navigated to app", "green");

  // Inject test hosts into localStorage so sidebar has data
  log("Injecting test hosts...", "yellow");
  await browser.execute(() => {
    const testHosts = [
      {
        id: "test-host-1",
        alias: "Test Ubuntu Server",
        hostname: "192.168.1.10",
        user: "admin",
        port: 22,
        role: "linux",
        tags: [],
        hue: 0,
        favorite: false,
        group: "Servers",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "test-host-2",
        alias: "Test Router",
        hostname: "10.0.0.1",
        user: "root",
        port: 22,
        role: "router",
        tags: ["production"],
        hue: 120,
        favorite: true,
        group: "Network",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "test-host-3",
        alias: "Test Switch",
        hostname: "10.0.0.2",
        user: "admin",
        port: 22,
        role: "switch",
        tags: ["staging"],
        hue: 240,
        favorite: false,
        group: "Network",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    localStorage.setItem(
      "netssh.hosts",
      JSON.stringify({
        state: { hosts: testHosts, groups: [{ id: "group-1", name: "Network" }, { id: "group-2", name: "Servers" }] },
        version: 0,
      }),
    );
  });
  // Reload to pick up the injected hosts
  await browser.url("http://localhost:1420");
  await sleep(1500);
  log("Test hosts injected", "green");

  // 6. Run tests
  let passed = 0;
  let failed = 0;

  for (const [suiteName, tests] of Object.entries(suites)) {
    log(`\n── ${suiteName} ──`, "cyan");
    for (const test of tests) {
      try {
        await test.run(browser);
        log(`  ✓ ${test.name}`, "green");
        passed++;
      } catch (err: any) {
        log(`  ✗ ${test.name}`, "red");
        log(`    ${err.message}`, "red");
        failed++;
        try {
          const ts = Date.now();
          await browser.saveScreenshot(`./e2e-failure-browser-${ts}.png`);
          log(`    screenshot: e2e-failure-browser-${ts}.png`, "yellow");
        } catch {}
      }
    }
  }

  // 7. Report
  log(`\n═══════════════════════════════`, "cyan");
  log(`  Passed: ${passed}`, "green");
  if (failed > 0) log(`  Failed: ${failed}`, "red");
  log(`  Total:  ${passed + failed}`, "cyan");
  log(`═══════════════════════════════`, "cyan");

  // 8. Cleanup
  await browser.deleteSession();
  driver.kill();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  log(`FATAL: ${err.message}`, "red");
  console.error(err);
  process.exit(1);
});
