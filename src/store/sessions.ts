// Tabs + sessions store.

import { create } from "zustand";
import type { Host, Tab } from "../config/types";

interface SessionsState {
  tabs: Tab[];
  activeTabId: string;
  ephemeralHosts: Record<string, Host>;
  /** Tab ids being rendered side-by-side in the workspace. Empty / single → normal layout. */
  splitTabIds: string[];
  selectHost: (h: Host) => void;
  openHost: (h: Host, connectNow?: boolean) => void;
  openEphemeralHost: (h: Host) => void;
  connectActive: () => void;
  disconnectTab: (id: string) => void;
  openLocalShell: (shellId?: string, title?: string) => void;
  openSettings: () => void;
  openSnippets: () => void;
  closeTab: (id: string) => void;
  newTab: () => void;
  goHome: () => void;
  setActive: (id: string) => void;
  toggleSplit: (id: string) => void;
  openQuad: () => void;
  clearSplit: () => void;
}

export const useSessions = create<SessionsState>((set, get) => ({
  tabs: [{ id: "tab-home", kind: "home", title: "Home", hue: "#a78bfa", pinned: true }],
  activeTabId: "tab-home",
  ephemeralHosts: {},
  splitTabIds: [],

  selectHost: (h) => {
    const { tabs, activeTabId } = get();
    const active = tabs.find((t) => t.id === activeTabId);
    if (active?.kind === "host" && !active.connected) {
      set({
        tabs: tabs.map((t) =>
          t.id === activeTabId
            ? { ...t, hostId: h.id, title: h.alias, hue: h.hue, connected: false }
            : t
        ),
      });
      return;
    }
    get().openHost(h, false);
  },

  openHost: (h, connectNow = true) => {
    const id = `tab-${Date.now()}`;
    set({
      tabs: [...get().tabs, { id, kind: "host", hostId: h.id, title: h.alias, hue: h.hue, connected: connectNow }],
      activeTabId: id,
    });
  },

  openEphemeralHost: (h) => {
    const id = `tab-${Date.now()}`;
    set({
      tabs: [
        ...get().tabs,
        { id, kind: "host", hostId: h.id, title: h.alias, hue: h.hue, connected: true },
      ],
      ephemeralHosts: { ...get().ephemeralHosts, [h.id]: h },
      activeTabId: id,
    });
  },

  connectActive: () => {
    const { activeTabId, tabs } = get();
    set({ tabs: tabs.map((t) => t.id === activeTabId ? { ...t, connected: true } : t) });
  },

  disconnectTab: (id) => {
    set({ tabs: get().tabs.map((t) => t.id === id ? { ...t, connected: false } : t) });
  },

  openLocalShell: (shellId = "pwsh", title = "PowerShell") => {
    const id = `tab-local-${Date.now()}`;
    set({
      tabs: [...get().tabs, { id, kind: "local", shellId, title, hue: "#60a5fa", connected: true }],
      activeTabId: id,
    });
  },

  openSettings: () => {
    const existing = get().tabs.find(t => t.kind === "settings");
    if (existing) { set({ activeTabId: existing.id }); return; }
    set({
      tabs: [...get().tabs, { id: "tab-settings", kind: "settings", title: "Preferences", hue: "#a78bfa" }],
      activeTabId: "tab-settings",
    });
  },

  openSnippets: () => {
    const existing = get().tabs.find(t => t.kind === "snippets");
    if (existing) { set({ activeTabId: existing.id }); return; }
    set({
      tabs: [...get().tabs, { id: "tab-snippets", kind: "snippets", title: "Snippets", hue: "#60a5fa" }],
      activeTabId: "tab-snippets",
    });
  },

  closeTab: (id) => {
    const { activeTabId, tabs: previous, ephemeralHosts, splitTabIds } = get();
    const closing = previous.find((t) => t.id === id);
    // Never close pinned tabs (Home)
    if (closing?.pinned) return;
    const closingIndex = previous.findIndex((t) => t.id === id);
    const tabs = previous.filter(t => t.id !== id);
    const fallbackId = tabs.length ? tabs[Math.max(0, Math.min(closingIndex, tabs.length - 1))].id : "tab-home";
    const nextEphemeral = { ...ephemeralHosts };
    if (closing?.hostId && nextEphemeral[closing.hostId]) {
      delete nextEphemeral[closing.hostId];
    }
    set({
      tabs: tabs.length ? tabs : [{ id: "tab-home", kind: "home", title: "Home", hue: "#a78bfa", pinned: true }],
      activeTabId: id === activeTabId ? fallbackId : activeTabId,
      ephemeralHosts: nextEphemeral,
      splitTabIds: splitTabIds.filter((x) => x !== id),
    });
  },

  newTab: () => {
    const id = `tab-${Date.now()}`;
    set({ tabs: [...get().tabs, { id, kind: "host", title: "New session", connected: false }], activeTabId: id });
  },

  goHome: () => {
    const { tabs } = get();
    const home = tabs.find((tab) => tab.kind === "home");
    if (home) {
      set({
        activeTabId: home.id,
        splitTabIds: [],
      });
      return;
    }
    set({
      tabs: [{ id: "tab-home", kind: "home", title: "Home", hue: "#a78bfa", pinned: true }, ...tabs],
      activeTabId: "tab-home",
      splitTabIds: [],
    });
  },

  setActive: (id) => set({ activeTabId: id }),

  toggleSplit: (id) => {
    const { splitTabIds } = get();
    if (splitTabIds.includes(id)) {
      set({ splitTabIds: splitTabIds.filter((x) => x !== id) });
    } else if (splitTabIds.length < 4) {
      set({ splitTabIds: [...splitTabIds, id] });
    }
  },

  openQuad: () => {
    const ids = get().tabs
      .filter((tab) => tab.kind === "host" && tab.connected && tab.hostId)
      .slice(0, 4)
      .map((tab) => tab.id);
    if (ids.length >= 2) {
      set({ splitTabIds: ids, activeTabId: ids[0] });
    }
  },

  clearSplit: () => set({ splitTabIds: [] }),
}));
