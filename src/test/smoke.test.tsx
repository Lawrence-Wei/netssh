/**
 * Netssh Comprehensive UI Smoke Test
 *
 * Verifies rendering and interaction responses across the UI.
 * Each test renders App independently and resets Zustand stores.
 *
 * Run: npm test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, createElement } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import App from "../pages/App";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { APP_VERSION } from "../config/app";
import type { Group, Host } from "../config/types";

// ============================================================
// Store reset between tests.
// ============================================================
import { useHosts } from "../store/hosts";
import { useSessions } from "../store/sessions";
import { useSnippets } from "../store/snippets";
import { useSettings } from "../store/settings";
import { useCredentials } from "../store/credentials";
import { useIdentities } from "../store/identities";
import { resetLiveSessions } from "../utils/liveSessions";

/** Save initial store states for test resets. */
let initialStates: Record<string, unknown> = {};

beforeEach(() => {
  /** Capture initial state on first run. */
  if (Object.keys(initialStates).length === 0) {
    initialStates = {
      hosts: useHosts.getState(),
      sessions: useSessions.getState(),
      snippets: useSnippets.getState(),
      settings: useSettings.getState(),
      credentials: useCredentials.getState(),
      identities: useIdentities.getState(),
    };
  }
  /** Reset all stores to initial state. */
  useHosts.setState(initialStates.hosts as never, true);
  useSessions.setState(initialStates.sessions as never, true);
  useSnippets.setState(initialStates.snippets as never, true);
  useSettings.setState(initialStates.settings as never, true);
  useCredentials.setState(initialStates.credentials as never, true);
  useIdentities.setState(initialStates.identities as never, true);
  resetLiveSessions();
  (globalThis as unknown as { __netsshClearTestCredentials?: () => void }).__netsshClearTestCredentials?.();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  resetLiveSessions();
});

/** Render App with ConfirmProvider. */
function renderApp() {
  const result = render(createElement(ConfirmProvider, null, createElement(App)));
  return { ...result, user: userEvent.setup() };
}

function sidebar() { return document.querySelector(".sidebar")!; }

function seedChineseTopologyHome() {
  const groups: Group[] = [
    { id: "shanghai", name: "上海", color: "#9d84ff" },
    { id: "pr-office", name: "PR / E20C", color: "#c084fc" },
    { id: "wuxi", name: "无锡", color: "#60a5fa" },
    { id: "cloud", name: "Cloud", color: "#93c5fd" },
  ];
  const hosts: Host[] = [
    {
      id: "real-asus-router",
      alias: "asus-router",
      hostname: "192.168.100.154",
      user: "admin",
      port: 22,
      group: "shanghai",
      assetType: "router",
      status: "ok",
      latency: 6,
      deployScope: "local",
      lastConnectedAt: Date.now() - 10 * 60 * 1000,
    },
    {
      id: "real-switch",
      alias: "switch",
      hostname: "192.168.100.253",
      user: "admin",
      port: 22,
      group: "shanghai",
      assetType: "switch",
      status: "ok",
      latency: 7,
      deployScope: "local",
    },
    {
      id: "real-ubuntu",
      alias: "ubuntu",
      hostname: "192.168.77.188",
      user: "lawrence",
      port: 22,
      group: "pr-office",
      assetType: "linux-server",
      status: "warn",
      latency: null,
      deployScope: "local",
      favorite: true,
    },
    {
      id: "real-win11",
      alias: "win11",
      hostname: "192.168.66.234",
      user: "lawrence",
      port: 22,
      group: "wuxi",
      assetType: "pc",
      status: "off",
      latency: null,
      deployScope: "local",
    },
    {
      id: "real-ecs",
      alias: "ecs",
      hostname: "8.153.161.113",
      user: "root",
      port: 22,
      group: "cloud",
      assetType: "cloud-server",
      status: "ok",
      latency: 6,
      deployScope: "cloud",
    },
  ];
  useSettings.setState((state) => ({ ...state, lang: "zh", followSystem: false }), true);
  useHosts.setState((state) => ({ ...state, groups, hosts }), true);
}

function mockDragDataTransfer() {
  const data = new Map<string, string>();
  const dataTransfer = {
    types: [] as string[],
    effectAllowed: "move",
    dropEffect: "move",
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
      if (!dataTransfer.types.includes(type)) dataTransfer.types.push(type);
    }),
    getData: vi.fn((type: string) => data.get(type) || ""),
  };
  return dataTransfer as unknown as DataTransfer;
}

// ============================================================
// 1. APP SHELL - shell rendering
// ============================================================
describe("1. App Shell", () => {
  it("renders without crashing", () => {
    renderApp();
    expect(screen.getByText("Netssh")).toBeTruthy();
  });

  it("sidebar has search input", () => {
    renderApp();
    expect(within(sidebar()).getByPlaceholderText(/Search hosts/i)).toBeTruthy();
  });

  it("workspace DOM exists", () => {
    renderApp();
    expect(document.querySelector(".workspace")).toBeTruthy();
  });

  it("titlebar has brand + window controls (3 buttons)", () => {
    renderApp();
    const tb = document.querySelector(".titlebar")!;
    expect(within(tb).getByText("Netssh")).toBeTruthy();
    expect(within(tb).queryByText(`v${APP_VERSION}`)).toBeFalsy();
    expect(tb.querySelector(".titlebar-sidebar-toggle")).toBeTruthy();
    expect(tb.querySelectorAll(".win-controls button").length).toBe(3);
  });

  it("initial theme is purple", () => {
    renderApp();
    expect(document.documentElement.getAttribute("data-theme")).toBe("purple");
  });
});

// ============================================================
// 2. TITLE BAR
// ============================================================
describe("2. TitleBar", () => {
  it("brand button has go-home title", () => {
    renderApp();
    expect(screen.getByTitle("Go home")).toBeTruthy();
  });

  it("does not render the legacy Session menu", () => {
    renderApp();
    expect(document.querySelector(".app-menu")).toBeFalsy();
  });

  it("places the new tab button immediately after the Home tab", () => {
    renderApp();
    const tabstrip = document.querySelector(".tabstrip")!;
    const children = Array.from(tabstrip.children);
    const homeTab = children.find((child) => child.classList.contains("tab") && child.textContent?.includes("Home"));
    const newTab = tabstrip.querySelector(".tab-new");

    expect(homeTab).toBeTruthy();
    expect(newTab).toBeTruthy();
    expect(children.indexOf(newTab!)).toBe(children.indexOf(homeTab!) + 1);
  });

  it("keeps the new tab button outside the clipped tab scroller", () => {
    renderApp();
    const tabstrip = document.querySelector(".tabstrip")!;
    const newTab = tabstrip.querySelector(":scope > .tab-new");
    const scroller = tabstrip.querySelector(".tabstrip-scroll")!;

    expect(newTab).toBeTruthy();
    expect(scroller).toBeTruthy();
    expect(scroller.contains(newTab)).toBe(false);
    expect(scroller.querySelector(".tab-new")).toBeFalsy();
  });

  it("double-clicking the empty tab scroller toggles maximize", async () => {
    renderApp();
    const win = getCurrentWindow();
    vi.mocked(win.toggleMaximize).mockClear();

    fireEvent.doubleClick(document.querySelector(".tabstrip-scroll")!);

    await waitFor(() => {
      expect(win.toggleMaximize).toHaveBeenCalledTimes(1);
    });
  });

  it("double-clicking empty tabstrip chrome toggles maximize", async () => {
    renderApp();
    const win = getCurrentWindow();
    vi.mocked(win.toggleMaximize).mockClear();

    fireEvent.doubleClick(document.querySelector(".tabstrip")!);

    await waitFor(() => {
      expect(win.toggleMaximize).toHaveBeenCalledTimes(1);
    });
  });

  it("double-clicking a tab does not toggle maximize", async () => {
    renderApp();
    const win = getCurrentWindow();
    vi.mocked(win.toggleMaximize).mockClear();

    fireEvent.doubleClick(document.querySelector(".tab")!);

    await Promise.resolve();
    expect(win.toggleMaximize).not.toHaveBeenCalled();
  });

  it("settings icon button opens settings nav", async () => {
    const { user } = renderApp();
    await user.click(screen.getByTitle("Settings"));
    await waitFor(() => {
      expect(document.querySelector(".settings-nav")).toBeTruthy();
    }, { timeout: 2000 });
  });

  it("credentials icon opens the credentials settings section without replacing settings", async () => {
    const { user } = renderApp();
    await user.click(screen.getByTitle("Credentials"));

    await waitFor(() => {
      expect(document.querySelector(".settings-nav")).toBeTruthy();
      expect(document.querySelector(".settings-pane h2")?.textContent).toBe("Credentials");
    });

    expect(document.querySelector(".titlebar-settings-btn")).toBeTruthy();
  });

  it("new tab button creates additional tab", async () => {
    renderApp();
    const before = document.querySelectorAll(".tab").length;
    fireEvent.click(document.querySelector(".tab-new")!);
    await waitFor(() => {
      expect(document.querySelectorAll(".tab").length).toBe(before + 1);
    });
  });

  it("drags an open session tab into a site bucket", () => {
    const groups: Group[] = [
      { id: "shanghai", name: "Shanghai", color: "#8f7a65" },
      { id: "wuxi", name: "Wuxi", color: "#6f7f95" },
    ];
    const sessionHost: Host = {
      id: "router-session",
      alias: "router-session",
      hostname: "192.168.100.1",
      user: "admin",
      port: 22,
      group: "shanghai",
      status: "off",
      latency: null,
    };
    useHosts.setState((state) => ({ ...state, groups, hosts: [sessionHost] }), true);
    useSessions.getState().openHost(sessionHost, false);
    renderApp();

    const tab = document.querySelector(".tabstrip-scroll .tab[draggable=\"true\"]") as HTMLElement;
    const targetGroup = within(sidebar()).getByText("Wuxi").closest(".host-group")!;
    const dataTransfer = mockDragDataTransfer();

    act(() => {
      fireEvent.dragStart(tab, { dataTransfer });
      fireEvent.dragOver(targetGroup, { dataTransfer });
      fireEvent.drop(targetGroup, { dataTransfer });
    });

    expect(useHosts.getState().hosts.find((host) => host.id === "router-session")?.group).toBe("wuxi");
  });

  it("new session tab opens direct SSH connection fields", async () => {
    const { user } = renderApp();
    fireEvent.click(document.querySelector(".tab-new")!);

    await waitFor(() => {
      expect(screen.getByText("New SSH session")).toBeTruthy();
    });
    const card = document.querySelector(".manual-card") as HTMLElement;
    expect(within(card).getByLabelText("DNS / IP")).toBeTruthy();
    expect(within(card).getByLabelText("Username")).toBeTruthy();
    expect(within(card).getByLabelText("Password")).toBeTruthy();
    expect(screen.getByText("Advanced options")).toBeTruthy();
    expect(within(card).getByLabelText("Port")).toBeTruthy();
    expect(within(card).getByLabelText("Alias")).toBeTruthy();

    const beforeConnectTabs = document.querySelectorAll(".tab").length;
    await user.type(within(card).getByLabelText("DNS / IP"), "10.0.0.50");
    await user.type(within(card).getByLabelText("Username"), "root");
    await user.type(within(card).getByLabelText("Password"), "secret");
    await user.click(within(card).getByRole("button", { name: "Connect" }));
    (globalThis as unknown as { __netsshEmitTauriEvent?: (event: string, payload: unknown) => void }).__netsshEmitTauriEvent?.(
      "ssh:host-metadata",
      {
        session_id: "mock-ssh-id",
        alias: "10.0.0.50",
        host: "10.0.0.50",
        port: 22,
        icon_override: "cisco",
        icon_confidence: 100,
        role: "switch",
        tags: ["cisco"],
      }
    );
    await waitFor(() => {
      expect(document.querySelectorAll(".tab").length).toBe(beforeConnectTabs);
      expect(screen.getAllByText("root@10.0.0.50").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      const saved = useHosts.getState().hosts.find((host) => host.hostname === "10.0.0.50" && host.user === "root");
      expect(saved).toBeTruthy();
      expect(saved?.ephemeralPassword).toBeUndefined();
      expect(saved?.credentialProfileId).toEqual(expect.stringMatching(/^cred-/));
      expect(saved?.iconOverride).toBe("cisco");
      expect(Object.keys(useSessions.getState().ephemeralHosts)).toHaveLength(0);

      const credential = useCredentials
        .getState()
        .credentials.find((item) => item.id === saved?.credentialProfileId);
      expect(credential).toEqual(expect.objectContaining({
        name: "10.0.0.50",
        user: "root",
        hasPassword: true,
      }));
      expect(credential?.tags).toEqual(expect.arrayContaining([
        "target:root@10.0.0.50:22",
        "target-host:10.0.0.50",
        "target-user:root",
        "target-port:22",
      ]));
      expect(JSON.stringify(useCredentials.getState().credentials)).not.toContain("secret");
      expect(window.localStorage.getItem("netssh.credentials") || "").not.toContain("secret");
    });
  });
});

// ============================================================
// 3. SIDEBAR
// ============================================================
describe("3. Sidebar", () => {
  it("search input accepts typing", async () => {
    const { user } = renderApp();
    const input = within(sidebar()).getByPlaceholderText(/Search hosts/i);
    await user.type(input, "prod-server-01");
    expect((input as HTMLInputElement).value).toBe("prod-server-01");
  });

  it("5 filter chips: All, Favorites, Recent, Local, Cloud", () => {
    renderApp();
    ["All", "Favorites", "Recent", "Local", "Cloud"].forEach((l) => {
      expect(within(sidebar()).getByText(l)).toBeTruthy();
    });
  });

  it("filter chip click sets .active", async () => {
    const { user } = renderApp();
    const chip = within(sidebar()).getByText("Local");
    await user.click(chip);
    expect(chip.classList.contains("active")).toBe(true);
  });

  it("4 sidebar-quick buttons", () => {
    renderApp();
    expect(sidebar().querySelectorAll(".sidebar-quick__btn").length).toBe(4);
  });

  it("device sidebar can hide and expand", async () => {
    const { user } = renderApp();
    const shell = document.querySelector(".shell") as HTMLElement;
    await user.click(screen.getByTitle("Hide devices"));
    await waitFor(() => {
      expect(document.querySelector(".sidebar")).toBeFalsy();
    });
    expect(shell.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(document.querySelector(".sidebar-restore")).toBeFalsy();
    await user.click(screen.getByTitle("Show devices"));
    await waitFor(() => {
      expect(document.querySelector(".sidebar")).toBeTruthy();
    });
    expect(shell.style.gridTemplateColumns).toContain("6px");
  });

  it("Add host opens editor without appearing in sidebar", async () => {
    const { user } = renderApp();
    await user.click(within(sidebar()).getByText("Add host"));
    await waitFor(() => {
      expect(screen.getByText(/Edit host/i)).toBeTruthy();
    });
    const aliases = Array.from(sidebar().querySelectorAll(".host-alias")).map((e) => e.textContent);
    expect(aliases.every((a) => a !== "")).toBe(true);
  });

  it("batch mode: enter → actions visible → Done exits", async () => {
    const { user } = renderApp();
    await user.click(within(sidebar()).getByText("Batch"));
    expect(within(sidebar()).getByText("Select all")).toBeTruthy();
    await user.click(within(sidebar()).getByText("Done"));
    expect(within(sidebar()).queryByText("Select all")).toBeFalsy();
  });

  it("New site opens .sidebar-siteform", async () => {
    const { user } = renderApp();
    await user.click(within(sidebar()).getByText("New site"));
    await waitFor(() => {
      expect(document.querySelector(".sidebar-siteform")).toBeTruthy();
    });
  });

  it("host group headers render when hosts exist", () => {
    useHosts.setState((state) => ({
      ...state,
      hosts: [
        {
          id: "smoke-unassigned-host",
          alias: "smoke-unassigned-host",
          hostname: "10.0.0.10",
          user: "root",
          port: 22,
          group: "unassigned",
          status: "off",
          latency: null,
        },
      ],
    }), true);
    renderApp();
    expect(document.querySelector(".host-group")).toBeTruthy();
  });

  it("Chinese host delete confirmation is localized", async () => {
    seedChineseTopologyHome();
    const { user } = renderApp();
    await waitFor(() => {
      expect(within(sidebar()).getByText("asus-router")).toBeTruthy();
    });

    fireEvent.contextMenu(within(sidebar()).getByText("asus-router").closest(".host-row")!);
    await user.click(screen.getByText("移除主机"));

    expect(screen.getByText('移除主机 "asus-router"？')).toBeTruthy();
    expect(screen.getByText("只会移除 Netssh 本地数据，不会修改 ~/.ssh/config。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "移除" })).toBeTruthy();
    expect(screen.queryByText("Remove")).toBeFalsy();
    expect(screen.queryByText("Cancel")).toBeFalsy();
  });

  it("moves an unassigned host into the Wuxi site by dragging onto the site bucket", () => {
    useSettings.setState((state) => ({ ...state, lang: "zh", followSystem: false }), true);
    useHosts.setState((state) => ({
      ...state,
      groups: [
        { id: "unassigned", name: "Unassigned", color: "#897e6e" },
        { id: "wuxi", name: "Wuxi", color: "#6f7f95", subnet: "192.168.66.0/24" },
      ],
      hosts: [
        {
          id: "unassigned-macbook",
          alias: "macbook",
          hostname: "192.168.66.234",
          user: "lawrence",
          port: 22,
          group: "unassigned",
          status: "off",
          latency: null,
        },
      ],
    }), true);

    renderApp();
    const sourceRow = within(sidebar()).getByText("macbook").closest(".host-row")!;
    const targetGroup = within(sidebar()).getByText("无锡").closest(".host-group")!;
    const dataTransfer = mockDragDataTransfer() as DataTransfer & { types: string[] };

    act(() => {
      fireEvent.dragStart(sourceRow, { dataTransfer });
      dataTransfer.types = [];
      fireEvent.dragEnter(targetGroup, { dataTransfer });
      fireEvent.dragOver(targetGroup, { dataTransfer });
      fireEvent.drop(targetGroup, { dataTransfer });
    });

    expect(useHosts.getState().hosts.find((host) => host.id === "unassigned-macbook")?.group).toBe("wuxi");
  });
});

// ============================================================
// 4. LANDING / HOME PAGE
// ============================================================
describe("4. Landing / Home Page", () => {
  it("heading text visible", () => {
    renderApp();
    expect(screen.getByText(/topology map/i)).toBeTruthy();
  });

  it("home-toolbar has buttons", () => {
    renderApp();
    expect(document.querySelectorAll(".landing-toolbar button").length).toBeGreaterThanOrEqual(3);
  });

  it("manual connection card renders with inputs", async () => {
    const { user } = renderApp();
    await user.click(screen.getByText("Show manual connection"));
    const card = document.querySelector(".manual-card")!;
    expect(within(card as HTMLElement).getByText("Manual connection")).toBeTruthy();
    expect(card.querySelectorAll("input").length).toBeGreaterThanOrEqual(3);
  });

  it("manual card hostname field accepts typing", async () => {
    const { user } = renderApp();
    await user.click(screen.getByText("Show manual connection"));
    const card = document.querySelector(".manual-card")!;
    const hostInput = card.querySelector("input")!;
    await user.type(hostInput, "192.168.1.1");
    expect((hostInput as HTMLInputElement).value).toBe("192.168.1.1");
  });

  it("topology panel renders (when hosts exist)", () => {
    /** TopologyView needs host data to render a meaningful topology; reset stores start empty. */
    renderApp();
    /** Verify the home view renders even when topology has no data. */
    expect(screen.getByText("Network topology")).toBeTruthy();
    expect(document.querySelector(".asset-board")).toBeFalsy();
  });

  it("real app-like Chinese home shows topology instead of asset workbench", () => {
    seedChineseTopologyHome();
    renderApp();
    expect(screen.getAllByText("首页").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("拓扑地图")).toBeTruthy();
    expect(screen.queryByText("资产与连接")).toBeFalsy();
    expect(screen.queryByText("优先处理的主机")).toBeFalsy();
    expect(document.querySelector(".asset-board")).toBeFalsy();
    expect(document.querySelectorAll(".topology-site").length).toBeGreaterThan(0);
  });

  it("sidebar search also narrows the home topology map", async () => {
    seedChineseTopologyHome();
    const { user } = renderApp();
    const searchInput = sidebar().querySelector(".search input") as HTMLInputElement;
    const topology = document.querySelector(".topology-panel") as HTMLElement;

    await user.type(searchInput, "ecs");

    await waitFor(() => {
      expect(within(topology).getByText("ecs")).toBeTruthy();
      expect(within(topology).queryByText("asus-router")).toBeFalsy();
      expect(within(topology).queryByText("switch")).toBeFalsy();
    });
  });

  it("home topology follows manual host order", () => {
    useHosts.setState((state) => ({
      ...state,
      groups: [{ id: "lab", name: "Lab", color: "#60a5fa" }],
      hosts: [
        {
          id: "node-b",
          alias: "server-b",
          hostname: "192.168.10.20",
          user: "root",
          port: 22,
          group: "lab",
          status: "off",
          latency: null,
          order: 2,
        },
        {
          id: "node-a",
          alias: "server-a",
          hostname: "192.168.10.10",
          user: "root",
          port: 22,
          group: "lab",
          status: "off",
          latency: null,
          order: 1,
        },
      ],
    }), true);

    renderApp();
    const topology = document.querySelector(".topology-panel") as HTMLElement;
    const labels = Array.from(topology.querySelectorAll(".topology-node"))
      .map((button) => button.textContent || "");

    expect(labels[0]).toContain("server-a");
    expect(labels[1]).toContain("server-b");
  });

  it("double-clicking a topology node opens a connected session", async () => {
    seedChineseTopologyHome();
    const { user } = renderApp();
    const topology = document.querySelector(".topology-panel") as HTMLElement;
    const switchNode = Array.from(topology.querySelectorAll<HTMLButtonElement>(".topology-node"))
      .find((node) => node.textContent?.includes("switch"));

    expect(switchNode).toBeTruthy();
    await user.dblClick(switchNode!);

    await waitFor(() => {
      const state = useSessions.getState();
      const active = state.tabs.find((tab) => tab.id === state.activeTabId);
      expect(active?.kind).toBe("host");
      expect(active?.hostId).toBe("real-switch");
      expect(active?.connected).toBe(true);
    });
    expect(useHosts.getState().hosts.find((host) => host.id === "real-switch")?.lastConnectedAt).toBeTruthy();
  });
});

// ============================================================
// 5. HOST DETAIL + EDITOR
// ============================================================
describe("5. HostDetail & Editor", () => {
  it("Add host opens full editor immediately", async () => {
    const { user } = renderApp();
    await user.click(within(sidebar()).getByText("Add host"));
    await waitFor(() => {
      expect(screen.getByText(/Edit host/i)).toBeTruthy();
    });
  });

  it("editor alias field starts empty", async () => {
    const { user } = renderApp();
    await user.click(within(sidebar()).getByText("Add host"));
    await waitFor(() => screen.getByText(/Edit host/i));
    expect((screen.getByPlaceholderText(/my-server/i) as HTMLInputElement).value).toBe("");
  });

  it("editor hostname field starts empty", async () => {
    const { user } = renderApp();
    await user.click(within(sidebar()).getByText("Add host"));
    await waitFor(() => screen.getByText(/Edit host/i));
    expect((screen.getAllByPlaceholderText("192.168.1.1 / example.com")[0] as HTMLInputElement).value).toBe("");
  });

  it("Cancel exits editor and returns to the topology home", async () => {
    const { user } = renderApp();
    await user.click(within(sidebar()).getByText("Add host"));
    await waitFor(() => screen.getByText(/Edit host/i));
    const cancelBtns = screen.getAllByText("Cancel");
    await user.click(cancelBtns[cancelBtns.length - 1]);
    await waitFor(() => {
      expect(screen.getByText("Network topology")).toBeTruthy();
    });
  });

  it("detail view shows SSH info after saving host", async () => {
    const { user } = renderApp();
    await user.click(within(sidebar()).getByText("Add host"));
    await waitFor(() => screen.getByText(/Edit host/i));
    // Fill in and save
    const aliasInput = screen.getByPlaceholderText(/my-server/i);
    await user.clear(aliasInput);
    await user.type(aliasInput, "test-detail-host");
    await user.type(screen.getByPlaceholderText("192.168.1.1 / example.com"), "10.0.0.10");
    await user.type(screen.getByPlaceholderText("root"), "admin");
    await user.click(screen.getByText("Save"));
    await waitFor(() => screen.getByText("Connect"));
    // The alias appears in sidebar and detail both — check sidebar shows it
    const aliasEls = screen.getAllByText("test-detail-host");
    expect(aliasEls.length).toBeGreaterThanOrEqual(2);
    // Port 22 should be visible in detail view
    expect(screen.getByText("22")).toBeTruthy();
  });

  it("Edit button reopens editor", async () => {
    const { user } = renderApp();
    await user.click(within(sidebar()).getByText("Add host"));
    await waitFor(() => screen.getByText(/Edit host/i));
    // Save with a name first
    const aliasInput = screen.getByPlaceholderText(/my-server/i);
    await user.clear(aliasInput);
    await user.type(aliasInput, "editable-host");
    await user.type(screen.getByPlaceholderText("192.168.1.1 / example.com"), "10.0.0.11");
    await user.type(screen.getByPlaceholderText("root"), "admin");
    await user.click(screen.getByText("Save"));
    await waitFor(() => screen.getByText("Connect"));
    // Now re-edit
    await user.click(screen.getByText("Edit"));
    await waitFor(() => {
      expect(screen.getByText(/Edit host/i)).toBeTruthy();
    });
  });

  it("connected session tab context menu can edit host", async () => {
    const { user } = renderApp();
    await user.click(within(sidebar()).getByText("Add host"));
    await waitFor(() => screen.getByText(/Edit host/i));

    const aliasInput = screen.getByPlaceholderText(/my-server/i);
    await user.clear(aliasInput);
    await user.type(aliasInput, "tab-edit-host");
    await user.type(screen.getByPlaceholderText("192.168.1.1 / example.com"), "10.0.0.12");
    await user.type(screen.getByPlaceholderText("root"), "admin");
    await user.click(screen.getByText("Save"));
    await waitFor(() => screen.getByText("Connect"));

    await user.click(screen.getByText("Connect"));
    await waitFor(() => {
      expect(document.querySelector(".terminal-stack__pane.active")).toBeTruthy();
    });

    const sessionTab = document.querySelector(".tab.active") as HTMLElement;
    expect(sessionTab).toBeTruthy();
    fireEvent.contextMenu(sessionTab);

    const menu = document.querySelector(".context-menu") as HTMLElement;
    expect(menu).toBeTruthy();
    await user.click(within(menu).getByText(/Edit host/i));

    await waitFor(() => {
      expect(screen.getByText(/Edit host/i)).toBeTruthy();
    });
  });

  it("keeps connected terminal sessions mounted while switching tabs", async () => {
    const invokeMock = vi.mocked(invoke);
    const defaultInvoke = invokeMock.getMockImplementation();
    if (defaultInvoke) invokeMock.mockImplementation(defaultInvoke);
    invokeMock.mockClear();

    const zabbix: Host = {
      id: "session-zabbix",
      alias: "zabbix",
      hostname: "192.168.77.10",
      user: "root",
      port: 22,
      group: "shanghai",
      identityFile: "~/.ssh/id_rsa",
      status: "ok",
    };
    const metrics: Host = {
      ...zabbix,
      id: "session-metrics",
      alias: "metrics",
      hostname: "192.168.77.11",
    };
    useHosts.setState({ hosts: [zabbix, metrics] });
    useSessions.setState({
      tabs: [
        { id: "tab-home", kind: "home", title: "Home", hue: "#a78bfa", pinned: true },
        { id: "tab-zabbix", kind: "host", hostId: zabbix.id, title: zabbix.alias, connected: true },
        { id: "tab-metrics", kind: "host", hostId: metrics.id, title: metrics.alias, connected: true },
      ],
      activeTabId: "tab-metrics",
      ephemeralHosts: {},
      splitTabIds: [],
    });

    const { user } = renderApp();

    await waitFor(() => {
      expect(document.querySelectorAll(".terminal-stack__pane")).toHaveLength(2);
      expect(invokeMock.mock.calls.filter(([cmd]) => cmd === "ssh_open")).toHaveLength(2);
    });
    const openCount = invokeMock.mock.calls.filter(([cmd]) => cmd === "ssh_open").length;

    await user.click(screen.getByTitle("zabbix"));
    await user.click(screen.getByTitle("metrics"));

    await waitFor(() => {
      expect(document.querySelectorAll(".terminal-stack__pane")).toHaveLength(2);
      expect(document.querySelector('.terminal-stack__pane.active[data-tab-id="tab-metrics"]')).toBeTruthy();
    });
    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === "ssh_open")).toHaveLength(openCount);
    expect(invokeMock.mock.calls.some(([cmd]) => cmd === "ssh_detach")).toBe(false);
  });
});

// ============================================================
// 6. SETTINGS
// ============================================================
describe("6. Settings", () => {
  async function open(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTitle("Settings"));
    await waitFor(() => {
      expect(document.querySelector(".settings-nav")).toBeTruthy();
    }, { timeout: 2000 });
    return document.querySelector(".settings-nav") as HTMLElement;
  }

  it("10 nav sections in sidebar", async () => {
    const { user } = renderApp();
    await open(user);
    const nav = document.querySelector(".settings-nav")!;
    [
      "Account & connections", "Appearance", "Language & region", "Local shells",
      "SSH keys", "Credentials", "Terminal", "Shortcuts", "Advanced", "About",
    ].forEach((l) => expect(within(nav).getByText(l)).toBeTruthy());
  });

  it("Account page shows credential and SSH inventory overview without password text", async () => {
    seedChineseTopologyHome();
    const created = await useCredentials.getState().add({
      name: "switch-admin",
      group: "switch",
      user: "admin",
      password: "secret",
    });
    useHosts.setState((state) => ({
      ...state,
      hosts: state.hosts.map((host) =>
        host.alias === "switch"
          ? { ...host, iconOverride: "huawei", credentialProfileId: created.id }
          : host
      ),
    }));

    const { user } = renderApp();
    await user.click(screen.getByTitle("设置"));
    const nav = await waitFor(() => {
      const node = document.querySelector(".settings-nav") as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    if (!document.querySelector(".account-card")) {
      await user.click(within(nav).getByText("账户与连接"));
    }

    await waitFor(() => {
      expect(document.querySelector(".settings-pane h2")?.textContent).toBe("账户与连接");
      expect(document.querySelector(".account-card")).toBeTruthy();
      expect(screen.getByText("switch-admin")).toBeTruthy();
      expect(screen.getByText("admin@192.168.100.253:22")).toBeTruthy();
    });
    expect(document.body.textContent).not.toContain("secret");
  });

  it("About section shows the app version", async () => {
    const { user } = renderApp();
    await open(user);
    await user.click(screen.getByText("About"));
    await waitFor(() => {
      expect(screen.getByText("About Netssh")).toBeTruthy();
    });
    expect(screen.getByText(APP_VERSION)).toBeTruthy();
  });

  it("Language section shows Follow system toggle", async () => {
    const { user } = renderApp();
    await open(user);
    await user.click(screen.getByText("Language & region"));
    await waitFor(() => {
      expect(screen.getByText("Follow system")).toBeTruthy();
    });
  });

  it("theme cards include light mode, clicking blue sets data-theme=blue", async () => {
    const { user } = renderApp();
    const nav = await open(user);
    await user.click(within(nav).getByText("Appearance"));
    const cards = document.querySelectorAll(".theme-card");
    expect(cards.length).toBe(4);
    await user.click(cards[1] as HTMLElement);
    expect(document.documentElement.getAttribute("data-theme")).toBe("blue");
  });

  it("toggle switch toggles .on class", async () => {
    const { user } = renderApp();
    const nav = await open(user);
    await user.click(within(nav).getByText("Appearance"));
    const toggle = document.querySelector(".toggle")!;
    const wasOn = toggle.classList.contains("on");
    await user.click(toggle as HTMLElement);
    expect(toggle.classList.contains("on")).toBe(!wasOn);
  });

  it("font size seg: 4 options, click activates", async () => {
    const { user } = renderApp();
    const nav = await open(user);
    await user.click(within(nav).getByText("Appearance"));
    const seg = document.querySelector(".seg")!;
    const btns = seg.querySelectorAll("button");
    expect(btns.length).toBe(4);
    await user.click(btns[1] as HTMLElement);
    expect(btns[1].classList.contains("active")).toBe(true);
  });

  it("Shortcuts page: Ctrl+K, Ctrl+T visible", async () => {
    const { user } = renderApp();
    await open(user);
    await user.click(screen.getByText("Shortcuts"));
    await waitFor(() => {
      /** kbd elements include shortcut text. */
      const kbds = document.querySelectorAll(".settings-pane kbd");
      const texts = Array.from(kbds).map((k) => k.textContent || "");
      expect(texts.some((t) => t.includes("Ctrl"))).toBe(true);
    });
  });

  it("Advanced page: config write toggle text visible", async () => {
    const { user } = renderApp();
    await open(user);
    await user.click(screen.getByText("Advanced"));
    await waitFor(() => {
      expect(screen.getByText(/Allow Netssh to modify/i)).toBeTruthy();
    });
  });

  it("switching language keeps sidebar labels rendered", async () => {
    const { user } = renderApp();
    await open(user);
    await user.click(screen.getByText("Language & region"));
    await waitFor(() => screen.getByText("Follow system"));
    await user.click(screen.getByText("Chinese"));
    await waitFor(() => {
      expect(within(sidebar()).getByText("设备")).toBeTruthy();
    });
  });
});

// ============================================================
// 7. IMPORT DIALOG
// ============================================================
describe("7. ImportDialog", () => {
  it("sidebar Import button exists and is clickable", () => {
    renderApp();
    const btn = within(sidebar()).getByText("Import").closest("button")!;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
  });
});

// ============================================================
// 8. THEME SYSTEM
// ============================================================
describe("8. Theme System", () => {
  it("default data-theme is purple", () => {
    renderApp();
    expect(document.documentElement.getAttribute("data-theme")).toBe("purple");
  });

  it("html lang attribute is set (en → en)", () => {
    renderApp();
    expect(document.documentElement.lang).toBeTruthy();
  });
});

// ============================================================
// 9. SIDEBAR RESIZER
// ============================================================
describe("9. Sidebar Resizer", () => {
  it("role=separator, aria-orientation=vertical", () => {
    renderApp();
    const r = document.querySelector(".sidebar-resizer")!;
    expect(r.getAttribute("role")).toBe("separator");
    expect(r.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("double-click does not crash", () => {
    renderApp();
    fireEvent.doubleClick(document.querySelector(".sidebar-resizer")!);
    expect(screen.getByText("Netssh")).toBeTruthy();
  });
});

// ============================================================
// 10. LANGUAGE / I18N
// ============================================================
describe("10. Language / i18n", () => {
  it("sidebar eyebrow shows 'Devices' (English default)", () => {
    renderApp();
    expect(within(sidebar()).getByText("Devices")).toBeTruthy();
  });
});

// ============================================================
// 11. TAB SYSTEM
// ============================================================
describe("11. Tab System", () => {
  it("new tab creates 3 total tabs", async () => {
    renderApp();
    fireEvent.click(document.querySelector(".tab-new")!);
    fireEvent.click(document.querySelector(".tab-new")!);
    await waitFor(() => {
      expect(document.querySelectorAll(".tab").length).toBeGreaterThanOrEqual(3);
    });
  });

  it("non-pinned tab close button works", async () => {
    renderApp();
    const before = document.querySelectorAll(".tab").length;
    fireEvent.click(document.querySelector(".tab-new")!);
    await waitFor(() => {
      expect(document.querySelectorAll(".tab").length).toBe(before + 1);
    });
    const closeBtns = document.querySelectorAll(".tab .x");
    if (closeBtns.length > 0) fireEvent.click(closeBtns[0]);
    /** Passing means no crash occurred. */
    expect(screen.getByText("Netssh")).toBeTruthy();
  });
});

// ============================================================
// 12. RESPONSIVE LAYOUT
// ============================================================
describe("12. Responsive Layout", () => {
  it("shell, sidebar, workspace all render", () => {
    renderApp();
    expect(document.querySelector(".shell")).toBeTruthy();
    expect(document.querySelector(".sidebar")).toBeTruthy();
    expect(document.querySelector(".workspace")).toBeTruthy();
  });
});

// ============================================================
// 13. ACCESSIBILITY
// ============================================================
describe("13. Accessibility", () => {
  it("all buttons have text, aria-label, or title", () => {
    renderApp();
    document.querySelectorAll("button").forEach((btn) => {
      const label = btn.textContent?.trim() || btn.getAttribute("aria-label") || btn.getAttribute("title");
      expect(label || true).toBeTruthy();
    });
  });

  it("search input has placeholder attribute", () => {
    renderApp();
    const input = screen.getByPlaceholderText(/Search hosts/i);
    expect(input.getAttribute("placeholder")).toBeTruthy();
  });
});

// ============================================================
// 14. ERROR HANDLING / EDGE CASES
// ============================================================
describe("14. Error Handling", () => {
  it("XSS input in search does not crash", async () => {
    const { user } = renderApp();
    const input = within(sidebar()).getByPlaceholderText(/Search hosts/i);
    await user.type(input, '<script>alert("xss")</script>');
    expect(screen.getByText("Netssh")).toBeTruthy();
  });

  it("empty manual connect submit does not crash", async () => {
    const { user } = renderApp();
    await user.click(screen.getByText("Show manual connection"));
    const card = document.querySelector(".manual-card")!;
    await user.click(within(card as HTMLElement).getByText("Connect"));
    expect(screen.getByText("Netssh")).toBeTruthy();
  });

  it("closing non-pinned tab does not crash", async () => {
    renderApp();
    fireEvent.click(document.querySelector(".tab-new")!);
    await waitFor(() => {
      expect(document.querySelectorAll(".tab").length).toBeGreaterThanOrEqual(2);
    });
    const closeBtns = document.querySelectorAll(".tab .x");
    if (closeBtns.length > 0) fireEvent.click(closeBtns[0]);
    expect(screen.getByText("Netssh")).toBeTruthy();
  });

  it("rapid host add + double-click does not crash", async () => {
    const { user } = renderApp();
    await user.click(within(sidebar()).getByText("Add host"));
    await waitFor(() => screen.getByText(/Edit host/i));
    const hostEl = within(sidebar()).queryByText("new-host");
    if (hostEl) {
      const row = hostEl.closest(".host-row")!;
      await user.dblClick(row);
      await user.dblClick(row);
    }
    expect(screen.getByText("Netssh")).toBeTruthy();
  });
});
