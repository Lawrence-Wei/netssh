/**
 * E2E smoke tests — verify critical UI elements are present and interactive.
 *
 * Run: npx wdio run wdio.conf.ts --spec src/test/e2e/smoke.e2e.ts
 */

import { $, $$, expect } from "@wdio/globals";
import { waitForAppShell } from "./helpers";

describe("Netssh — Smoke Tests", () => {
  before(async () => {
    await waitForAppShell();
  });

  //
  // ── App Launch ──────────────────────────────────────────
  //
  it("should display the app window", async () => {
    const app = await $(".app-window");
    await expect(app).toBePresent();
  });

  it("should show the title bar", async () => {
    const titlebar = await $(".titlebar-brand");
    await expect(titlebar).toBePresent();
  });

  it("should show the sidebar", async () => {
    const sidebar = await $("aside.sidebar");
    await expect(sidebar).toBePresent();
  });

  it("should show the workspace", async () => {
    const workspace = await $("main.workspace");
    await expect(workspace).toBePresent();
  });

  //
  // ── Home / Topology ─────────────────────────────────────
  //
  it("should show the topology panel on home", async () => {
    const topology = await $(".topology-panel");
    await expect(topology).toBePresent();
  });

  //
  // ── Search / Filter ─────────────────────────────────────
  //
  it("should have a search input in the sidebar", async () => {
    const searchInput = await $(".search input");
    await expect(searchInput).toBePresent();
  });

  it("should have the current sidebar quick actions", async () => {
    const buttons = await $$(".sidebar-quick__btn");
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });
});
