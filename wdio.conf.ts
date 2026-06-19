import type { WebdriverIOConfig } from "@wdio/types";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const driverPort = Number(process.env.NETSSH_E2E_DRIVER_PORT || "4444");
const appExecutable = process.env.NETSSH_E2E_APP || join(
  __dirname,
  "src-tauri",
  "target",
  "debug",
  "netssh.exe",
);

/**
 * Tauri 2.0 WebDriver E2E test configuration.
 *
 * Prerequisites:
 *   1. npm run build       →  frontend compiled to dist/
 *   2. cargo build          →  netssh.exe in target/debug/
 *   3. cargo install tauri-driver
 *
 * The tauri-driver proxy handles session creation.
 * WDIO connects to it directly on localhost:4444.
 */
export const config: WebdriverIOConfig = {
  runner: "local",

  // Connect to tauri-driver WebDriver proxy
  hostname: "127.0.0.1",
  port: driverPort,
  path: "/",
  protocol: "http",

  specs: ["./src/test/e2e/**/*.e2e.ts"],

  maxInstances: 1,
  maxInstancesPerCapability: 1,

  capabilities: [
    {
      // @ts-expect-error tauri:options is Tauri-specific.
      "tauri:options": {
        application: appExecutable,
      },
      acceptInsecureCerts: true,
    },
  ],

  logLevel: "warn",
  reporters: ["spec"],

  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 60_000,
  },

  // ── Hooks ───────────────────────────────────────────────

  before: async () => {
    // Give the Tauri window time to fully render
    await browser.pause(1000);
  },

  afterTest: async function (_test, _context, result) {
    if (result.error) {
      const ts = Date.now();
      await browser.saveScreenshot(`./e2e-failure-${ts}.png`);
    }
  },
};
