import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import type { QuickCommand } from "../config/defaults";
import { useSessions } from "../store/sessions";
import type { Group, Host, Lang, SettingsSectionId, Snippet, Tab } from "../config/types";
import { HostDetail } from "../pages/HostDetail";
import { Settings } from "../pages/Settings";
import { SnippetsLibrary } from "../pages/SnippetsLibrary";
import { TerminalPane, type QueuedCommand } from "../pages/TerminalPane";

interface WorkspaceProps {
  lang: Lang;
  tab?: Tab;
  activeHost?: Host | null;
  hosts: Host[];
  homeHosts: Host[];
  homeHostScopeFiltered: boolean;
  inventoryHostCount: number;
  ephemeralHosts: Record<string, Host>;
  snippets: Snippet[];
  categories: Parameters<typeof SnippetsLibrary>[0]["categories"];
  quickCommands: QuickCommand[];
  theme: Parameters<typeof Settings>[0]["theme"];
  setTheme: Parameters<typeof Settings>[0]["setTheme"];
  settings: Parameters<typeof Settings>[0]["settings"];
  setSetting: Parameters<typeof Settings>[0]["setSetting"];
  setLang: (lang: Lang) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRunSnippet: (snippet: Snippet | QuickCommand) => void;
  runQueue: QueuedCommand[];
  groups: Group[];
  editingHostId: string | null;
  setEditingHostId: (id: string | null) => void;
  cancelHostEdit: () => void;
  finishHostEdit: () => void;
  onAddHost: (host: Omit<Host, "id"> & { id?: string }) => Host;
  onUpdateHost: (id: string, patch: Partial<Host>) => void;
  onRemoveHost: (id: string) => void;
  onManualConnect: (host: Host) => void;
  onAddGroup: (name: string, subnet?: string) => Group;
  onOpenImport: () => void;
  onOpenHost: (host: Host) => void;
}

export function Workspace({
  lang,
  tab,
  activeHost,
  hosts,
  homeHosts,
  homeHostScopeFiltered,
  inventoryHostCount,
  ephemeralHosts,
  snippets,
  categories,
  quickCommands,
  theme,
  setTheme,
  settings,
  setSetting,
  setLang,
  onConnect,
  onDisconnect,
  onRunSnippet,
  runQueue,
  groups,
  editingHostId,
  setEditingHostId,
  cancelHostEdit,
  finishHostEdit,
  onAddHost,
  onUpdateHost,
  onRemoveHost,
  onManualConnect,
  onAddGroup,
  onOpenImport,
  onOpenHost,
}: WorkspaceProps) {
  const { splitTabIds, tabs, activeTabId, setActive, toggleSplit, openQuad } = useSessions(
    (s) => ({
      splitTabIds: s.splitTabIds,
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      setActive: s.setActive,
      toggleSplit: s.toggleSplit,
      openQuad: s.openQuad,
    }),
    shallow
  );

  const splitTabs = useMemo(() => {
    if (splitTabIds.length < 2) return [] as Tab[];
    const lookup = new Map(tabs.map((t) => [t.id, t]));
    const ordered = splitTabIds
      .map((id) => lookup.get(id))
      .filter((t): t is Tab => Boolean(t));
    const active = ordered.find((t) => t.id === activeTabId);
    if (!active) return ordered;
    return [active, ...ordered.filter((t) => t.id !== activeTabId)];
  }, [splitTabIds, tabs, activeTabId]);

  if (splitTabs.length >= 2 && tab?.kind === "host") {
    return (
      <main className="workspace">
        <div className={"split-grid split-grid--n" + splitTabs.length}>
          {splitTabs.map((st, idx) => {
            const sessionHost =
              hosts.find((h) => h.id === st.hostId) ||
              (st.hostId ? ephemeralHosts[st.hostId] : undefined);
            const isPrimary = idx === 0;
            return (
              <div
                key={st.id}
                className={"split-cell" + (isPrimary ? " split-cell--primary" : "")}
                onClick={() => !isPrimary && setActive(st.id)}
              >
                <div className="split-cell__bar">
                  <span
                    className="split-cell__dot"
                    style={{ background: st.hue || "var(--accent)" }}
                  />
                  <span className="split-cell__title">{st.title}</span>
                  <button
                    className="icon-btn"
                    title={lang === "zh" ? "Pop out of split" : "Pop out of split"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSplit(st.id);
                    }}
                  >
                    <svg viewBox="0 0 10 10" width="10" height="10">
                      <path
                        d="M0 0l10 10M10 0L0 10"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
                <div className="split-cell__body">
                  {sessionHost ? (
                    <TerminalPane
                      key={`${st.id}-${sessionHost.id}`}
                      lang={lang}
                      host={sessionHost}
                      onClose={() => toggleSplit(st.id)}
                      onRetry={() => setActive(st.id)}
                      onEditHost={() => {
                        setActive(st.id);
                        toggleSplit(st.id);
                        setEditingHostId(sessionHost.id);
                      }}
                      runQueue={isPrimary ? runQueue : undefined}
                    />
                  ) : (
                    <div style={{ padding: 24, color: "var(--text-mute)" }}>
                      {lang === "zh" ? "session unavailable" : "session unavailable"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    );
  }

  return (
    <main className="workspace">
      {tab?.kind === "settings" && (
        <Settings
          lang={lang}
          setLang={setLang}
          theme={theme}
          setTheme={setTheme}
          settings={settings}
          setSetting={setSetting}
          hosts={hosts}
          groups={groups}
          section={tab.settingsSection ?? "appearance"}
          onSectionChange={(section: SettingsSectionId) => useSessions.getState().setSettingsSection(section)}
          onOpenHost={onOpenHost}
          onEditHost={(host) => {
            setEditingHostId(host.id);
            useSessions.getState().selectHost(host);
          }}
        />
      )}
      {tab?.kind === "snippets" && (
        <SnippetsLibrary lang={lang} snippets={snippets} categories={categories} onRun={onRunSnippet} />
      )}
      {tab?.kind === "local" && (
        <TerminalPane
          lang={lang}
          shellId={tab.shellId}
          shellPath={tab.shellPath}
          shellTitle={tab.title}
          onClose={onDisconnect}
          runQueue={runQueue}
        />
      )}
      {(!tab || tab.kind === "home") && (
        <HostDetail
          lang={lang}
          host={null}
          onConnect={onConnect}
          snippets={snippets}
          quickCmds={quickCommands}
          hosts={homeHosts}
          hostScopeFiltered={homeHostScopeFiltered}
          inventoryHostCount={inventoryHostCount}
          onRunSnippet={onRunSnippet}
          groups={groups}
          editing={false}
          startEditing={() => {}}
          cancelEditing={cancelHostEdit}
          finishEditing={finishHostEdit}
          onUpdateHost={onUpdateHost}
          onRemoveHost={onRemoveHost}
          onAddHost={onAddHost}
          onManualConnect={onManualConnect}
          onAddGroup={onAddGroup}
          onOpenImport={onOpenImport}
          onPickHost={(host) => {
            setEditingHostId(null);
            useSessions.getState().selectHost(host);
          }}
          onOpenHost={onOpenHost}
          onOpenQuad={openQuad}
          canOpenQuad={tabs.filter((item) => item.kind === "host" && item.connected && item.hostId).length >= 2}
        />
      )}
      {tab?.kind === "host" && !tab?.connected && (
        <HostDetail
          lang={lang}
          mode={activeHost ? "default" : "new-session"}
          host={activeHost}
          onConnect={onConnect}
          snippets={snippets}
          quickCmds={quickCommands}
          hosts={hosts}
          onRunSnippet={onRunSnippet}
          groups={groups}
          editing={editingHostId === activeHost?.id}
          startEditing={() => activeHost && setEditingHostId(activeHost.id)}
          cancelEditing={cancelHostEdit}
          finishEditing={finishHostEdit}
          onUpdateHost={onUpdateHost}
          onRemoveHost={onRemoveHost}
          onAddHost={(host) => {
            const created = onAddHost(host);
            setEditingHostId(created.id);
            return created;
          }}
          onManualConnect={onManualConnect}
          onAddGroup={onAddGroup}
          onOpenImport={onOpenImport}
          onPickHost={(host) => {
            setEditingHostId(null);
            useSessions.getState().selectHost(host);
          }}
          onOpenHost={onOpenHost}
          onOpenQuad={openQuad}
          canOpenQuad={tabs.filter((item) => item.kind === "host" && item.connected && item.hostId).length >= 2}
        />
      )}
      {tab?.kind === "host" && tab.connected && activeHost && (
        <div className="terminal-wrap">
          <TerminalPane
            key={`${tab.id}-${activeHost.id}`}
            lang={lang}
            host={activeHost}
            onClose={onDisconnect}
            onRetry={onConnect}
            onEditHost={() => {
              onDisconnect();
              setEditingHostId(activeHost.id);
            }}
            runQueue={runQueue}
          />
        </div>
      )}
    </main>
  );
}
