import { useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { TitleBar } from "../layouts/TitleBar";
import { Sidebar } from "../layouts/Sidebar";
import { ContextMenu } from "../layouts/ContextMenu";
import { Workspace } from "../layouts/Workspace";
import { ImportDialog } from "./ImportDialog";
import type { QuickCommand } from "../config/defaults";
import { useHosts } from "../store/hosts";
import { useSessions } from "../store/sessions";
import { useSettings } from "../store/settings";
import { useSnippets } from "../store/snippets";
import { detectSystemLang, t } from "../utils/i18n";
import type { Host, Snippet } from "../config/types";
import type { QueuedCommand } from "./TerminalPane";
import { useConfirm } from "../components/ConfirmDialog";

export default function App() {
  const {
    hosts,
    groups,
    addHost,
    importHosts,
    updateHost,
    removeHost,
    toggleFavorite,
    markConnected,
    addGroup,
    renameGroup,
    removeGroup,
    moveHostToGroup,
    loadFromSshConfig,
  } = useHosts(
    (s) => ({
      hosts: s.hosts,
      groups: s.groups,
      addHost: s.addHost,
      importHosts: s.importHosts,
      updateHost: s.updateHost,
      removeHost: s.removeHost,
      toggleFavorite: s.toggleFavorite,
      markConnected: s.markConnected,
      addGroup: s.addGroup,
      renameGroup: s.renameGroup,
      removeGroup: s.removeGroup,
      moveHostToGroup: s.moveHostToGroup,
      loadFromSshConfig: s.loadFromSshConfig,
    }),
    shallow
  );
  const {
    tabs,
    activeTabId,
    ephemeralHosts,
    selectHost,
    openHost,
    openEphemeralHost,
    connectActive,
    disconnectTab,
    openSettings,
    openLocalShell,
    closeTab,
    newTab,
    goHome,
    setActive,
  } = useSessions(
    (s) => ({
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      ephemeralHosts: s.ephemeralHosts,
      selectHost: s.selectHost,
      openHost: s.openHost,
      openEphemeralHost: s.openEphemeralHost,
      connectActive: s.connectActive,
      disconnectTab: s.disconnectTab,
      openSettings: s.openSettings,
      openSnippets: s.openSnippets,
      openLocalShell: s.openLocalShell,
      closeTab: s.closeTab,
      newTab: s.newTab,
      goHome: s.goHome,
      setActive: s.setActive,
    }),
    shallow
  );
  const { snippets, categories, quickCommands } = useSnippets(
    (s) => ({ snippets: s.snippets, categories: s.categories, quickCommands: s.quickCommands }),
    shallow
  );
  const {
    theme,
    lang,
    setLang,
    followSystem,
    setTheme,
    set: setSetting,
    translucency,
    reduceMotion,
    fontSize,
    fontFamily,
    allowConfigWrite,
  } = useSettings(
    (s) => ({
      theme: s.theme,
      lang: s.lang,
      setLang: s.setLang,
      followSystem: s.followSystem,
      setTheme: s.setTheme,
      set: s.set,
      translucency: s.translucency,
      reduceMotion: s.reduceMotion,
      fontSize: s.fontSize,
      fontFamily: s.fontFamily,
      allowConfigWrite: s.allowConfigWrite,
    }),
    shallow
  );

  const [ctxMenu, setCtxMenu] = useState<null | { x: number; y: number; host: Host }>(null);
  const [runQueue, setRunQueue] = useState<QueuedCommand[]>([]);
  const [editingHostId, setEditingHostId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem("netssh.sidebarWidth"));
    return Number.isFinite(saved) && saved >= 240 && saved <= 460 ? saved : 320;
  });
  const queueTimerRef = useRef(0);
  const confirm = useConfirm();

  useEffect(() => {
    return () => {
      window.clearTimeout(queueTimerRef.current);
    };
  }, []);

  useEffect(() => {
    void loadFromSshConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (followSystem) void detectSystemLang().then(setLang);
  }, [followSystem, setLang]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  useEffect(() => {
    document.body.classList.toggle("no-translucency", !translucency);
    document.body.classList.toggle("reduce-motion", reduceMotion);
  }, [reduceMotion, translucency]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const activeHost =
    activeTab?.kind === "host"
      ? hosts.find((host) => host.id === activeTab.hostId) ||
        (activeTab.hostId ? ephemeralHosts[activeTab.hostId] : null) ||
        null
      : null;
  const activeQuickCommands = activeHost ? quickCommands[activeHost.id] || quickCommands[activeHost.alias] || [] : [];

  const openManagedHost = (host: Host, connectNow = true) => {
    if (connectNow) markConnected(host.id);
    openHost(host, connectNow);
  };

  const connectActiveHost = () => {
    if (activeTab?.kind === "host" && activeHost && !ephemeralHosts[activeHost.id]) {
      markConnected(activeHost.id);
    }
    connectActive();
  };

  const settingsSnapshot = useMemo(
    () => ({
      translucency,
      reduceMotion,
      fontSize,
      fontFamily,
      followSystem,
      allowConfigWrite,
    }),
    [translucency, reduceMotion, fontSize, fontFamily, followSystem, allowConfigWrite]
  );
  const updateSetting = <K extends keyof typeof settingsSnapshot>(
    key: K,
    value: (typeof settingsSnapshot)[K]
  ) => {
    setSetting(key, value as never);
  };
  const shellColumns = useMemo(() => {
    return `${sidebarWidth}px 6px minmax(0, 1fr)`;
  }, [sidebarWidth]);

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    let currentWidth = sidebarWidth;
    const onMove = (moveEvent: PointerEvent) => {
      currentWidth = Math.min(460, Math.max(240, startWidth + moveEvent.clientX - startX));
      setSidebarWidth(currentWidth);
    };
    const onUp = () => {
      window.localStorage.setItem("netssh.sidebarWidth", String(Math.round(currentWidth)));
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onCtxAction = (action: string, host: Host, extra?: string) => {
    if (action === "connect") {
      openManagedHost(host, true);
    }
    if (action === "favorite") {
      toggleFavorite(host.id);
    }
    if (action === "edit") {
      useSessions.getState().clearSplit();
      selectHost(host);
      setEditingHostId(host.id);
    }
    if (action === "move" && extra) {
      moveHostToGroup(host.id, extra);
    }
    if (action === "delete") {
      void confirm({
        title: lang === "zh" ? `Remove host "${host.alias}"?` : `Remove host "${host.alias}"?`,
        message:
          lang === "zh"
            ? "This host is removed from the list. Your ~/.ssh/config stays untouched."
            : "The host is removed from this list. Your ~/.ssh/config stays untouched.",
        confirmLabel: lang === "zh" ? "Remove" : "Remove",
        cancelLabel: lang === "zh" ? "Cancel" : "Cancel",
        danger: true,
      }).then((ok) => {
        if (ok) removeHost(host.id);
      });
    }
  };

  const queueCommand = (item: Snippet | QuickCommand) => {
    const queued = { cmd: item.cmd, name: item.name };
    if (isDangerousCommand(item.cmd)) {
      void confirm({
        title: t("terminal.command.danger.title", lang),
        message: t("terminal.command.danger.message", lang, { command: item.cmd }),
        confirmLabel: t("terminal.command.danger.confirm", lang),
        cancelLabel: t("common.cancel", lang),
        danger: true,
      }).then((ok) => {
        if (ok) {
          queueCommandAfterConfirm(queued);
        }
      });
      return;
    }
    queueCommandAfterConfirm(queued);
  };

  const queueCommandAfterConfirm = (queued: { cmd: string; name?: string }) => {
    if (activeTab?.kind === "local" || (activeTab?.kind === "host" && activeHost && activeTab.connected)) {
      setRunQueue((queue) => [...queue, queued]);
      return;
    }
    if (activeTab?.kind === "host" && activeHost) {
      connectActiveHost();
      queueTimerRef.current = window.setTimeout(() => setRunQueue((queue) => [...queue, queued]), 450);
    }
  };

  return (
    <div
      className="app-window"
      style={{
        "--terminal-font-size": `${fontSize}px`,
        "--terminal-font-family": fontFamily,
      } as CSSProperties}
    >
      <div className="aurora"><div className="aurora-blob" /></div>
      <div className="grain" />

      <TitleBar
        lang={lang}
        tabs={tabs}
        hosts={hosts}
        ephemeralHosts={ephemeralHosts}
        activeTabId={activeTabId}
        onSelectTab={setActive}
        onCloseTab={closeTab}
        onNewTab={newTab}
        onNewLocalShell={() => openLocalShell()}
        onConnectActive={connectActiveHost}
        onDisconnectActive={() => activeTab && disconnectTab(activeTab.id)}
        onGoHome={() => {
          setEditingHostId(null);
          goHome();
        }}
        onOpenSettings={openSettings}
      />

      <div className="shell shell--no-rail" style={{ gridTemplateColumns: shellColumns } as CSSProperties}>
        <Sidebar
          lang={lang}
          hosts={hosts}
          groups={groups}
          activeHostId={activeHost?.id}
          onPickHost={selectHost}
          onDoubleClickHost={(host) => openManagedHost(host, true)}
          onContextMenu={(event, host) => setCtxMenu({ x: event.clientX, y: event.clientY, host })}
          onOpenImport={() => setImportOpen(true)}
          onAddGroup={addGroup}
          onRenameGroup={renameGroup}
          onRemoveGroup={removeGroup}
          onMoveHostToGroup={moveHostToGroup}
          onRemoveHosts={(ids) => ids.forEach((id) => removeHost(id))}
          onToggleFavorite={toggleFavorite}
          onAddHostQuick={() => {
            const created = addHost({
              alias: "new-host",
              hostname: "example.com",
              user: "root",
              port: 22,
              group: "unassigned",
            });
            setEditingHostId(created.id);
            selectHost(created);
          }}
        />

        <div
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          title={lang === "zh" ? "Drag to resize the sidebar. Double-click to reset." : "Drag to resize the sidebar. Double-click to reset."}
          onPointerDown={startSidebarResize}
          onDoubleClick={() => {
            setSidebarWidth(320);
            window.localStorage.setItem("netssh.sidebarWidth", "320");
          }}
        />

        <Workspace
          lang={lang}
          tab={activeTab}
          activeHost={activeHost}
          hosts={hosts}
          ephemeralHosts={ephemeralHosts}
          snippets={snippets}
          categories={categories}
          quickCommands={activeQuickCommands}
          theme={theme}
          setTheme={setTheme}
          settings={settingsSnapshot}
          setSetting={updateSetting}
          setLang={setLang}
          onConnect={connectActiveHost}
          onDisconnect={() => activeTab && disconnectTab(activeTab.id)}
          onRunSnippet={queueCommand}
          runQueue={runQueue}
          groups={groups}
          editingHostId={editingHostId}
          setEditingHostId={setEditingHostId}
          onAddHost={addHost}
          onUpdateHost={updateHost}
          onRemoveHost={(id) => {
            removeHost(id);
            setEditingHostId(null);
          }}
          onManualConnect={openEphemeralHost}
          onAddGroup={addGroup}
          onOpenImport={() => setImportOpen(true)}
          onOpenHost={(host) => openManagedHost(host, true)}
        />

      </div>

      {ctxMenu && (
        <ContextMenu
          lang={lang}
          x={ctxMenu.x}
          y={ctxMenu.y}
          host={ctxMenu.host}
          groups={groups}
          onAction={onCtxAction}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {importOpen && (
        <ImportDialog
          lang={lang}
          existingHosts={hosts}
          onClose={() => setImportOpen(false)}
          onImport={(list) => importHosts(list)}
        />
      )}
    </div>
  );
}

const dangerousCommandPatterns: RegExp[] = [
  /^\s*rm\s+/i,
  /^\s*dd\s+/i,
  /^\s*mkfs\b/i,
  /^\s*fdisk\b/i,
  /^\s*mkfs\.ext\d*\b/i,
  /^\s*:\s*>\s*/i,
  /^\s*shutdown\s+/i,
  /^\s*reboot\b/i,
  /^\s*halt\b/i,
  /^\s*poweroff\b/i,
  /^\s*mv\s+.*\s+\/?(root|etc|usr|bin|opt|var)\b/i,
  /^\s*chmod\s+777\b/i,
  /^\s*chown\s+/i,
];

function isDangerousCommand(command: string) {
  const normalized = command.trim();
  return dangerousCommandPatterns.some((pattern) => pattern.test(normalized));
}
