import { type DragEvent, type MouseEvent } from "react";
import { t } from "../utils/i18n";
import type { Host, Lang, Tab } from "../config/types";
import { brandIcon } from "../components/BrandIcons";
import { Icon } from "../components/Icons";
import { useSessions } from "../store/sessions";

const HOST_DRAG_TYPES = ["application/x-netssh-host", "text/netssh-host", "text/plain"] as const;

interface TitleBarProps {
  lang: Lang;
  tabs: Tab[];
  hosts: Host[];
  ephemeralHosts: Record<string, Host>;
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onTabContextMenu?: (event: MouseEvent<HTMLDivElement>, tab: Tab) => void;
  onNewTab: () => void;
  onGoHome: () => void;
  onOpenSettings: () => void;
  onOpenCredentials: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function TitleBar({
  lang,
  tabs,
  hosts,
  ephemeralHosts,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onTabContextMenu,
  onNewTab,
  onGoHome,
  onOpenSettings,
  onOpenCredentials,
  sidebarCollapsed,
  onToggleSidebar,
}: TitleBarProps) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const splitTabIds = useSessions((state) => state.splitTabIds);
  const toggleSplit = useSessions((state) => state.toggleSplit);
  const canToggleSplit = activeTab?.kind === "host" && !!activeTab.hostId && !!activeTab.connected;
  const splitActive = !!activeTab && splitTabIds.includes(activeTab.id);
  const settingsLabel = t("titlebar.settings", lang);
  const credentialsLabel = t("titlebar.credentials", lang);
  const splitLabel = t("workspace.split.toggle", lang);
  const homeTabs = tabs.filter(isHomeTab);
  const sessionTabs = tabs.filter((tab) => !isHomeTab(tab));
  const renderTab = (tab: Tab) => (
    <div
      key={tab.id}
      className={"tab " + (tab.id === activeTabId ? "active" : "")}
      draggable={tab.kind === "host" && Boolean(tab.hostId)}
      onDragStart={(event) => startTabDrag(event, tab)}
      onClick={() => onSelectTab(tab.id)}
      onContextMenu={(event) => onTabContextMenu?.(event, tab)}
      title={displayTabTitle(tab, lang)}
    >
      <span className="tab-icon" style={{ color: tab.hue || "var(--accent)" }}>
        {tabIcon(tab, hosts, ephemeralHosts)}
      </span>
      <span className="label">{displayTabTitle(tab, lang)}</span>
      {!tab.pinned && (
        <button className="x" onClick={(event) => closeClicked(event, tab.id, onCloseTab)} aria-label={`Close ${displayTabTitle(tab, lang)}`}>
          {Icon.x}
        </button>
      )}
    </div>
  );
  return (
    <div className="titlebar" data-tauri-drag-region onDoubleClick={(event) => titlebarDoubleClicked(event)}>
      <div className="titlebar-left">
        <button
          className="titlebar-brand"
          onClick={onGoHome}
          title={t("titlebar.goHome", lang)}
          type="button"
        >
          <span className="mark">
            <svg viewBox="0 0 13 13" fill="none">
              <path d="M2 3L5.5 6.5L2 10M6.5 10H11" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="name">{t("app.name", lang)}</span>
        </button>
        <button
          className="icon-btn titlebar-sidebar-toggle"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? t("sidebar.action.show", lang) : t("sidebar.action.hide", lang)}
          aria-label={sidebarCollapsed ? t("sidebar.action.show", lang) : t("sidebar.action.hide", lang)}
          type="button"
        >
          {sidebarCollapsed ? Icon.sidebarShow : Icon.sidebarHide}
        </button>
      </div>

      <div className="tabstrip" data-tauri-drag-region>
        {homeTabs.map(renderTab)}
        <button className="tab-new" onClick={onNewTab} title={t("titlebar.newtab", lang)} aria-label={t("titlebar.newtab", lang)}>
          {Icon.plus}
        </button>
        <div className="tabstrip-scroll" data-tauri-drag-region>
          {sessionTabs.map(renderTab)}
        </div>
      </div>

      <div className="titlebar-actions">
        {canToggleSplit && (
          <button
            className={"icon-btn titlebar-split-btn" + (splitActive ? " active" : "")}
            onClick={() => toggleSplit(activeTab.id)}
            title={splitLabel}
            aria-label={splitLabel}
            type="button"
          >
            {Icon.split}
          </button>
        )}
        <button
          className="icon-btn titlebar-account-btn"
          onClick={onOpenCredentials}
          title={credentialsLabel}
          aria-label={credentialsLabel}
          type="button"
        >
          {Icon.user}
        </button>
        <button
          className="icon-btn titlebar-settings-btn"
          onClick={onOpenSettings}
          title={settingsLabel}
          aria-label={settingsLabel}
          type="button"
        >
          {Icon.settings}
        </button>
      </div>

      <div className="win-controls">
        <button title={t("titlebar.minimize", lang)} onClick={() => windowAction("minimize")}>{Icon.min}</button>
        <button title={t("titlebar.maximize", lang)} onClick={() => windowAction("toggleMaximize")}>{Icon.max}</button>
        <button className="close" title={t("titlebar.close", lang)} onClick={() => windowAction("close")}>{Icon.close}</button>
      </div>
    </div>
  );
}

function tabIcon(tab: Tab, hosts: Host[], ephemeralHosts: Record<string, Host>) {
  const host = tab.kind === "host" && tab.hostId
    ? hosts.find((item) => item.id === tab.hostId) || ephemeralHosts[tab.hostId]
    : null;
  if (host) return brandIcon(host);
  return <span className="dot" style={{ background: tab.hue || "var(--text-mute)" }} />;
}

function startTabDrag(event: DragEvent<HTMLDivElement>, tab: Tab) {
  if (tab.kind !== "host" || !tab.hostId) return;
  HOST_DRAG_TYPES.forEach((type) => {
    try {
      event.dataTransfer.setData(type, tab.hostId || "");
    } catch {
      // Some browser shells reject custom drag MIME types; text/plain remains the fallback.
    }
  });
  event.dataTransfer.effectAllowed = "move";
}

function displayTabTitle(tab: Tab, lang: Lang) {
  if (tab.kind === "home" || tab.title === "Home") return t("titlebar.home", lang);
  if (tab.title === "New session") return lang === "zh" ? "新会话" : "New session";
  if (tab.title === "New host") return t("sidebar.foot.add", lang);
  if (tab.kind === "settings") return t("titlebar.settings", lang);
  if (tab.kind === "snippets" || tab.title === "Snippets") return lang === "zh" ? "命令片段" : "Snippets";
  if (tab.kind === "local" && tab.title === "PowerShell") return lang === "zh" ? "PowerShell" : "PowerShell";
  return tab.title;
}

function isHomeTab(tab: Tab) {
  return tab.kind === "home" || tab.title === "Home";
}

function titlebarDoubleClicked(event: MouseEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (target.closest(".tab")) return;
  if (target.closest(".tab-new")) return;
  if (target.closest(".win-controls")) return;
  if (target.closest(".titlebar-left")) return;
  if (target.closest(".titlebar-actions")) return;
  if (target.closest("button")) return;
  void windowAction("toggleMaximize");
}

function closeClicked(event: MouseEvent<HTMLButtonElement>, id: string, onCloseTab: (id: string) => void) {
  event.stopPropagation();
  onCloseTab(id);
}

async function windowAction(action: "minimize" | "toggleMaximize" | "close") {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const current = getCurrentWindow();
    if (action === "minimize") await current.minimize();
    if (action === "toggleMaximize") await current.toggleMaximize();
    if (action === "close") await current.close();
  } catch {
    // Vite/browser preview has no native window controls.
  }
}
