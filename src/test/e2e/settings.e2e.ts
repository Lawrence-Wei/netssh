/**
 * E2E settings tests — theme switching, language toggle, and preferences panel.
 *
 * Run: npx wdio run wdio.conf.ts --spec src/test/e2e/settings.e2e.ts
 */

import { browser, $, $$, expect } from "@wdio/globals";
import { goHome, openSettings, waitForAppShell } from "./helpers";

describe("Netssh — Settings Panel", () => {
  before(async () => {
    await waitForAppShell();
  });

  //
  // ── Open Settings ───────────────────────────────────────
  //
  it("should open settings via the gear button", async () => {
    await openSettings();

    const settings = await $(".settings");
    await expect(settings).toBePresent();
  });

  it("should have a settings navigation sidebar", async () => {
    const nav = await $(".settings-nav");
    await expect(nav).toBePresent();
  });

  it("should have a settings content pane", async () => {
    const pane = await $(".settings-pane");
    await expect(pane).toBePresent();
  });

  it("should have theme cards in the appearance section", async () => {
    const themeCards = await $$(".theme-card");
    expect(themeCards.length).toBe(4);
  });

  //
  // ── Theme Switching ─────────────────────────────────────
  //
  it("should switch to a different theme", async () => {
    // Click a theme card that is NOT currently active
    const inactiveCards = await $$(".theme-card:not(.active)");
    if (inactiveCards.length > 0) {
      const targetCard = inactiveCards[0];
      const preview = await targetCard.getAttribute("data-theme-preview");
      await targetCard.click();
      await browser.pause(500);

      // Verify the card is now active
      const isActive = await targetCard.getAttribute("class");
      expect(isActive).toContain("active");

      // Verify data-theme on html element
      const html = await $("html");
      const dataTheme = await html.getAttribute("data-theme");
      expect(dataTheme).toBe(preview);
    }
  });

  //
  // ── Navigation Between Sections ─────────────────────────
  //
  it("should allow switching to language section", async () => {
    const navButtons = await $$(".settings-nav button");
    // Find and click the language nav button
    const langBtn = navButtons[1]; // Second nav item is usually language
    if (await langBtn.isExisting()) {
      await langBtn.click();
      await browser.pause(300);

      // Language section should have "Language" text or lang toggle
      const section = await $(".settings-section");
      await expect(section).toBePresent();
    }
  });

  it("should show app version in the about section", async () => {
    const navButtons = await $$(".settings-nav button");
    const aboutBtn = navButtons[navButtons.length - 1];
    await aboutBtn.click();

    const pane = await $(".settings-pane");
    await expect(pane).toBePresent();
    const text = await pane.getText();
    expect(text).toMatch(/(About Netssh|关于 Netssh)/);
    expect(text).toMatch(/\b\d+\.\d+\.\d+\b/);
  });

  //
  // ── Close Settings ──────────────────────────────────────
  //
  it("should close settings and return to home", async () => {
    await goHome();

    const landing = await $(".landing");
    await expect(landing).toBePresent();
  });
});
