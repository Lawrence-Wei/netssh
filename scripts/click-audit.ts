#!/usr/bin/env npx tsx
/**
 * Exploratory click audit for Netssh's browser-rendered frontend.
 *
 * It runs against a Vite preview/dev URL with browser fallback APIs, seeds only
 * non-sensitive test hosts, clicks visible interactive nodes, and writes a
 * Markdown + JSON report that another AI/debugging pass can use as evidence.
 */

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { remote, type Browser } from "webdriverio";

type Color = "green" | "red" | "yellow" | "cyan";
type Severity = "high" | "medium" | "low";

interface Candidate {
  selector: string;
  signature: string;
  label: string;
  tag: string;
  role: string;
  text: string;
  classes: string;
  score: number;
}

interface ActionRecord {
  index: number;
  label: string;
  selector: string;
  beforeUrl: string;
  afterUrl?: string;
  result: "ok" | "finding";
  findingIds: string[];
}

interface Finding {
  id: string;
  severity: Severity;
  type: "click-error" | "runtime-error" | "app-health";
  actionIndex: number;
  label: string;
  selector: string;
  message: string;
  beforeUrl: string;
  afterUrl: string;
  screenshot?: string;
  details?: unknown;
}

interface BrowserLogEntry {
  level?: string;
  message?: string;
  timestamp?: number;
}

const baseUrl = process.env.NETSSH_CLICK_AUDIT_BASE_URL || "http://127.0.0.1:1420/";
const maxClicks = Number(process.env.NETSSH_CLICK_AUDIT_MAX_CLICKS || "80");
const headless = process.env.NETSSH_CLICK_AUDIT_HEADLESS !== "0";
const edgeBinary =
  process.env.NETSSH_E2E_EDGE_BINARY ||
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const reportDir = resolve(process.env.NETSSH_CLICK_AUDIT_REPORT_DIR || ".ai/reports");
const stamp = timestamp();
const assetsDir = join(reportDir, `click-audit-${stamp}-assets`);
const tempProfile = mkdtempSync(join(tmpdir(), "netssh-click-audit-"));

const knownNoise = [
  /favicon/i,
  /DevTools/i,
  /ResizeObserver loop/i,
  /Could not load source map/i,
  /WebSocket connection.*vite/i,
];

function log(message: string, color: Color = "cyan") {
  const codes: Record<Color, string> = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
  };
  console.log(`${codes[color]}${message}\x1b[0m`);
}

function timestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function cleanForFile(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "click";
}

function isNoise(message: string) {
  return knownNoise.some((pattern) => pattern.test(message));
}

function isBlockingOverlayClick(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /confirm-overlay|confirm-card|import-dialog|modal/i.test(message);
}

async function startBrowser() {
  const args = [
    `--user-data-dir=${tempProfile}`,
    "--window-size=1440,960",
    "--disable-gpu",
    "--no-sandbox",
  ];
  if (headless) args.unshift("--headless=new");

  return remote({
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
}

async function waitForApp(browser: Browser) {
  await browser.waitUntil(
    async () => {
      const app = await browser.$(".app-window");
      return (await app.isExisting()) && (await app.isDisplayed());
    },
    { timeout: 15_000, timeoutMsg: "App shell did not render" },
  );
}

async function seedAuditState(browser: Browser) {
  await browser.execute(() => {
    const hosts = [
      {
        id: "audit-router",
        alias: "audit-router",
        hostname: "192.0.2.1",
        user: "admin",
        port: 22,
        group: "audit-lab",
        connectionType: "ssh",
        assetType: "huawei",
        role: "switch",
        tags: ["audit", "switch"],
        status: "off",
        latency: null,
        favorite: true,
        order: 0,
        hue: "#60a5fa",
      },
      {
        id: "audit-server",
        alias: "audit-server",
        hostname: "192.0.2.2",
        user: "root",
        port: 22,
        group: "audit-lab",
        connectionType: "ssh",
        assetType: "ubuntu",
        role: "server",
        tags: ["audit", "linux"],
        status: "off",
        latency: null,
        favorite: false,
        order: 1,
        hue: "#a78bfa",
      },
      {
        id: "audit-console",
        alias: "audit-console",
        hostname: "COM9",
        user: "",
        port: 22,
        group: "audit-lab",
        connectionType: "serial",
        assetType: "cisco",
        role: "console",
        tags: ["audit", "serial"],
        status: "off",
        latency: null,
        favorite: false,
        order: 2,
        hue: "#f59e0b",
        serialProfile: {
          portName: "COM9",
          baudRate: 9600,
          dataBits: 8,
          parity: "none",
          stopBits: 1,
          flowControl: "none",
          lineEnding: "cr",
          presetId: "cisco-9600-8n1",
        },
      },
    ];
    const groups = [
      { id: "unassigned", name: "Unassigned", color: "#897e6e" },
      { id: "audit-lab", name: "Audit Lab", color: "#60a5fa", subnet: "192.0.2.0/24" },
    ];

    window.localStorage.setItem("netssh.hosts", JSON.stringify({ state: { hosts, groups }, version: 0 }));
    window.localStorage.setItem(
      "netssh.settings",
      JSON.stringify({
        state: {
          theme: "purple",
          lang: "en",
          followSystem: false,
          translucency: true,
          reduceMotion: true,
        },
        version: 0,
      }),
    );
  });
}

async function installErrorHooks(browser: Browser) {
  await browser.execute(() => {
    const win = window as typeof window & {
      __netsshClickAudit?: {
        installed: boolean;
        errors: Array<{ type: string; message: string; stack?: string; timestamp: number }>;
      };
    };
    if (win.__netsshClickAudit?.installed) return;

    const state = {
      installed: true,
      errors: [] as Array<{ type: string; message: string; stack?: string; timestamp: number }>,
    };
    win.__netsshClickAudit = state;

    const stringify = (value: unknown) => {
      if (value instanceof Error) return `${value.name}: ${value.message}`;
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };

    window.addEventListener("error", (event) => {
      state.errors.push({
        type: "window.error",
        message: event.message,
        stack: event.error?.stack,
        timestamp: Date.now(),
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      state.errors.push({
        type: "unhandledrejection",
        message: stringify(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        timestamp: Date.now(),
      });
    });

    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      state.errors.push({
        type: "console.error",
        message: args.map(stringify).join(" "),
        timestamp: Date.now(),
      });
      originalError(...args);
    };
  });
}

async function readClientErrors(browser: Browser) {
  return browser.execute(() => {
    const win = window as typeof window & {
      __netsshClickAudit?: {
        errors: Array<{ type: string; message: string; stack?: string; timestamp: number }>;
      };
    };
    const errors = win.__netsshClickAudit?.errors || [];
    if (win.__netsshClickAudit) win.__netsshClickAudit.errors = [];
    return errors;
  });
}

async function readBrowserLogs(browser: Browser) {
  const logs = (await browser.getLogs("browser").catch(() => [])) as BrowserLogEntry[];
  return logs
    .filter((entry) => String(entry.level || "").toUpperCase() === "SEVERE")
    .map((entry) => entry.message || "")
    .filter((message) => message && !isNoise(message));
}

async function appHealth(browser: Browser) {
  return browser.execute(() => {
    const app = document.querySelector(".app-window");
    const bodyText = document.body.innerText || "";
    const visibleText = bodyText.replace(/\s+/g, " ").trim();
    const blocking = document.querySelector(
      ".confirm-overlay, .modal, .import-dialog, .connection-error, .host-key-challenge",
    );
    return {
      hasApp: Boolean(app),
      bodyTextLength: visibleText.length,
      url: window.location.href,
      title: document.title,
      blockingText: blocking?.textContent?.replace(/\s+/g, " ").trim().slice(0, 240) || "",
    };
  });
}

async function discoverCandidates(browser: Browser, seen: Set<string>) {
  const seenList = Array.from(seen);
  return browser.execute((seenSignatures) => {
    const selectors = [
      "button",
      "[role='button']",
      "a[href]",
      "input[type='button']",
      "input[type='submit']",
      ".host-row",
      ".topology-node",
      ".theme-card",
      ".tab",
      ".seg button",
      ".toggle",
      ".settings-nav button",
      ".sidebar-filter",
      ".sidebar-quick__btn",
      ".select-pill",
    ].join(",");
    const skipText = /\b(remove|delete|danger|close app|exit app)\b|删除|移除|退出应用|关闭应用/i;
    const skipClosest = ".win-controls, .titlebar-close, .confirm-overlay, [data-click-audit-skip='true']";
    const seenSet = new Set(seenSignatures);

    const cssEscape = (value: string) => {
      const css = window.CSS as typeof window.CSS & { escape?: (raw: string) => string };
      return css.escape ? css.escape(value) : value.replace(/["\\#.:,[\]>+~*'=]/g, "\\$&");
    };

    const textOf = (element: Element) =>
      [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.textContent,
        element.getAttribute("placeholder"),
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);

    const isVisible = (element: Element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 3 &&
        rect.height > 3 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0.02
      );
    };

    const isDisabled = (element: Element) => {
      const disabled = (element as HTMLButtonElement | HTMLInputElement).disabled;
      return disabled || element.getAttribute("aria-disabled") === "true";
    };

    const selectorFor = (element: Element) => {
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && current !== document.body && current !== document.documentElement) {
        const testId = current.getAttribute("data-testid");
        if (testId) {
          parts.unshift(`[data-testid="${cssEscape(testId)}"]`);
          return parts.join(" > ");
        }
        if (current.id) {
          parts.unshift(`#${cssEscape(current.id)}`);
          return parts.join(" > ");
        }
        const tag = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (!parent) break;
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current?.tagName);
        const index = siblings.indexOf(current) + 1;
        parts.unshift(`${tag}:nth-of-type(${index})`);
        current = parent;
      }
      return `body > ${parts.join(" > ")}`;
    };

    const scoreFor = (element: Element) => {
      const classes = element.className.toString();
      let score = 1;
      if (classes.includes("host-row") || classes.includes("topology-node")) score += 20;
      if (classes.includes("sidebar-quick") || classes.includes("settings-nav")) score += 16;
      if (classes.includes("theme-card") || classes.includes("seg")) score += 12;
      if (classes.includes("tab") || classes.includes("titlebar")) score += 8;
      if (element.tagName.toLowerCase() === "button") score += 6;
      return score;
    };

    const nodes = Array.from(document.querySelectorAll(selectors));
    const candidates = nodes
      .filter((element) => !element.closest(skipClosest))
      .filter((element) => isVisible(element) && !isDisabled(element))
      .map((element) => {
        const selector = selectorFor(element);
        const text = textOf(element);
        const role = element.getAttribute("role") || "";
        const classes = element.className.toString();
        const signature = `${selector}|${text}|${role}`;
        return {
          selector,
          signature,
          label: text || `${element.tagName.toLowerCase()} ${classes}`.trim(),
          tag: element.tagName.toLowerCase(),
          role,
          text,
          classes,
          score: scoreFor(element),
        };
      })
      .filter((candidate) => !seenSet.has(candidate.signature))
      .filter((candidate) => !skipText.test(`${candidate.label} ${candidate.classes}`))
      .sort((a, b) => b.score - a.score || a.selector.localeCompare(b.selector));

    return candidates.slice(0, 120);
  }, seenList) as Promise<Candidate[]>;
}

async function dismissBlockingUi(browser: Browser) {
  const cancelSelectors = [
    ".confirm-overlay .btn.ghost",
    ".confirm-overlay .confirm-card__actions button",
    ".confirm-dialog .btn.ghost",
    ".confirm-dialog button",
    ".modal .btn.ghost",
    ".import-dialog .btn.ghost",
  ];
  for (const selector of cancelSelectors) {
    const element = await browser.$(selector);
    if ((await element.isExisting()) && (await element.isDisplayed())) {
      await element.click().catch(() => undefined);
      return;
    }
  }
  await browser.keys(["Escape"]).catch(() => undefined);
}

async function hasBlockingUi(browser: Browser) {
  return browser.execute(() =>
    Boolean(document.querySelector(".confirm-overlay, .modal, .import-dialog")),
  );
}

async function clickCandidate(browser: Browser, candidate: Candidate) {
  const element = await browser.$(candidate.selector);
  if (!(await element.isExisting())) throw new Error("Element disappeared before click");
  await element.scrollIntoView();
  await element.click();
}

async function screenshot(browser: Browser, actionIndex: number, label: string) {
  const path = join(assetsDir, `${String(actionIndex).padStart(3, "0")}-${cleanForFile(label)}.png`);
  await browser.saveScreenshot(path).catch(() => undefined);
  return path;
}

function findingMarkdown(finding: Finding) {
  const lines = [
    `### ${finding.id} ${finding.severity.toUpperCase()} ${finding.type}`,
    "",
    `- Action: ${finding.actionIndex} - ${finding.label}`,
    `- Selector: \`${finding.selector}\``,
    `- URL: ${finding.beforeUrl} -> ${finding.afterUrl}`,
    `- Message: ${finding.message}`,
  ];
  if (finding.screenshot) lines.push(`- Screenshot: \`${finding.screenshot}\``);
  return lines.join("\n");
}

function writeReports(actions: ActionRecord[], findings: Finding[]) {
  ensureDir(reportDir);
  ensureDir(assetsDir);
  const markdownPath = join(reportDir, `click-audit-${stamp}.md`);
  const jsonPath = join(reportDir, `click-audit-${stamp}.json`);
  const high = findings.filter((finding) => finding.severity === "high").length;
  const medium = findings.filter((finding) => finding.severity === "medium").length;
  const low = findings.filter((finding) => finding.severity === "low").length;

  const markdown = [
    "# Netssh Click Audit",
    "",
    `- Time: ${new Date().toISOString()}`,
    `- Base URL: ${baseUrl}`,
    `- Max clicks: ${maxClicks}`,
    `- Actions attempted: ${actions.length}`,
    `- Findings: ${findings.length} (${high} high, ${medium} medium, ${low} low)`,
    `- Assets: \`${assetsDir}\``,
    "",
    "## Findings",
    "",
    findings.length ? findings.map(findingMarkdown).join("\n\n") : "No runtime, click, or app-health findings were detected.",
    "",
    "## Action Trace",
    "",
    "| # | Result | Label | Selector | Findings |",
    "|---:|---|---|---|---|",
    ...actions.map((action) => {
      const label = action.label.replace(/\|/g, "\\|");
      const selector = action.selector.replace(/\|/g, "\\|");
      return `| ${action.index} | ${action.result} | ${label} | \`${selector}\` | ${action.findingIds.join(", ") || "-"} |`;
    }),
    "",
  ].join("\n");

  writeFileSync(markdownPath, markdown, "utf8");
  writeFileSync(jsonPath, JSON.stringify({ baseUrl, maxClicks, actions, findings, assetsDir }, null, 2), "utf8");
  return { markdownPath, jsonPath };
}

async function main() {
  ensureDir(reportDir);
  ensureDir(assetsDir);
  log("== Netssh Click Audit ==", "cyan");
  log(`Base URL: ${baseUrl}`, "yellow");
  log(`Temp profile: ${tempProfile}`, "yellow");

  const browser = await startBrowser();
  const seen = new Set<string>();
  const actions: ActionRecord[] = [];
  const findings: Finding[] = [];

  try {
    await browser.url(baseUrl);
    await seedAuditState(browser);
    await browser.refresh();
    await waitForApp(browser);
    await installErrorHooks(browser);
    await readClientErrors(browser);
    await readBrowserLogs(browser);

    for (let index = 1; index <= maxClicks; index += 1) {
      await installErrorHooks(browser);
      if (await hasBlockingUi(browser)) await dismissBlockingUi(browser);
      let candidates = await discoverCandidates(browser, seen);
      if (candidates.length === 0) {
        await dismissBlockingUi(browser);
        candidates = await discoverCandidates(browser, seen);
      }
      if (candidates.length === 0) break;

      const candidate = candidates[0];
      seen.add(candidate.signature);
      const beforeUrl = await browser.getUrl();
      const action: ActionRecord = {
        index,
        label: candidate.label,
        selector: candidate.selector,
        beforeUrl,
        result: "ok",
        findingIds: [],
      };

      try {
        await clickCandidate(browser, candidate);
        await browser.waitUntil(async () => (await appHealth(browser)).hasApp, { timeout: 2_000 }).catch(() => undefined);
      } catch (error) {
        if (isBlockingOverlayClick(error)) {
          action.afterUrl = await browser.getUrl().catch(() => beforeUrl);
          actions.push(action);
          await dismissBlockingUi(browser);
          continue;
        }
        const id = `F${String(findings.length + 1).padStart(3, "0")}`;
        const shot = await screenshot(browser, index, candidate.label);
        action.result = "finding";
        action.findingIds.push(id);
        findings.push({
          id,
          severity: "medium",
          type: "click-error",
          actionIndex: index,
          label: candidate.label,
          selector: candidate.selector,
          message: error instanceof Error ? error.message : String(error),
          beforeUrl,
          afterUrl: await browser.getUrl().catch(() => beforeUrl),
          screenshot: shot,
        });
        actions.push(action);
        await dismissBlockingUi(browser);
        continue;
      }

      const afterUrl = await browser.getUrl();
      action.afterUrl = afterUrl;

      const clientErrors = (await readClientErrors(browser)).filter((entry) => !isNoise(entry.message));
      const browserErrors = await readBrowserLogs(browser);
      const health = await appHealth(browser);
      const messages = [
        ...clientErrors.map((entry) => `${entry.type}: ${entry.message}`),
        ...browserErrors.map((entry) => `browser: ${entry}`),
      ];

      if (!health.hasApp || health.bodyTextLength < 8) {
        const id = `F${String(findings.length + 1).padStart(3, "0")}`;
        const shot = await screenshot(browser, index, candidate.label);
        action.result = "finding";
        action.findingIds.push(id);
        findings.push({
          id,
          severity: "high",
          type: "app-health",
          actionIndex: index,
          label: candidate.label,
          selector: candidate.selector,
          message: `App shell health failed: hasApp=${health.hasApp}, bodyTextLength=${health.bodyTextLength}`,
          beforeUrl,
          afterUrl,
          screenshot: shot,
          details: health,
        });
      }

      if (messages.length > 0) {
        const id = `F${String(findings.length + 1).padStart(3, "0")}`;
        const shot = await screenshot(browser, index, candidate.label);
        action.result = "finding";
        action.findingIds.push(id);
        findings.push({
          id,
          severity: "high",
          type: "runtime-error",
          actionIndex: index,
          label: candidate.label,
          selector: candidate.selector,
          message: messages.join("\n"),
          beforeUrl,
          afterUrl,
          screenshot: shot,
          details: { clientErrors, browserErrors, health },
        });
      }

      actions.push(action);
      if (health.blockingText) await dismissBlockingUi(browser);

      if (index % 10 === 0) {
        log(`  audited ${index} clicks, findings: ${findings.length}`, findings.length ? "yellow" : "green");
      }
    }
  } finally {
    await browser.deleteSession().catch(() => undefined);
  }

  const reports = writeReports(actions, findings);
  log(`Report: ${reports.markdownPath}`, findings.length ? "yellow" : "green");
  log(`JSON:   ${reports.jsonPath}`, findings.length ? "yellow" : "green");
  log(`Actions: ${actions.length}, findings: ${findings.length}`, findings.length ? "red" : "green");
  process.exit(findings.length ? 1 : 0);
}

main().catch((error) => {
  log(`FATAL: ${error instanceof Error ? error.message : String(error)}`, "red");
  console.error(error);
  process.exit(1);
});
