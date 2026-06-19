import { browser, $, $$, expect } from "@wdio/globals";

export const APP_LOAD_TIMEOUT = 20_000;

export async function waitForAppShell() {
  await browser.waitUntil(
    async () => {
      const titlebar = await $(".titlebar");
      return (await titlebar.isExisting()) && (await titlebar.isDisplayed());
    },
    {
      timeout: APP_LOAD_TIMEOUT,
      timeoutMsg: "App shell .titlebar did not appear",
    },
  );
}

export async function goHome() {
  await $(".titlebar-brand").click();
  await browser.waitUntil(
    async () => {
      const topology = await $(".topology-panel");
      return (await topology.isExisting()) && (await topology.isDisplayed());
    },
    { timeout: 5_000, timeoutMsg: "Home topology did not appear" },
  );
}

export async function openSettings() {
  await $(".titlebar-settings-btn").click();
  await browser.waitUntil(
    async () => {
      const settings = await $(".settings");
      return (await settings.isExisting()) && (await settings.isDisplayed());
    },
    { timeout: 5_000, timeoutMsg: "Settings did not open" },
  );
}

export async function addHost(alias: string, hostname: string, user = "root") {
  await goHome();
  const addButton = (await $$(".sidebar-quick__btn"))[0];
  await addButton.click();

  const editor = await $(".host-editor-full");
  await expect(editor).toBeDisplayed();

  await (await editor.$('input[placeholder="my-server"]')).setValue(alias);
  await (await editor.$('input[placeholder*="192.168.1.1"]')).setValue(hostname);
  await (await editor.$('input[placeholder="root"]')).setValue(user);

  const footerButtons = await editor.$$(".host-editor-full__foot .btn");
  await footerButtons[footerButtons.length - 1].click();

  await browser.waitUntil(
    async () => {
      const detailAlias = await $(".host-detail-header__alias");
      return (await detailAlias.isExisting()) && (await detailAlias.getText()) === alias;
    },
    { timeout: 5_000, timeoutMsg: `Host detail for ${alias} did not appear` },
  );
}

export async function searchSidebar(query: string) {
  const input = await $(".sidebar .search input");
  await input.setValue(query);
}
