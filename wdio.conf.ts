import type { WebdriverIOConfig } from "@wdio/types";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  port: 4444,
  path: "/",
  protocol: "http",

  specs: ["./src/test/e2e/**/*.e2e.ts"],

  maxInstances: 1,

  capabilities: [
    {
      // @ts-expect-error tauri:options is Tauri-specific
      "tauri:options": {
        executable: join(
          __dirname,
          "src-tauri",
          "target",
          "debug",
          "netssh.exe",
        ),
      },
      browserName: "chrome",
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

  before: () => {
    // Give the Tauri window time to fully render
    browser.pause(1000);
  },

  afterTest: async function (_test, _context, result) {
    if (result.error) {
      const ts = Date.now();
      await browser.saveScreenshot(`./e2e-failure-${ts}.png`);
    }
  },
};
