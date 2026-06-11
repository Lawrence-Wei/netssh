/**
 * E2E smoke tests — verify critical UI elements are present and interactive.
 *
 * Run: npx wdio run wdio.conf.ts --spec src/test/e2e/smoke.e2e.ts
 */

import { browser, $, $$, expect } from "@wdio/globals";

describe("Netssh — Smoke Tests", () => {
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
  // ── Sidebar Host List ───────────────────────────────────
  //
  it("should have at least one host row in the sidebar", async () => {
    const rows = await $$(".host-row");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("host rows should display alias text", async () => {
    const firstAlias = await $(".host-row .host-alias");
    await expect(firstAlias).toBePresent();
    const text = await firstAlias.getText();
    expect(text.length).toBeGreaterThan(0);
  });

  it("host rows should display host meta (user@hostname)", async () => {
    const firstMeta = await $(".host-row .host-meta");
    await expect(firstMeta).toBePresent();
  });

  //
  // ── Search / Filter ─────────────────────────────────────
  //
  it("should have a search input in the sidebar", async () => {
    const searchInput = await $(".search input");
    await expect(searchInput).toBePresent();
  });
});
