/**
 * E2E interaction tests — sidebar click, double-click, host detail, and connect flow.
 *
 * Run: npx wdio run wdio.conf.ts --spec src/test/e2e/interaction.e2e.ts
 */

import { browser, $, expect } from "@wdio/globals";
import { addHost, goHome, searchSidebar, waitForAppShell } from "./helpers";

describe("Netssh — Sidebar Interactions", () => {
  before(async () => {
    await waitForAppShell();
    await addHost("e2e-router", "10.10.10.1", "admin");
    await addHost("e2e-ecs", "10.10.10.2", "root");
  });

  //
  // ── Single-Click → Host Detail ──────────────────────────
  //
  it("should show host detail panel on single-click", async () => {
    await searchSidebar("e2e-router");
    const firstRow = await $(".host-row");
    await firstRow.click();
    await browser.pause(300);

    const detailHeader = await $(".host-detail-header__alias");
    await expect(detailHeader).toBePresent();
    await expect(detailHeader).toHaveText("e2e-router");
  });

  it("host detail should show a Connect button", async () => {
    // The Connect button is inside .host-detail-header__actions
    const connectBtn = await $(".host-detail-header__actions .btn");
    await expect(connectBtn).toBePresent();

    const text = await connectBtn.getText();
    // Should say "Connect" (English default)
    expect(text.length).toBeGreaterThan(0);
  });

  it("host detail should show basic info key-value pairs", async () => {
    const detail = await $(".host-detail-header");
    const text = await detail.getText();
    expect(text).toContain("admin@10.10.10.1");
  });

  it("host detail header alias should match the clicked host", async () => {
    const activeRow = await $(".host-row.active .host-alias");
    const sidebarAlias = await activeRow.getText();

    const detailAlias = await $(".host-detail-header__alias");
    const detailText = await detailAlias.getText();

    expect(detailText).toBe(sidebarAlias);
  });

  //
  // ── Search → Topology Sync ──────────────────────────────
  //
  it("sidebar search should also narrow the home topology", async () => {
    await goHome();
    await searchSidebar("e2e-ecs");
    const topology = await $(".topology-panel");
    const text = await topology.getText();
    expect(text).toContain("e2e-ecs");
    expect(text).not.toContain("e2e-router");
  });

  //
  // ── Navigation: Return to Home ──────────────────────────
  //
  it("should navigate back to home via the brand button", async () => {
    await goHome();
    const landing = await $(".landing");
    await expect(landing).toBePresent();
  });
});
