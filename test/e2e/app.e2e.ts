/**
 * Netssh E2E 测试 — 通过 tauri-driver 驱动实际桌面 App 进行全功能点按测试。
 *
 * 运行方式：
 *   1. cargo build                    # 编译 Rust 后端
 *   2. npm run build                  # 编译前端
 *   3. tauri-driver --port 4444 &     # 启动 WebDriver 代理
 *   4. npx tauri dev &                # 启动 App
 *   5. npx wdio run webdriverio.conf.ts
 *
 * 或者用一条命令：npm run test:e2e
 */

import { browser, $, $$, expect } from "@wdio/globals";

const APP_LOAD_TIMEOUT = 20_000;

/** 等待标题栏出现，确认 App 已渲染完成。 */
async function waitForAppShell() {
  await browser.waitUntil(
    async () => {
      const title = await $(".titlebar");
      return (await title.isExisting()) && (await title.isDisplayed());
    },
    {
      timeout: APP_LOAD_TIMEOUT,
      timeoutMsg: "App shell .titlebar did not appear",
    }
  );
}

/** 搜索侧边栏的文本输入框并返回引用。 */
async function sidebarSearchInput() {
  return $('.sidebar input[placeholder*="Search"]');
}

/** 获取侧边栏区域。 */
async function sidebar() {
  return $(".sidebar");
}

describe("Netssh E2E — App Shell", () => {
  before(async () => {
    // v2 Tauri 通过 tauri-driver 的 `tauri:options.application` 自动启动 App。
  });

  it("App 启动后渲染标题栏", async () => {
    await waitForAppShell();
    const tb = $(".titlebar");
    // 标题栏应有品牌名
    await expect(tb).toHaveText(expect.stringContaining("Netssh"));
  });

  it("窗口按钮存在（3 个）", async () => {
    const btns = await $$(".titlebar .win-controls button");
    expect(btns.length).toBe(3);
  });

  it("侧边栏有搜索输入框", async () => {
    const input = await sidebarSearchInput();
    await expect(input).toBeDisplayed();
  });

  it("工作区 DOM 存在", async () => {
    const ws = $(".workspace");
    await expect(ws).toBeDisplayed();
  });
});

describe("Netssh E2E — Sidebar", () => {
  it("搜索框接受输入", async () => {
    const input = await sidebarSearchInput();
    await input.setValue("192.168.1.1");
    const val = await input.getValue();
    expect(val).toBe("192.168.1.1");
    // 清理
    await input.clearValue();
  });

  it("筛选 chip 切换状态 (All → Local→ Favorites)", async () => {
    const localChip = $$(".sidebar .filter-chip").find(async (c) => (await c.getText()) === "Local");
    if (localChip) {
      await localChip.click();
      const classes = await localChip.getAttribute("class");
      expect(classes).toContain("active");
    }

    const allChip = $$(".sidebar .filter-chip").find(async (c) => (await c.getText()) === "All");
    if (allChip) {
      await allChip.click();
      const classes = await allChip.getAttribute("class");
      expect(classes).toContain("active");
    }
  });

  it("4 个快速操作按钮 (Add host / Batch / Import / New site)", async () => {
    const btns = await $$(".sidebar-quick__btn");
    expect(btns.length).toBe(4);
    const labels = (await Promise.all(btns.map(async (b) => await b.getText()))).join(",");
    expect(labels).toContain("host");
    expect(labels).toContain("Batch");
    expect(labels).toContain("Import");
    expect(labels).toContain("site");
  });
});

describe("Netssh E2E — Tab System", () => {
  it("New Tab 按钮创建新标签", async () => {
    const before = (await $$(".tab")).length;
    const newTabBtn = $(".tab-new");
    await newTabBtn.click();
    await browser.waitUntil(
      async () => (await $$(".tab")).length > before,
      { timeout: 3000, timeoutMsg: "Tab count did not increase" }
    );
    expect((await $$(".tab")).length).toBe(before + 1);
  });

  it("非固定标签可关闭", async () => {
    const before = (await $$(".tab")).length;
    if (before <= 1) {
      // 先创建一个
      await $(".tab-new").click();
      await browser.waitUntil(
        async () => (await $$(".tab")).length >= 2,
        { timeout: 3000 }
      );
    }
    const closeBtns = await $$(".tab .x");
    if (closeBtns.length > 0) {
      const target = (await $$(".tab")).length;
      await closeBtns[0].click();
      await browser.waitUntil(
        async () => (await $$(".tab")).length < target,
        { timeout: 3000 }
      );
    }
    // Home 标签永远保留
    expect((await $$(".tab")).length).toBeGreaterThanOrEqual(1);
  });
});

describe("Netssh E2E — Host Management", () => {
  it("点击 Add host 打开主机编辑器", async () => {
    const addBtn = $$(".sidebar-quick__btn").find(async (b) => (await b.getText()).includes("host"));
    if (!addBtn) throw new Error("Add host button not found");

    await addBtn.click();

    // 等待编辑器出现
    await browser.waitUntil(
      async () => {
        const heading = await $("h3");
        return (await heading.isDisplayed()) && (await heading.getText()).includes("Edit host");
      },
      { timeout: 5000, timeoutMsg: "Host editor did not open" }
    );
  });

  it("编辑器别名输入框预填 'new-host'", async () => {
    const aliasInput = await $('input[value="new-host"]');
    await expect(aliasInput).toBeDisplayed();
  });

  it("点击 Cancel 退出编辑模式，返回详情视图", async () => {
    const cancelBtns = await $$("button*=Cancel");
    if (cancelBtns.length > 0) {
      await cancelBtns[cancelBtns.length - 1].click();
    }

    // 等待 Connect 按钮出现
    await browser.waitUntil(
      async () => {
        const connectBtn = await $("button*=Connect");
        return await connectBtn.isDisplayed();
      },
      { timeout: 5000, timeoutMsg: "Connect button did not appear" }
    );
  });
});

describe("Netssh E2E — Settings", () => {
  it("点击 Preferences 打开设置面板", async () => {
    const prefBtn = $('[title="Preferences"]');
    await prefBtn.click();

    await browser.waitUntil(
      async () => {
        const nav = $(".settings-nav");
        return await nav.isDisplayed();
      },
      { timeout: 5000, timeoutMsg: "Settings nav did not appear" }
    );
  });

  it("设置导航包含 8 个选项", async () => {
    const items = await $$(".settings-nav button");
    expect(items.length).toBeGreaterThanOrEqual(8);
  });

  it("切换到 Language & region 显示 Follow system", async () => {
    const langBtn = $$(".settings-nav button").find(async (b) => (await b.getText()).includes("Language"));
    if (langBtn) {
      await langBtn.click();
      await browser.pause(500);
      const followToggle = await $("text=Follow system");
      await expect(followToggle).toBeDisplayed();
    }
  });

  it("点击蓝色主题卡片切换到 blue 主题", async () => {
    // 回到 Appearance
    const appearBtn = $$(".settings-nav button").find(async (b) => (await b.getText()).includes("Appearance"));
    if (appearBtn) await appearBtn.click();
    await browser.pause(300);

    const themeCards = await $$(".theme-card");
    if (themeCards.length >= 2) {
      await themeCards[1].click();
      await browser.pause(300);
      const attr = await $("html").getAttribute("data-theme");
      expect(attr).toBe("blue");
    }
  });
});

describe("Netssh E2E — Landing / Home", () => {
  it("点击 Go home 回到首页", async () => {
    const homeBtn = $('[title="Go home"]');
    await homeBtn.click();
    await browser.pause(500);

    // 首页应显示标语
    const page = $("text=land tonight");
    await expect(page).toBeDisplayed();
  });

  it("手动连接卡片渲染并包含输入框", async () => {
    const card = $(".manual-card");
    await expect(card).toBeDisplayed();

    const inputs = await card.$$("input");
    expect(inputs.length).toBeGreaterThanOrEqual(3);
  });

  it("手动连接 hostname 输入框可输入 IP", async () => {
    const card = $(".manual-card");
    const firstInput = card.$("input");
    await firstInput.setValue("10.0.0.1");
    expect(await firstInput.getValue()).toBe("10.0.0.1");
  });
});
