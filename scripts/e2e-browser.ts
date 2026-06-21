#!/usr/bin/env npx tsx
/**
 * Safe browser E2E runner for the Vite preview/dev UI.
 *
 * This runner never kills a user's Edge processes. It launches a fresh
 * temporary browser profile, drives the current UI, and removes the profile
 * when the WebDriver session ends.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remote, type Browser } from "webdriverio";

type Color = "green" | "red" | "yellow" | "cyan";

interface TestCase {
  name: string;
  run: (browser: Browser) => Promise<void>;
}

const baseUrl = process.env.NETSSH_E2E_BASE_URL || "http://localhost:1420/";
const edgeBinary =
  process.env.NETSSH_E2E_EDGE_BINARY ||
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const headless = process.env.NETSSH_E2E_HEADLESS !== "0";
const tempProfile = mkdtempSync(join(tmpdir(), "netssh-browser-e2e-"));
const screenshotDir = mkdtempSync(join(tmpdir(), "netssh-browser-e2e-failures-"));

function log(message: string, color: Color = "cyan") {
  const codes: Record<Color, string> = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
  };
  console.log(`${codes[color]}${message}\x1b[0m`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApp(browser: Browser) {
  await browser.waitUntil(
    async () => {
      const shell = await browser.$(".app-window");
      return (await shell.isExisting()) && (await shell.isDisplayed());
    },
    { timeout: 15_000, timeoutMsg: "App shell did not render" },
  );
}

async function expectExists(browser: Browser, selector: string, label = selector) {
  const el = await browser.$(selector);
  if (!(await el.isExisting())) throw new Error(`${label} missing`);
  return el;
}

async function goHome(browser: Browser) {
  await (await expectExists(browser, ".titlebar-brand", "brand button")).click();
  await browser.waitUntil(
    async () => await (await browser.$(".topology-panel")).isExisting(),
    { timeout: 5_000, timeoutMsg: "Home topology did not appear" },
  );
}

async function addHost(browser: Browser, alias: string, hostname: string, user: string) {
  await goHome(browser);
  const quickButtons = await browser.$$(".sidebar-quick__btn");
  if (quickButtons.length < 1) throw new Error("sidebar quick add button missing");
  await quickButtons[0].click();

  const editor = await expectExists(browser, ".host-editor-full", "host editor");
  await (await editor.$('input[placeholder="my-server"]')).setValue(alias);
  await (await editor.$('input[placeholder*="192.168.1.1"]')).setValue(hostname);
  await (await editor.$('input[placeholder="root"]')).setValue(user);

  const footerButtons = await editor.$$(".host-editor-full__foot .btn");
  if (footerButtons.length === 0) throw new Error("host editor save button missing");
  await footerButtons[footerButtons.length - 1].click();

  await browser.waitUntil(
    async () => {
      const title = await browser.$(".host-detail-header__alias");
      return (await title.isExisting()) && (await title.getText()) === alias;
    },
    { timeout: 5_000, timeoutMsg: `Host ${alias} was not saved` },
  );
}

async function browserText(browser: Browser, selector = "body") {
  return (await browser.$(selector)).getText();
}

async function seedSiteDragFixtures(browser: Browser) {
  await browser.execute(() => {
    const groups = [
      { id: "unassigned", name: "Unassigned", color: "#897e6e" },
      { id: "wuxi", name: "Wuxi", color: "#6f7f95", subnet: "192.168.66.0/24" },
    ];
    const hosts = [
      {
        id: "drag-macbook",
        alias: "drag-macbook",
        hostname: "192.168.66.200",
        user: "lawrence",
        port: 22,
        group: "unassigned",
        status: "off",
        latency: null,
      },
    ];
    window.localStorage.setItem("netssh.hosts", JSON.stringify({ state: { hosts, groups }, version: 0 }));
    window.localStorage.setItem(
      "netssh.settings",
      JSON.stringify({ state: { lang: "zh", followSystem: false, theme: "purple" }, version: 0 }),
    );
  });
  await browser.refresh();
  await waitForApp(browser);
}

async function dragSidebarHostToWuxi(browser: Browser) {
  const moved = await browser.execute(() => {
    const source = Array.from(document.querySelectorAll<HTMLElement>(".host-row"))
      .find((item) => item.textContent?.includes("drag-macbook"));
    const target = Array.from(document.querySelectorAll<HTMLElement>(".host-group"))
      .find((item) => item.textContent?.includes("无锡") || item.textContent?.includes("Wuxi"));
    if (!source || !target) return false;

    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", "drag-macbook");
    const eventInit = { bubbles: true, cancelable: true, dataTransfer };

    source.dispatchEvent(new DragEvent("dragstart", eventInit));
    target.dispatchEvent(new DragEvent("dragenter", eventInit));
    target.dispatchEvent(new DragEvent("dragover", eventInit));
    target.dispatchEvent(new DragEvent("drop", eventInit));
    source.dispatchEvent(new DragEvent("dragend", eventInit));
    return true;
  });
  if (!moved) throw new Error("could not find drag source or Wuxi site target");

  await browser.waitUntil(
    async () => {
      const groups = await browser.$$(".host-group");
      for (const group of groups) {
        const text = await group.getText();
        if ((text.includes("无锡") || text.includes("Wuxi")) && text.includes("drag-macbook")) {
          return true;
        }
      }
      return false;
    },
    { timeout: 5_000, timeoutMsg: "dragged host did not appear under Wuxi site" },
  );
}

const tests: TestCase[] = [
  {
    name: "app shell renders",
    run: async (browser) => {
      await expectExists(browser, ".titlebar", "titlebar");
      await expectExists(browser, ".sidebar", "sidebar");
      await expectExists(browser, ".workspace", "workspace");
      await expectExists(browser, ".topology-panel", "topology panel");
    },
  },
  {
    name: "settings gear opens settings",
    run: async (browser) => {
      await (await expectExists(browser, ".titlebar-settings-btn", "settings gear")).click();
      await expectExists(browser, ".settings-nav", "settings nav");
      const cards = await browser.$$(".theme-card");
      if (cards.length !== 4) throw new Error(`expected 4 theme cards, got ${cards.length}`);
    },
  },
  {
    name: "can add hosts through current editor",
    run: async (browser) => {
      await addHost(browser, "e2e-router", "10.20.30.1", "admin");
      await addHost(browser, "e2e-ecs", "10.20.30.2", "root");
      const body = await browserText(browser);
      if (!body.includes("e2e-ecs")) throw new Error("saved host is not visible");
    },
  },
  {
    name: "sidebar search narrows topology",
    run: async (browser) => {
      await goHome(browser);
      await (await expectExists(browser, ".sidebar .search input", "sidebar search")).setValue("e2e-ecs");
      await sleep(500);
      const topology = await browserText(browser, ".topology-panel");
      if (!topology.includes("e2e-ecs")) throw new Error("matching host not in topology");
      if (topology.includes("e2e-router")) throw new Error("nonmatching host remained in topology");
    },
  },
  {
    name: "sidebar host can be dragged into Wuxi site",
    run: async (browser) => {
      await seedSiteDragFixtures(browser);
      await dragSidebarHostToWuxi(browser);
    },
  },
  {
    name: "manual connection opens browser fallback terminal",
    run: async (browser) => {
      await (await expectExists(browser, ".tab-new", "new tab button")).click();
      const card = await expectExists(browser, ".manual-card", "manual connection card");
      const inputs = await card.$$("input");
      if (inputs.length < 3) throw new Error("manual connection inputs missing");
      await inputs[0].setValue("10.0.0.50");
      await inputs[1].setValue("root");
      await inputs[2].setValue("secret");
      await (await card.$(".manual-card__foot--primary .btn")).click();
      await browser.waitUntil(
        async () => await (await browser.$(".terminal-wrap, .xterm-mount .xterm")).isExisting(),
        { timeout: 6_000, timeoutMsg: "terminal surface did not open" },
      );
      const body = await browserText(browser);
      if (/transformcallback|Connection failed|无法打开 SSH 会话/i.test(body)) {
        throw new Error("manual connection showed a browser fallback error");
      }
    },
  },
  {
    name: "browser console has no severe errors",
    run: async (browser) => {
      const logs = await browser.getLogs("browser").catch(() => []);
      const severe = logs
        .filter((entry) => String(entry.level).toUpperCase() === "SEVERE")
        .map((entry) => entry.message)
        .filter((message) => !/favicon/i.test(message));
      if (severe.length) throw new Error(severe.join("\n"));
    },
  },
];

async function main() {
  log("== Netssh Browser E2E ==", "cyan");
  log(`Base URL: ${baseUrl}`, "yellow");
  log(`Temp profile: ${tempProfile}`, "yellow");

  try {
    const response = await fetch(baseUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch {
    log("Vite dev server is not reachable. Start it with: npm run dev", "red");
    process.exit(1);
  }

  const args = [
    `--user-data-dir=${tempProfile}`,
    "--window-size=1440,960",
    "--disable-gpu",
    "--no-sandbox",
  ];
  if (headless) args.unshift("--headless=new");

  const browser = await remote({
    logLevel: "error",
    capabilities: {
      browserName: "MicrosoftEdge",
      "ms:edgeOptions": {
        binary: edgeBinary,
        args,
      },
      "goog:loggingPrefs": { browser: "ALL" },
    },
    waitforTimeout: 10_000,
  });

  let passed = 0;
  let failed = 0;

  try {
    await browser.url(baseUrl);
    await waitForApp(browser);

    for (const test of tests) {
      try {
        await test.run(browser);
        passed += 1;
        log(`  OK ${test.name}`, "green");
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        log(`  FAIL ${test.name}`, "red");
        log(`       ${message}`, "red");
        const screenshot = join(screenshotDir, `${Date.now()}-${test.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`);
        await browser.saveScreenshot(screenshot).catch(() => undefined);
        log(`       screenshot: ${screenshot}`, "yellow");
      }
    }
  } finally {
    await browser.deleteSession().catch(() => undefined);
  }

  log(`\nPassed: ${passed}`, "green");
  if (failed) log(`Failed: ${failed}`, "red");
  log(`Total: ${passed + failed}`, "cyan");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  log(`FATAL: ${error instanceof Error ? error.message : String(error)}`, "red");
  console.error(error);
  process.exit(1);
});
