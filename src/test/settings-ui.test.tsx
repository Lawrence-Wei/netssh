import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { invoke } from "@tauri-apps/api/core";
import App from "../pages/App";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { useCredentials } from "../store/credentials";
import { useHosts } from "../store/hosts";
import { useSessions } from "../store/sessions";
import { useSettings } from "../store/settings";

function renderApp() {
  return {
    user: userEvent.setup(),
    ...render(createElement(ConfirmProvider, null, createElement(App))),
  };
}

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTitle("Settings"));
  await waitFor(() => expect(document.querySelector(".settings-nav")).toBeTruthy());
  return document.querySelector(".settings-nav") as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
  document.body.className = "";
  document.documentElement.removeAttribute("data-theme");
  useHosts.setState({ hosts: [], groups: [{ id: "unassigned", name: "Unassigned", color: "#897e6e" }] });
  useSessions.setState({
    tabs: [{ id: "tab-home", kind: "home", title: "Home", hue: "#a78bfa", pinned: true }],
    activeTabId: "tab-home",
    ephemeralHosts: {},
    splitTabIds: [],
  });
  useCredentials.setState({ credentials: [] });
  useSettings.setState({
    theme: "purple",
    lang: "en",
    followSystem: true,
    translucency: true,
    reduceMotion: false,
    fontSize: 13,
    fontFamily: "JetBrains Mono",
    terminalCursorStyle: "bar",
    terminalCursorBlink: true,
    terminalScrollback: 10000,
    terminalCopyOnSelect: false,
    terminalRightClickPaste: false,
    terminalLocale: "system",
    terminalTimezone: "system",
    defaultShellId: "pwsh",
    defaultShellName: "PowerShell",
    defaultShellPath: undefined,
    customShells: [],
    hardwareAcceleration: true,
    telemetry: false,
    autostart: false,
    showSessionRail: false,
    allowConfigWrite: false,
  });
  vi.mocked(invoke).mockClear();
});

describe("Settings GUI wiring", () => {
  it("applies terminal font preferences to app CSS variables", async () => {
    const { user } = renderApp();
    const nav = await openSettings(user);
    await user.click(within(nav).getByText("Appearance"));

    await user.click(screen.getByText("Consolas"));
    await user.click(screen.getByText("16 pt"));

    const appWindow = document.querySelector(".app-window") as HTMLElement;
    expect(useSettings.getState().fontFamily).toBe("Consolas");
    expect(appWindow.style.getPropertyValue("--terminal-font-family")).toBe("Consolas");
    expect(appWindow.style.getPropertyValue("--terminal-font-size")).toBe("16px");
  });

  it("persists terminal behavior controls", async () => {
    const { user } = renderApp();
    const nav = await openSettings(user);
    await user.click(within(nav).getByText("Terminal"));

    await user.click(screen.getByText("Block"));
    await user.click(screen.getByText("50,000"));
    await user.click(screen.getByLabelText("Copy on select"));
    await user.click(screen.getByLabelText("Right-click pastes"));

    const state = useSettings.getState();
    expect(state.terminalCursorStyle).toBe("block");
    expect(state.terminalScrollback).toBe(50000);
    expect(state.terminalCopyOnSelect).toBe(true);
    expect(state.terminalRightClickPaste).toBe(true);
  });

  it("adds a custom shell and makes it the default local shell", async () => {
    const { user } = renderApp();
    const nav = await openSettings(user);
    await user.click(within(nav).getByText("Local shells"));

    await user.click(screen.getByText("Add custom shell"));
    await user.type(screen.getByLabelText("Name"), "Nu Shell");
    await user.type(screen.getByLabelText("Executable path"), "C:\\Tools\\nu.exe");
    await user.click(screen.getByText("Save"));

    const shellRow = screen.getByText("Nu Shell").closest(".shell-item") as HTMLElement;
    await user.click(within(shellRow).getByText("Make default"));

    expect(useSettings.getState().customShells).toHaveLength(1);
    expect(useSettings.getState().defaultShellName).toBe("Nu Shell");
    expect(useSettings.getState().defaultShellPath).toBe("C:\\Tools\\nu.exe");
  });

  it("toggles runtime body and hardware settings", async () => {
    const { user } = renderApp();
    const nav = await openSettings(user);
    await user.click(within(nav).getByText("Appearance"));

    await user.click(screen.getByLabelText("Translucency"));
    await waitFor(() => expect(document.body.classList.contains("no-translucency")).toBe(true));

    await user.click(within(nav).getByText("Advanced"));
    await user.click(screen.getByLabelText("Hardware acceleration"));
    expect(useSettings.getState().hardwareAcceleration).toBe(false);
  });

  it("enables Windows autostart through the Tauri lifecycle command", async () => {
    const { user } = renderApp();
    const nav = await openSettings(user);

    await user.click(within(nav).getByText("Advanced"));
    await waitFor(() =>
      expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "autostart_status")).toBe(true)
    );
    await user.click(screen.getByLabelText("Auto-start with Windows"));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("autostart_set_enabled", { enabled: true }));
    await waitFor(() => expect(useSettings.getState().autostart).toBe(true));
  });

  it("does not persist credential passwords through metadata edits", async () => {
    const created = await useCredentials.getState().add({
      name: "router-root",
      group: "root",
      user: "root",
      password: "old-secret",
    });

    await useCredentials.getState().update(
      created.id,
      { name: "router-admin", password: "new-secret" } as never
    );

    const serializedStore = JSON.stringify(useCredentials.getState().credentials);
    const serializedLocalStorage = window.localStorage.getItem("netssh.credentials") || "";
    expect(serializedStore).not.toContain("new-secret");
    expect(serializedLocalStorage).not.toContain("new-secret");
  });
});
