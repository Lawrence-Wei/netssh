#!/usr/bin/env npx tsx
/**
 * Tauri desktop E2E runner.
 *
 * Starts a private tauri-driver process and points Netssh at a temporary
 * NETSSH_DATA_DIR so desktop E2E does not use the user's real AppData DB.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Color = "green" | "red" | "yellow" | "cyan";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const requestedDriverPort = Number(process.env.NETSSH_E2E_DRIVER_PORT || "0");
const appExecutable =
  process.env.NETSSH_E2E_APP ||
  resolve(projectRoot, "src-tauri", "target", "debug", "netssh.exe");
const dataDir =
  process.env.NETSSH_DATA_DIR ||
  mkdtempSync(join(tmpdir(), "netssh-tauri-e2e-data-"));

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

function cleanEnv(extra: Record<string, string>) {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ),
    ...extra,
  };
}

async function waitForDriver(proc: ChildProcess, port: number) {
  for (let i = 0; i < 30; i += 1) {
    if (proc.exitCode != null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/status`);
      if (response.ok) return;
    } catch {
      // Keep polling until tauri-driver opens the port.
    }
    await sleep(500);
  }
  throw new Error(`tauri-driver did not become ready on port ${port}`);
}

async function freeTcpPort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function main() {
  const driverPort = requestedDriverPort > 0 ? requestedDriverPort : await freeTcpPort();
  log("== Netssh Tauri E2E Runner ==", "cyan");
  log(`App: ${appExecutable}`, "yellow");
  log(`Driver port: ${driverPort}`, "yellow");
  log(`NETSSH_DATA_DIR: ${dataDir}`, "yellow");

  if (!existsSync(appExecutable)) {
    log("App executable not found. Run: cargo build --manifest-path src-tauri/Cargo.toml", "red");
    process.exit(1);
  }

  const driver = spawn("tauri-driver", ["--port", String(driverPort)], {
    stdio: "ignore",
    env: cleanEnv({
      NETSSH_DATA_DIR: dataDir,
    }),
  });

  let exitCode = 1;

  try {
    await waitForDriver(driver, driverPort);
    log("tauri-driver ready", "green");

    const command = process.platform === "win32" ? "cmd.exe" : "npx";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", "npx wdio run wdio.conf.ts"]
      : ["wdio", "run", "wdio.conf.ts"];
    const wdio = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      env: cleanEnv({
        NETSSH_DATA_DIR: dataDir,
        NETSSH_E2E_DRIVER_PORT: String(driverPort),
        NETSSH_E2E_APP: appExecutable,
      }),
    });

    exitCode = await new Promise<number>((resolve) => {
      wdio.on("exit", (code) => resolve(code ?? 1));
      wdio.on("error", (error) => {
        log(error.message, "red");
        resolve(1);
      });
    });
  } catch (error) {
    exitCode = 1;
    log(error instanceof Error ? error.message : String(error), "red");
  } finally {
    driver.kill();
  }

  process.exit(exitCode);
}

main().catch((error) => {
  log(`FATAL: ${error instanceof Error ? error.message : String(error)}`, "red");
  console.error(error);
  process.exit(1);
});
