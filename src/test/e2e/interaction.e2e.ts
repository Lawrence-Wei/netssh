/**
 * E2E interaction tests — sidebar click, double-click, host detail, and connect flow.
 *
 * Run: npx wdio run wdio.conf.ts --spec src/test/e2e/interaction.e2e.ts
 */

import { browser, $, $$, expect } from "@wdio/globals";

describe("Netssh — Sidebar Interactions", () => {
  //
  // ── Single-Click → Host Detail ──────────────────────────
  //
  it("should show host detail panel on single-click", async () => {
    // Click the first host row
    const firstRow = await $(".host-row");
    await firstRow.click();
    await browser.pause(300);

    // Should see the host detail header
    const detailHeader = await $(".host-detail-header__alias");
    await expect(detailHeader).toBePresent();
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
    const kvRows = await $$(".kvlist .kvrow");
    // Host detail should show at least alias and hostname
    expect(kvRows.length).toBeGreaterThanOrEqual(2);
  });

  it("host detail header alias should match the clicked host", async () => {
    // Read alias from the active sidebar row
    const activeRow = await $(".host-row.active .host-alias");
    const sidebarAlias = await activeRow.getText();

    // Read alias from the detail panel
    const detailAlias = await $(".host-detail-header__alias");
    const detailText = await detailAlias.getText();

    expect(detailText).toBe(sidebarAlias);
  });

  //
  // ── Double-Click → Connect ──────────────────────────────
  //
  it("should show a connected terminal after double-click", async () => {
    // Double-click the active host row to trigger connection
    const activeRow = await $(".host-row.active");
    await activeRow.doubleClick();
    await browser.pause(2000); // Allow SSH negotiation time

    // After connection, .terminal-wrap should be present
    const terminal = await $(".terminal-wrap");
    await expect(terminal).toBePresent();
  });

  //
  // ── Navigation: Return to Home ──────────────────────────
  //
  it("should navigate back to home via the brand button", async () => {
    const brandBtn = await $(".titlebar-brand");
    await brandBtn.click();
    await browser.pause(300);

    // Should show landing/home page
    const landing = await $(".landing");
    await expect(landing).toBePresent();
  });
});
