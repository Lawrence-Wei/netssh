/**
 * WebdriverIO 配置 — Netssh E2E 通过 tauri-driver
 *
 * 桌面运行方式：
 *   1. cargo build --manifest-path src-tauri/Cargo.toml
 *   2. npm run build
 *   3. npm run test:e2e   (自动启 tauri-driver + App + 运行测试)
 *
 * 手动分步：
 *   tauri-driver --port 4444 &
 *   npx wdio run webdriverio.conf.ts
 */

/// <reference types="webdriverio" />

const isCI = !!process.env.CI;

export const config: WebdriverIO.Config = {
  runner: "local",
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 60_000,
  },

  specs: ["./test/e2e/**/*.e2e.ts"],
  reporters: ["spec"],
  maxInstances: 1,

  // tauri-driver 默认 localhost:4444
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",
  protocol: "http",

  // Capabilities — tauri-driver 根据 tauri:options 启动 App
  capabilities: [
    {
      browserName: "chrome",
      "tauri:options": {
        // 默认用 debug 编译（调试信息更多，启动靠 msedgedriver 连接）
        application: "./src-tauri/target/debug/netssh.exe",
        args: [],
      },
    },
  ],

  logLevel: isCI ? "warn" : "info",
  outputDir: "./test/e2e/logs",
};
