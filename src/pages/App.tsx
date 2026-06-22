import { useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { TitleBar } from "../layouts/TitleBar";
import { Sidebar } from "../layouts/Sidebar";
import { ContextMenu } from "../layouts/ContextMenu";
import { Workspace } from "../layouts/Workspace";
import { ImportDialog } from "./ImportDialog";
import { type QuickCommand } from "../config/defaults";
import { useHosts } from "../store/hosts";
import { useSessions } from "../store/sessions";
import { useSettings } from "../store/settings";
import { useSnippets } from "../store/snippets";
import { detectSystemLang, t } from "../utils/i18n";
import { filterHostsForInventory, sortHostsForSidebar, type HostListFilter } from "../utils/hostFilters";
import type { GroupId, Host, Snippet } from "../config/types";
import type { QueuedCommand } from "./TerminalPane";
import { useConfirm } from "../components/ConfirmDialog";
import { Icon } from "../components/Icons";
import {
  configBackupRun,
  onSshHostMetadata,
  readonlyCheckRun,
  type SshExecHostArgs,
  type SshHostMetadata,
  type SshJumpArgs,
} from "../api/tauri";
import { moveLiveSession } from "../utils/liveSessions";
import { useCredentials } from "../store/credentials";
import { deviceTypeFromHost } from "../utils/deployScope";
import { findCredentialForHost, mergeHostCredentialTags } from "../utils/credentialMatching";
import type { ConfigBackupProfile, ReadonlyCheckId } from "../config/types";

type OpsNotice = {
  id: string;
  title: string;
  detail: string;
  status: "running" | "ok" | "failed";
};

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
    reorderHost,
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
      reorderHost: s.reorderHost,
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
    openDraftHost,
    openEphemeralHost,
    replaceEphemeralHost,
    connectActive,
    disconnectTab,
    openSettings,
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
      openDraftHost: s.openDraftHost,
      openEphemeralHost: s.openEphemeralHost,
      replaceEphemeralHost: s.replaceEphemeralHost,
      connectActive: s.connectActive,
      disconnectTab: s.disconnectTab,
      openSettings: s.openSettings,
      openSnippets: s.openSnippets,
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
    terminalCursorStyle,
    terminalCursorBlink,
    terminalScrollback,
    terminalCopyOnSelect,
    terminalRightClickPaste,
    terminalLocale,
    terminalTimezone,
    defaultShellId,
    defaultShellName,
    defaultShellPath,
    customShells,
    hardwareAcceleration,
    telemetry,
    autostart,
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
      terminalCursorStyle: s.terminalCursorStyle,
      terminalCursorBlink: s.terminalCursorBlink,
      terminalScrollback: s.terminalScrollback,
      terminalCopyOnSelect: s.terminalCopyOnSelect,
      terminalRightClickPaste: s.terminalRightClickPaste,
      terminalLocale: s.terminalLocale,
      terminalTimezone: s.terminalTimezone,
      defaultShellId: s.defaultShellId,
      defaultShellName: s.defaultShellName,
      defaultShellPath: s.defaultShellPath,
      customShells: s.customShells,
      hardwareAcceleration: s.hardwareAcceleration,
      telemetry: s.telemetry,
      autostart: s.autostart,
      allowConfigWrite: s.allowConfigWrite,
    }),
    shallow
  );

  const [ctxMenu, setCtxMenu] = useState<null | { x: number; y: number; host: Host }>(null);
  const [runQueue, setRunQueue] = useState<QueuedCommand[]>([]);
  const [editingHostId, setEditingHostId] = useState<string | null>(null);
  const [hostQuery, setHostQuery] = useState("");
  const [hostFilter, setHostFilter] = useState<HostListFilter>("all");
  const [opsNotices, setOpsNotices] = useState<OpsNotice[]>([]);
  const cancelEditCleanup = () => {
    if (editingHostId) {
      const sessionState = useSessions.getState();
      const draft = sessionState.ephemeralHosts[editingHostId];
      if (draft) {
        const tab = sessionState.tabs.find((t) => t.kind === "host" && t.hostId === editingHostId);
        if (tab) sessionState.closeTab(tab.id);
        else sessionState.forgetEphemeralHost(editingHostId);
        setEditingHostId(null);
        return;
      }
      const host = useHosts.getState().hosts.find((h) => h.id === editingHostId);
      if (host && !host.alias) {
        useHosts.getState().removeHost(editingHostId);
        const tab = sessionState.tabs.find((t) => t.kind === "host" && t.hostId === editingHostId);
        if (tab) sessionState.closeTab(tab.id);
      }
    }
    setEditingHostId(null);
  };
  const finishEditing = () => setEditingHostId(null);
  const [importOpen, setImportOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem("netssh.sidebarWidth"));
    return Number.isFinite(saved) && saved >= 240 && saved <= 460 ? saved : 320;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem("netssh.sidebarCollapsed") === "true"
  );
  const sidebarVisible = !sidebarCollapsed;
  const queueTimerRef = useRef(0);
  const confirm = useConfirm();

  useEffect(() => {
    return () => {
      window.clearTimeout(queueTimerRef.current);
    };
  }, []);

  useEffect(() => {
    void loadFromSshConfig();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onSshHostMetadata((metadata) => {
      const state = useHosts.getState();
      const target = state.hosts.find((host) => metadataMatchesHost(metadata, host));
      if (target && target.connectionType !== "serial") {
        const patch = hostMetadataPatch(target, metadata);
        if (Object.keys(patch).length > 0) {
          state.updateHost(target.id, patch);
        }
        return;
      }

      const sessionState = useSessions.getState();
      const ephemeralTarget = Object.values(sessionState.ephemeralHosts).find((host) =>
        metadataMatchesHost(metadata, host)
      );
      if (ephemeralTarget && ephemeralTarget.connectionType !== "serial") {
        const patch = hostMetadataPatch(ephemeralTarget, metadata);
        if (Object.keys(patch).length > 0) {
          sessionState.updateEphemeralHost(ephemeralTarget.id, patch);
        }
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key?.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        document.querySelector<HTMLElement>(".sidebar .search input")?.focus();
      }
      if ((event.ctrlKey || event.metaKey) && key === "m") {
        event.preventDefault();
        document.querySelector<HTMLElement>(".manual-card__foot .btn")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const activeHost =
    activeTab?.kind === "host"
      ? hosts.find((host) => host.id === activeTab.hostId) ||
        (activeTab.hostId ? ephemeralHosts[activeTab.hostId] : null) ||
        null
      : null;
  const activeQuickCommands = activeHost ? quickCommands[activeHost.id] || quickCommands[activeHost.alias] || [] : [];
  const homeHosts = useMemo(
    () => sortHostsForSidebar(filterHostsForInventory(hosts, { query: hostQuery, filter: hostFilter }), hostFilter),
    [hostFilter, hostQuery, hosts]
  );
  const homeHostScopeFiltered = hostQuery.trim().length > 0 || hostFilter !== "all";
  const inventoryHostCount = useMemo(
    () => hosts.filter((host) => host.alias.trim()).length,
    [hosts]
  );

  const openManagedHost = (host: Host, connectNow = true) => {
    if (connectNow) markConnected(host.id);
    openHost(host, connectNow);
  };

  const persistConnectedHost = async (host: Host) => {
    const sessionState = useSessions.getState();
    const latestEphemeralHost = sessionState.ephemeralHosts[host.id];
    if (!latestEphemeralHost) {
      markConnected(host.id);
      return;
    }

    const hostState = useHosts.getState();
    const safeBaseHost = inventoryHostFromEphemeral(latestEphemeralHost);
    const credentialProfileId = await rememberManualSessionPassword(
      safeBaseHost,
      latestEphemeralHost.ephemeralPassword
    );
    const safeHost = credentialProfileId ? { ...safeBaseHost, credentialProfileId } : safeBaseHost;
    const existing = findSavedHostForManualSession(hostState.hosts, safeHost);
    const connectedAt = Date.now();

    if (existing) {
      const patch = manualSessionHostPatch(existing, safeHost, connectedAt);
      hostState.updateHost(existing.id, patch);
      hostState.markConnected(existing.id, connectedAt);
      moveLiveSession(host.id, existing.id);
      replaceEphemeralHost(host.id, { ...existing, ...patch, id: existing.id });
      return;
    }

    const saved = hostState.addHost({
      ...safeHost,
      status: "ok",
      lastConnectedAt: connectedAt,
    });
    moveLiveSession(host.id, saved.id);
    replaceEphemeralHost(host.id, saved);
  };

  const saveHostPatch = (id: string, patch: Partial<Host>) => {
    const sessionState = useSessions.getState();
    const draft = sessionState.ephemeralHosts[id];
    const draftTab = sessionState.tabs.find((tab) => tab.kind === "host" && tab.hostId === id);
    if (draft && draftTab && !draftTab.connected) {
      const nextHost = { ...draft, ...patch, id };
      const { ephemeralPassword: _ephemeralPassword, ...safeHost } = nextHost;
      const saved = addHost(safeHost);
      sessionState.selectHost(saved);
      return;
    }
    updateHost(id, patch);
  };

  const rememberHostCredential = (hostId: string, credentialProfileId: string) => {
    const sessionState = useSessions.getState();
    if (sessionState.ephemeralHosts[hostId]) {
      sessionState.updateEphemeralHost(hostId, { credentialProfileId });
      return;
    }
    updateHost(hostId, { credentialProfileId });
  };

  const pushOpsNotice = (notice: Omit<OpsNotice, "id">) => {
    const id = `ops-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setOpsNotices((items) => [{ id, ...notice }, ...items].slice(0, 6));
    return id;
  };

  const updateOpsNotice = (id: string, patch: Partial<Omit<OpsNotice, "id">>) => {
    setOpsNotices((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const runReadonlyChecks = async (targets: Host[], checkId: ReadonlyCheckId) => {
    const selected = uniqueHosts(targets).filter((host) => host.alias.trim());
    if (selected.length === 0) return;
    const noticeId = pushOpsNotice({
      title: t(`ops.check.${checkId}`, lang),
      detail: t("ops.status.runningMany", lang, { count: selected.length }),
      status: "running",
    });
    let ok = 0;
    let failed = 0;
    await runLimited(selected, 3, async (host) => {
      try {
        const execHost = checkId === "reachability"
          ? reachableExecHostArgs(host)
          : await resolveExecHostArgs(host, useHosts.getState().hosts);
        if ("error" in execHost) throw new Error(execHost.error);
        const result = await readonlyCheckRun({
          checkId,
          profile: inferConfigProfile(host),
          host: execHost,
        });
        if (result.status === "ok") ok += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
      updateOpsNotice(noticeId, {
        detail: t("ops.status.progress", lang, { ok, failed, total: selected.length }),
        status: failed > 0 ? "failed" : "running",
      });
    });
    updateOpsNotice(noticeId, {
      detail: t("ops.status.doneMany", lang, { ok, failed, total: selected.length }),
      status: failed > 0 ? "failed" : "ok",
    });
  };

  const backupConfigForHosts = async (targets: Host[]) => {
    const selected = uniqueHosts(targets).filter((host) => host.alias.trim());
    if (selected.length === 0) return;
    const serialHosts = selected.filter((host) => (host.connectionType || "ssh") === "serial");
    if (serialHosts.length > 0 && selected.length === 1) {
      openManagedHost(serialHosts[0], true);
      pushOpsNotice({
        title: t("ops.action.backupConfig", lang),
        detail: t("ops.error.serialBackup", lang),
        status: "failed",
      });
      return;
    }
    const sshHosts = selected.filter((host) => (host.connectionType || "ssh") === "ssh");
    const noticeId = pushOpsNotice({
      title: t("ops.action.backupConfig", lang),
      detail: t("ops.status.runningMany", lang, { count: sshHosts.length }),
      status: "running",
    });
    let ok = 0;
    let failed = serialHosts.length;
    let lastPath = "";
    await runLimited(sshHosts, 3, async (host) => {
      try {
        const execHost = await resolveExecHostArgs(host, useHosts.getState().hosts);
        if ("error" in execHost) throw new Error(execHost.error);
        const result = await configBackupRun(inferConfigProfile(host), execHost);
        ok += 1;
        lastPath = result.record.path;
      } catch {
        failed += 1;
      }
      updateOpsNotice(noticeId, {
        detail: t("ops.status.progress", lang, { ok, failed, total: selected.length }),
        status: failed > 0 ? "failed" : "running",
      });
    });
    updateOpsNotice(noticeId, {
      detail: ok === 1 && lastPath
        ? t("ops.backup.saved", lang, { path: lastPath })
        : t("ops.status.doneMany", lang, { ok, failed, total: selected.length }),
      status: failed > 0 ? "failed" : "ok",
    });
  };

  const removeHostOrDraft = (id: string) => {
    const sessionState = useSessions.getState();
    if (sessionState.ephemeralHosts[id]) {
      const tab = sessionState.tabs.find((item) => item.kind === "host" && item.hostId === id);
      if (tab) sessionState.closeTab(tab.id);
      else sessionState.forgetEphemeralHost(id);
      setEditingHostId(null);
      return;
    }
    removeHost(id);
  };

  const connectActiveHost = () => {
    if (activeTab?.kind === "host" && activeHost && !ephemeralHosts[activeHost.id]) {
      markConnected(activeHost.id);
    }
    connectActive();
  };

  const settingsSnapshot = useMemo<Parameters<typeof Workspace>[0]["settings"]>(
    () => ({
      translucency,
      reduceMotion,
      fontSize,
      fontFamily,
      terminalCursorStyle,
      terminalCursorBlink,
      terminalScrollback,
      terminalCopyOnSelect,
      terminalRightClickPaste,
      terminalLocale,
      terminalTimezone,
      defaultShellId,
      defaultShellName,
      defaultShellPath,
      customShells,
      hardwareAcceleration,
      telemetry,
      autostart,
      followSystem,
      allowConfigWrite,
    }),
    [
      translucency,
      reduceMotion,
      fontSize,
      fontFamily,
      terminalCursorStyle,
      terminalCursorBlink,
      terminalScrollback,
      terminalCopyOnSelect,
      terminalRightClickPaste,
      terminalLocale,
      terminalTimezone,
      defaultShellId,
      defaultShellName,
      defaultShellPath,
      customShells,
      hardwareAcceleration,
      telemetry,
      autostart,
      followSystem,
      allowConfigWrite,
    ]
  );
  const updateSetting = <K extends keyof typeof settingsSnapshot>(
    key: K,
    value: (typeof settingsSnapshot)[K]
  ) => {
    setSetting(key, value as never);
  };
  const shellColumns = useMemo(() => {
    if (!sidebarVisible) return "minmax(0, 1fr)";
    return `${sidebarWidth}px 6px minmax(0, 1fr)`;
  }, [sidebarWidth, sidebarVisible]);

  const updateSidebarCollapsed = (next: boolean | ((current: boolean) => boolean)) => {
    setSidebarCollapsed((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      window.localStorage.setItem("netssh.sidebarCollapsed", resolved ? "true" : "false");
      return resolved;
    });
  };

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
      const hostTab = useSessions
        .getState()
        .tabs.find((tab) => tab.kind === "host" && tab.hostId === host.id);
      if (hostTab?.connected) disconnectTab(hostTab.id);
      selectHost(host);
      setEditingHostId(host.id);
    }
    if (action === "move" && extra) {
      moveHostToGroup(host.id, extra);
    }
    if (action === "delete") {
      void confirm({
        title: t("host.action.confirmRemove", lang, { alias: host.alias }),
        message: t("host.action.removeMessage", lang),
        confirmLabel: t("host.action.remove", lang),
        cancelLabel: t("common.cancel", lang),
        danger: true,
      }).then((ok) => {
        if (ok) removeHost(host.id);
      });
    }
  };

  const moveHostOrSessionToGroup = (hostId: string, groupId: GroupId) => {
    const sessionState = useSessions.getState();
    if (sessionState.ephemeralHosts[hostId]) {
      sessionState.updateEphemeralHost(hostId, { group: groupId });
      return;
    }
    moveHostToGroup(hostId, groupId);
  };

  const reorderHostOrMoveSession = (
    hostId: string,
    targetOrder: number,
    targetGroupId?: string,
    orderedHostIds?: string[]
  ) => {
    const sessionState = useSessions.getState();
    if (sessionState.ephemeralHosts[hostId]) {
      if (targetGroupId) sessionState.updateEphemeralHost(hostId, { group: targetGroupId });
      return;
    }
    reorderHost(hostId, targetOrder, targetGroupId, orderedHostIds);
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
      <TitleBar
        lang={lang}
        tabs={tabs}
        hosts={hosts}
        ephemeralHosts={ephemeralHosts}
        activeTabId={activeTabId}
        onSelectTab={setActive}
        onCloseTab={closeTab}
        onTabContextMenu={(event, tab) => {
          if (tab.kind !== "host" || !tab.hostId) return;
          const host = hosts.find((item) => item.id === tab.hostId);
          if (!host) return;
          event.preventDefault();
          event.stopPropagation();
          setActive(tab.id);
          setCtxMenu({ x: event.clientX, y: event.clientY, host });
        }}
        onNewTab={newTab}
        onGoHome={() => {
          setEditingHostId(null);
          goHome();
        }}
        onOpenSettings={() => openSettings("appearance")}
        onOpenCredentials={() => openSettings("credentials")}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => updateSidebarCollapsed((current) => !current)}
      />

      <div className="shell shell--no-rail" style={{ gridTemplateColumns: shellColumns } as CSSProperties}>
        {sidebarVisible && (
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
            onMoveHostToGroup={moveHostOrSessionToGroup}
            onReorderHost={reorderHostOrMoveSession}
            onRemoveHosts={(ids) => ids.forEach((id) => removeHost(id))}
            onToggleFavorite={toggleFavorite}
            query={hostQuery}
            filter={hostFilter}
            onQueryChange={setHostQuery}
            onFilterChange={setHostFilter}
            onAddHostQuick={() => {
              const created: Host = {
                id: `host-${Date.now()}`,
                alias: "",
                hostname: "",
                user: "",
                port: 22,
                group: "unassigned",
                status: "off",
                latency: null,
                connectionType: "ssh",
                source: "manual",
              };
              setEditingHostId(created.id);
              openDraftHost(created);
            }}
            onRunReadonlyCheck={runReadonlyChecks}
          />
        )}

        {sidebarVisible && (
          <div
            className="sidebar-resizer"
            role="separator"
            aria-orientation="vertical"
            title={t("workspace.sidebarResize", lang)}
            onPointerDown={startSidebarResize}
            onDoubleClick={() => {
              setSidebarWidth(320);
              window.localStorage.setItem("netssh.sidebarWidth", "320");
            }}
          />
        )}

        <Workspace
          lang={lang}
          tab={activeTab}
          activeHost={activeHost}
          hosts={hosts}
          homeHosts={homeHosts}
          homeHostScopeFiltered={homeHostScopeFiltered}
          inventoryHostCount={inventoryHostCount}
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
          onRunSnippet={queueCommand}
          runQueue={runQueue}
          groups={groups}
          editingHostId={editingHostId}
          setEditingHostId={setEditingHostId}
          cancelHostEdit={cancelEditCleanup}
          finishHostEdit={finishEditing}
          onAddHost={addHost}
          onUpdateHost={saveHostPatch}
          onRemoveHost={(id) => {
            removeHostOrDraft(id);
            setEditingHostId(null);
          }}
          onManualConnect={openEphemeralHost}
          onHostConnected={persistConnectedHost}
          onRememberCredential={rememberHostCredential}
          onAddGroup={addGroup}
          onOpenImport={() => setImportOpen(true)}
          onOpenHost={(host) => openManagedHost(host, true)}
          onRunReadonlyCheck={runReadonlyChecks}
          onBackupConfig={backupConfigForHosts}
        />

      </div>

      {opsNotices.length > 0 && (
        <div className="ops-toast-stack" aria-live="polite">
          {opsNotices.map((notice) => (
            <div key={notice.id} className={"ops-toast ops-toast--" + notice.status}>
              <span className="latency" />
              <div>
                <strong>{notice.title}</strong>
                <span>{notice.detail}</span>
              </div>
              <button
                type="button"
                className="icon-btn"
                title={t("common.close", lang)}
                onClick={() => setOpsNotices((items) => items.filter((item) => item.id !== notice.id))}
              >
                {Icon.x}
              </button>
            </div>
          ))}
        </div>
      )}

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

function inventoryHostFromEphemeral(host: Host): Host {
  const { ephemeralPassword: _ephemeralPassword, ...safeHost } = host;
  return {
    ...safeHost,
    alias: safeHost.alias.trim() || safeHost.hostname.trim(),
    hostname: safeHost.hostname.trim(),
    user: safeHost.user.trim(),
    port: safeHost.port || 22,
    group: safeHost.group || "unassigned",
    connectionType: safeHost.connectionType || "ssh",
    source: safeHost.source || "manual",
  };
}

function findSavedHostForManualSession(hosts: Host[], manualHost: Host) {
  const alias = hostKey(manualHost.alias);
  const hostname = hostKey(manualHost.hostname);
  const port = manualHost.port || 22;
  const user = hostKey(manualHost.user);
  const connectionType = manualHost.connectionType || "ssh";

  const aliasMatch = alias
    ? hosts.find(
        (host) =>
          hostKey(host.alias) === alias &&
          hostKey(host.hostname) === hostname &&
          (host.port || 22) === port &&
          (host.connectionType || "ssh") === connectionType
      )
    : undefined;
  if (aliasMatch) return aliasMatch;

  return hosts.find(
    (host) =>
      hostKey(host.hostname) === hostname &&
      (host.port || 22) === port &&
      hostKey(host.user) === user &&
      (host.connectionType || "ssh") === connectionType
  );
}

function manualSessionHostPatch(existing: Host, manualHost: Host, connectedAt: number): Partial<Host> {
  return {
    alias: existing.alias || manualHost.alias,
    hostname: existing.hostname || manualHost.hostname,
    user: existing.user || manualHost.user,
    port: existing.port || manualHost.port || 22,
    identityFile: manualHost.identityFile ?? existing.identityFile,
    credentialProfileId: manualHost.credentialProfileId ?? existing.credentialProfileId,
    connectionType: manualHost.connectionType || existing.connectionType || "ssh",
    source: existing.source || manualHost.source || "manual",
    deployScope:
      existing.deployScope && existing.deployScope !== "unknown"
        ? existing.deployScope
        : manualHost.deployScope,
    status: "ok",
    lastConnectedAt: connectedAt,
  };
}

async function rememberManualSessionPassword(host: Host, password?: string) {
  if (!password || (host.connectionType || "ssh") === "serial") return host.credentialProfileId;
  const credentialStore = useCredentials.getState();
  const credentialProfile = findCredentialForHost(host, credentialStore.credentials);
  const username = (credentialProfile?.user || host.user || "").trim();
  if (!username) return host.credentialProfileId;
  const identityFile = credentialProfile?.identityFile || host.identityFile || undefined;

  if (credentialProfile) {
    await credentialStore.update(credentialProfile.id, {
      user: username,
      identityFile,
      tags: mergeHostCredentialTags(credentialProfile.tags, host, username),
    });
    const saved = await useCredentials.getState().savePassword(credentialProfile.id, password);
    return saved ? credentialProfile.id : host.credentialProfileId;
  }

  const created = await credentialStore.add({
    name: host.alias.trim() || host.hostname.trim() || `${username}@${host.port || 22}`,
    group: preferredCredentialGroup(host),
    user: username,
    identityFile,
    tags: mergeHostCredentialTags(undefined, host, username),
    notes: host.alias !== host.hostname ? host.hostname : undefined,
    password,
  });

  if (!created.hasPassword) {
    await useCredentials.getState().remove(created.id);
    return host.credentialProfileId;
  }
  return created.id;
}

function preferredCredentialGroup(host: Host) {
  const detected = host.iconOverride || deviceTypeFromHost(host);
  if (detected && detected !== "auto") return detected;
  return host.role?.trim() || host.group?.trim() || "ssh";
}

function hostKey(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function metadataMatchesHost(metadata: SshHostMetadata, host: Host) {
  if (host.alias === metadata.alias) return true;
  if (host.aliases?.includes(metadata.alias)) return true;
  return host.hostname === metadata.host && host.port === metadata.port;
}

function hostMetadataPatch(host: Host, metadata: SshHostMetadata): Partial<Host> {
  const patch: Partial<Host> = {};
  if (
    metadata.icon_override &&
    metadata.icon_override !== host.iconOverride &&
    (!host.iconOverride || metadata.icon_confidence >= 80)
  ) {
    patch.iconOverride = metadata.icon_override;
  }
  if (metadata.role && !host.role) {
    patch.role = metadata.role;
  }

  const mergedTags = mergeDetectedTags(host.tags, metadata.tags);
  if (mergedTags && !sameStringList(mergedTags, host.tags || [])) {
    patch.tags = mergedTags;
  }
  return patch;
}

function mergeDetectedTags(current: string[] | undefined, detected: string[] | undefined) {
  if (!detected?.length) return current;
  const tags = [...(current || [])];
  for (const rawTag of detected) {
    const tag = rawTag.trim();
    if (!tag || tags.some((item) => item.toLowerCase() === tag.toLowerCase())) continue;
    tags.push(tag);
  }
  return tags;
}

function sameStringList(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
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

function uniqueHosts(hosts: Host[]) {
  const seen = new Set<string>();
  return hosts.filter((host) => {
    if (seen.has(host.id)) return false;
    seen.add(host.id);
    return true;
  });
}

function reachableExecHostArgs(host: Host): SshExecHostArgs {
  return {
    alias: host.alias,
    host: host.hostname,
    user: host.user,
    port: host.port || 22,
    deviceHint: host.iconOverride || deviceTypeFromHost(host),
  };
}

async function resolveExecHostArgs(
  host: Host,
  allHosts: Host[]
): Promise<SshExecHostArgs | { error: string }> {
  if ((host.connectionType || "ssh") !== "ssh") return { error: "ssh_only" };
  const target = await resolveCredentialForHost(host);
  if (!target.user) return { error: "username_required" };
  if (!target.password && !target.identityFile) return { error: "credentials_required" };

  let jump: SshJumpArgs | undefined;
  if (host.jumpHostId) {
    const jumpHost = allHosts.find((item) => item.id === host.jumpHostId);
    if (!jumpHost || (jumpHost.connectionType || "ssh") !== "ssh" || jumpHost.id === host.id || jumpHost.jumpHostId) {
      return { error: "jump_host_missing" };
    }
    const jumpCreds = await resolveCredentialForHost(jumpHost);
    if (!jumpCreds.user) return { error: "jump_username_required" };
    if (!jumpCreds.password && !jumpCreds.identityFile) return { error: "jump_credentials_required" };
    jump = {
      alias: jumpHost.alias,
      host: jumpHost.hostname,
      user: jumpCreds.user,
      port: jumpHost.port || 22,
      identityFile: jumpCreds.identityFile,
      password: jumpCreds.password,
      deviceHint: jumpHost.iconOverride || deviceTypeFromHost(jumpHost),
    };
  }

  return {
    alias: host.alias,
    host: host.hostname,
    user: target.user,
    port: host.port || 22,
    identityFile: target.identityFile,
    password: target.password,
    deviceHint: host.iconOverride || deviceTypeFromHost(host),
    jump,
  };
}

async function resolveCredentialForHost(host: Host) {
  const credentialStore = useCredentials.getState();
  const credentialProfile = findCredentialForHost(host, credentialStore.credentials);
  const user = (credentialProfile?.user || host.user || "").trim();
  const identityFile = credentialProfile?.identityFile || host.identityFile || undefined;
  const password = credentialProfile
    ? (await credentialStore.loadPassword(credentialProfile.id).catch(() => null)) || undefined
    : host.ephemeralPassword || undefined;
  return { user, identityFile, password };
}

function inferConfigProfile(host: Host): ConfigBackupProfile {
  const detected = [host.iconOverride, deviceTypeFromHost(host), host.assetType, host.alias, host.hostname, host.role, ...(host.tags || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\bh3c\b|comware/.test(detected)) return "h3c";
  if (/huawei|vrp|usg|s\d{4,}/.test(detected)) return "huawei";
  if (/cisco|catalyst|ios[-_ ]?xe|nx[-_ ]?os|nexus|asa/.test(detected)) return "cisco";
  if (/openwrt|istoreos|istore|lede|immortalwrt/.test(detected)) return "openwrt";
  return "linux";
}

async function runLimited<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current], current);
    }
  });
  await Promise.all(runners);
}
