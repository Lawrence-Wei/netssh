import type { MouseEvent, ReactNode } from "react";
import { t } from "../utils/i18n";
import type { Host, Lang, Tab } from "../config/types";
import { brandIcon } from "../components/BrandIcons";
import { Icon } from "../components/Icons";

interface TitleBarProps {
  lang: Lang;
  tabs: Tab[];
  hosts: Host[];
  ephemeralHosts: Record<string, Host>;
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onNewLocalShell: () => void;
  onConnectActive: () => void;
  onDisconnectActive: () => void;
  onGoHome: () => void;
  onOpenSettings: () => void;
}

export function TitleBar({
  lang,
  tabs,
  hosts,
  ephemeralHosts,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onNewLocalShell,
  onConnectActive,
  onDisconnectActive,
  onGoHome,
  onOpenSettings,
}: TitleBarProps) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const canConnect = activeTab?.kind === "host" && !!activeTab.hostId && !activeTab.connected;
  const canDisconnect = activeTab?.kind === "host" && !!activeTab.connected;

  return (
    <div className="titlebar" data-tauri-drag-region onDoubleClick={(event) => titlebarDoubleClicked(event)}>
      <button
        className="titlebar-brand"
        onClick={onGoHome}
        title={lang === "zh" ? "回到首页" : "Go home"}
        type="button"
      >
        <span className="mark">
          <svg viewBox="0 0 13 13" fill="none">
            <path d="M2 3L5.5 6.5L2 10M6.5 10H11" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="name">{t("app.name", lang)}</span>
      </button>

      <nav className="app-menu" aria-label={lang === "zh" ? "会话菜单" : "Session menu"}>
        <MenuButton label={lang === "zh" ? "会话" : "Session"}>
          <MenuItem onClick={onNewTab} icon={Icon.plus} label={lang === "zh" ? "新建会话" : "New session"} />
          <MenuItem onClick={onNewLocalShell} icon={Icon.shell} label={lang === "zh" ? "本地终端" : "Local shell"} />
          <MenuSeparator />
          <MenuItem
            onClick={onConnectActive}
            icon={Icon.power}
            label={lang === "zh" ? "连接当前主机" : "Connect active host"}
            disabled={!canConnect}
          />
          <MenuItem
            onClick={onDisconnectActive}
            icon={Icon.close}
            label={lang === "zh" ? "断开当前会话" : "Disconnect active session"}
            disabled={!canDisconnect}
          />
        </MenuButton>
      </nav>

      <div className="tabstrip">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={"tab " + (tab.id === activeTabId ? "active" : "")}
            onClick={() => onSelectTab(tab.id)}
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
        ))}
        <button className="tab-new" onClick={onNewTab} title={t("titlebar.newtab", lang)} aria-label={t("titlebar.newtab", lang)}>
          {Icon.plus}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 8 }}>
        <button className="icon-btn" onClick={onOpenSettings} title={lang === "zh" ? "偏好设置" : "Preferences"}>
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

function displayTabTitle(tab: Tab, lang: Lang) {
  if (tab.kind === "home" || tab.title === "Home") return lang === "zh" ? "首页" : "Home";
  if (tab.title === "New session") return lang === "zh" ? "新会话" : "New session";
  if (tab.kind === "settings" || tab.title === "Preferences") return lang === "zh" ? "偏好设置" : "Preferences";
  if (tab.kind === "snippets" || tab.title === "Snippets") return lang === "zh" ? "命令片段" : "Snippets";
  if (tab.kind === "local" && tab.title === "PowerShell") return lang === "zh" ? "PowerShell 本地终端" : "PowerShell";
  return tab.title;
}

function MenuButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="menu-root">
      <button className="menu-trigger" type="button">{label}</button>
      <div className="menu-popover" role="menu">{children}</div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className="menu-item" type="button" role="menuitem" disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MenuSeparator() {
  return <div className="menu-separator" role="separator" />;
}

function titlebarDoubleClicked(event: MouseEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("button") || target?.closest(".tabstrip")) return;
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
    if (action === "toggleMaximize") {
      if (await current.isMaximized()) {
        await current.unmaximize();
      } else {
        await current.maximize();
      }
    }
    if (action === "close") await current.close();
  } catch {
    // Vite/browser preview has no native window controls.
  }
}
