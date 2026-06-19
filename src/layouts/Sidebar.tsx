import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { t } from "../utils/i18n";
import { useReachability } from "../store/reachability";
import { brandIcon } from "../components/BrandIcons";
import { useConfirm } from "../components/ConfirmDialog";
import { deployScope, deployScopeLabel } from "../utils/deployScope";
import type { Group, GroupId, Host, Lang } from "../config/types";
import { Icon } from "../components/Icons";

interface SidebarProps {
  lang: Lang;
  hosts: Host[];
  groups: Group[];
  activeHostId?: string;
  onPickHost: (host: Host) => void;
  onDoubleClickHost: (host: Host) => void;
  onContextMenu: (event: MouseEvent, host: Host) => void;
  onOpenImport: () => void;
  onAddGroup: (name: string, subnet?: string) => Group;
  onRenameGroup: (id: GroupId, name: string, subnet?: string) => void;
  onRemoveGroup: (id: GroupId) => void;
  onMoveHostToGroup: (hostId: string, groupId: GroupId) => void;
  onAddHostQuick: () => void;
  onRemoveHosts: (ids: string[]) => void;
  onToggleFavorite: (hostId: string) => void;
  onCollapseSidebar?: () => void;
}

export function Sidebar({
  lang,
  hosts,
  groups,
  activeHostId,
  onPickHost,
  onDoubleClickHost,
  onContextMenu,
  onOpenImport,
  onAddGroup,
  onRenameGroup,
  onRemoveGroup,
  onMoveHostToGroup,
  onAddHostQuick,
  onRemoveHosts,
  onToggleFavorite,
  onCollapseSidebar,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragOverGroup, setDragOverGroup] = useState<GroupId | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "favorite" | "recent" | "local" | "cloud">("all");
  const [siteEditor, setSiteEditor] = useState(false);
  const [newSite, setNewSite] = useState("");
  const [newSiteSubnet, setNewSiteSubnet] = useState("");
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingGroupSubnet, setEditingGroupSubnet] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const reachability = useReachability(hosts);
  const confirm = useConfirm();

  const filtered = useMemo(() => {
    let list = [...hosts].filter((h) => h.alias.trim());
    if (filter === "favorite") list = list.filter(isFavoriteHost);
    if (filter === "recent") list = list.filter((host) => Boolean(host.lastConnectedAt));
    if (filter === "local") list = list.filter((host) => deployScope(host) === "local");
    if (filter === "cloud") list = list.filter((host) => deployScope(host) === "cloud");
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((host) =>
        [host.alias, host.hostname, host.role, host.user, (host.tags || []).join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    return sortHostsForSidebar(list, filter);
  }, [filter, hosts, query]);

  const filteredIds = useMemo(() => new Set(filtered.map((h) => h.id)), [filtered]);

  const grouped = useMemo(() => {
    const buckets = groups.map((group) => ({
      ...group,
      hosts: filtered.filter((host) => host.group === group.id),
    }));
    const knownIds = new Set(groups.map((g) => g.id));
    const orphans = filtered.filter((host) => !knownIds.has(host.group));
    const alreadyHasUnassigned = groups.some((g) => g.id === "unassigned");
    if (orphans.length && !alreadyHasUnassigned) {
      buckets.push({
        id: "unassigned" as GroupId,
        name: t("groups.unassigned", lang),
        color: "#897e6e",
        subnet: undefined,
        hosts: orphans,
      });
    }
    return buckets;
  }, [filtered, groups, lang]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredIds));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const exitBatchMode = () => {
    setBatchMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    void confirm({
      title: lang === "zh"
        ? `Remove ${selectedIds.size} hosts?`
        : `Remove ${selectedIds.size} host(s)?`,
      message: lang === "zh"
        ? "Only Netssh local metadata is removed; ~/.ssh/config is not changed."
        : "Only Netssh local data is removed. Your ~/.ssh/config stays untouched.",
      confirmLabel: lang === "zh" ? "Remove" : "Remove",
      cancelLabel: lang === "zh" ? "Cancel" : "Cancel",
      danger: true,
    }).then((ok) => {
      if (ok) {
        onRemoveHosts([...selectedIds]);
        exitBatchMode();
      }
    });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-title">
          <span className="eyebrow">{t("sidebar.eyebrow", lang)}</span>
          <span className="sidebar-title__actions">
            <span className="count">{filtered.length}</span>
            {onCollapseSidebar && (
              <button
                type="button"
                className="icon-btn sidebar-title__toggle"
                title={t("sidebar.action.hide", lang)}
                aria-label={t("sidebar.action.hide", lang)}
                onClick={onCollapseSidebar}
              >
                {Icon.sidebarHide}
              </button>
            )}
          </span>
        </div>
        <div className="search">
          {Icon.search}
          <input placeholder={t("sidebar.search", lang)} value={query} onChange={(event) => setQuery(event.target.value)} />
          <kbd>Ctrl + K</kbd>
        </div>
        <div className="sidebar-filters">
          {[
            ["all", t("sidebar.filter.all", lang)],
            ["favorite", t("sidebar.filter.pinned", lang)],
            ["recent", t("sidebar.filter.recent", lang)],
            ["local", lang === "zh" ? "Local" : "Local"],
            ["cloud", lang === "zh" ? "Cloud" : "Cloud"],
          ].map(([id, label]) => (
            <button key={id} className={"chip " + (filter === id ? "active" : "")} onClick={() => setFilter(id as typeof filter)}>
              {label}
            </button>
          ))}
        </div>
        <div className="sidebar-quick">
          <button className="sidebar-quick__btn" onClick={onAddHostQuick} title={t("host.action.add", lang)}>
            {Icon.plus}
            <span>{t("host.action.add", lang)}</span>
          </button>
          <button className="sidebar-quick__btn" onClick={onOpenImport} title={t("import.title", lang)}>
            {Icon.import}
            <span>{t("import.short", lang)}</span>
          </button>
          <button className="sidebar-quick__btn" onClick={() => setSiteEditor((v) => !v)} title={t("site.action.add", lang)}>
            <span className="sidebar-quick__glyph">#</span>
            <span>{t("site.action.add", lang)}</span>
          </button>
        </div>
        {siteEditor && (
          <form
            className="sidebar-siteform"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newSite.trim()) return;
              onAddGroup(newSite.trim(), newSiteSubnet.trim() || undefined);
              setNewSite("");
              setNewSiteSubnet("");
              setSiteEditor(false);
            }}
          >
            <input
              autoFocus
              value={newSite}
              onChange={(e) => setNewSite(e.target.value)}
              placeholder={t("site.field.name", lang)}
            />
            <input
              value={newSiteSubnet}
              onChange={(e) => setNewSiteSubnet(e.target.value)}
              placeholder={t("site.field.subnet", lang)}
            />
            <button type="submit" className="btn ghost">{t("common.add", lang)}</button>
          </form>
        )}

        {/* Batch management toolbar */}
        <div className="sidebar-batch-bar">
          {!batchMode ? (
            <button
              className="sidebar-quick__btn"
              onClick={() => setBatchMode(true)}
              title={lang === "zh" ? "Batch manage hosts" : "Batch manage hosts"}
            >
              <svg viewBox="0 0 14 14" width="10" height="10" fill="none">
                <rect x="1.5" y="2" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 7l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{lang === "zh" ? "Batch" : "Batch"}</span>
            </button>
          ) : (
            <div className="batch-actions">
              <button className="chip" onClick={selectAllFiltered}>
                {lang === "zh" ? "Select all" : "Select all"}
              </button>
              <button className="chip" onClick={deselectAll}>
                {lang === "zh" ? "Deselect" : "Deselect"}
              </button>
              <button
                className="chip danger"
                disabled={selectedIds.size === 0}
                onClick={handleBatchDelete}
              >
                {Icon.trash}
                <span>{selectedIds.size > 0 ? `(${selectedIds.size})` : ""}</span>
              </button>
              <button className="chip" onClick={exitBatchMode}>
                {lang === "zh" ? "Done" : "Done"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-body">
        {grouped.map((group) => {
          const isCollapsed = !!collapsed[group.id];
          const groupLabelKey = `groups.${group.id}`;
          const i18nLabel = t(groupLabelKey, lang);
          const label = i18nLabel === groupLabelKey ? group.name : i18nLabel;
          return (
            <div key={group.id} className={"host-group " + (isCollapsed ? "collapsed" : "")}>
              <div
                className={"host-group-head " + (dragOverGroup === group.id ? "drop-target" : "")}
                onClick={() => setCollapsed({ ...collapsed, [group.id]: !isCollapsed })}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverGroup(group.id);
                }}
                onDragLeave={() => setDragOverGroup((id) => (id === group.id ? null : id))}
                onDrop={(event) => {
                  event.preventDefault();
                  const hostId = event.dataTransfer.getData("text/netssh-host");
                  if (hostId) {
                    onMoveHostToGroup(hostId, group.id);
                    setCollapsed({ ...collapsed, [group.id]: false });
                  }
                  setDragOverGroup(null);
                }}
              >
                <span className="chevron">{Icon.chevron}</span>
                <span className="moon" style={{ color: group.color, background: group.color }} />
                <span className="group-label">
                  <span className="name">{label}</span>
                  {group.subnet && <span className="subnet">{group.subnet}</span>}
                </span>
                <span className="count">{group.hosts.length}</span>
                {group.id !== "unassigned" && (
                  <span className="host-group-actions" onClick={(event) => event.stopPropagation()}>
                    <button
                      className="icon-btn"
                      title={t("site.action.rename", lang)}
                      onClick={() => {
                        setEditingGroup(group);
                        setEditingGroupName(group.name);
                        setEditingGroupSubnet(group.subnet || "");
                      }}
                    >
                      {Icon.edit}
                    </button>
                    <button
                      className="icon-btn"
                      title={t("site.action.remove", lang)}
                      onClick={() => {
                        void confirm({
                          title: t("site.confirm.remove", lang, { name: group.name }),
                          confirmLabel: t("site.action.remove", lang),
                          cancelLabel: t("common.cancel", lang),
                          danger: true,
                        }).then((ok) => {
                          if (ok) onRemoveGroup(group.id);
                        });
                      }}
                    >
                      {Icon.trash}
                    </button>
                  </span>
                )}
              </div>
              {editingGroup?.id === group.id && (
                <form
                  className="site-rename-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!editingGroupName.trim()) return;
                    onRenameGroup(group.id, editingGroupName.trim(), editingGroupSubnet.trim() || undefined);
                    setEditingGroup(null);
                  }}
                >
                  <input
                    autoFocus
                    value={editingGroupName}
                    onChange={(event) => setEditingGroupName(event.target.value)}
                    placeholder={t("site.field.name", lang)}
                  />
                  <input
                    value={editingGroupSubnet}
                    onChange={(event) => setEditingGroupSubnet(event.target.value)}
                    placeholder={t("site.field.subnet", lang)}
                  />
                  <button className="btn" type="submit">{t("common.save", lang)}</button>
                  <button className="btn ghost" type="button" onClick={() => setEditingGroup(null)}>{t("common.cancel", lang)}</button>
                </form>
              )}
              <div className="host-list">
                {group.hosts.map((host) => {
                  const live = reachability[host.id];
                  const effStatus = live?.status ?? host.status;
                  const effLatency = live?.latency ?? host.latency;
                  const scope = deployScope(host);
                  const isSelected = selectedIds.has(host.id);
                  const favorite = isFavoriteHost(host);
                  return (
                  <div
                    key={host.id}
                    draggable={!batchMode}
                    onDragStart={(event) => {
                      if (batchMode) return;
                      event.dataTransfer.setData("text/netssh-host", host.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    title={`${host.alias} - ${host.user}@${host.hostname}${host.port !== 22 ? `:${host.port}` : ""} - ${statusTooltip(effLatency, effStatus, lang)} - ${recentTooltip(host.lastConnectedAt, lang)}`}
                    className={
                      "host-row" +
                      (host.id === activeHostId ? " active" : "") +
                      (effStatus === "ok" ? " connected" : "") +
                      (isSelected ? " selected" : "")
                    }
                    onClick={() => {
                      if (batchMode) {
                        toggleSelect(host.id);
                      } else {
                        onPickHost(host);
                      }
                    }}
                    onDoubleClick={() => {
                      if (!batchMode) onDoubleClickHost(host);
                    }}
                    onContextMenu={(event) => {
                      if (batchMode) return;
                      event.preventDefault();
                      onContextMenu(event, host);
                    }}
                  >
                    {batchMode && (
                      <span className={"batch-check" + (isSelected ? " checked" : "")}>
                        {isSelected && (
                          <svg viewBox="0 0 10 10" width="8" height="8"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        )}
                      </span>
                    )}
                    <span className="host-icon" style={{ color: host.hue }}>
                      {brandIcon(host)}
                    </span>
                    <span className="host-main">
                      <div className="host-alias">{host.alias}</div>
                      <div className="host-meta">
                        {host.user}@{host.hostname}
                        {host.port !== 22 ? `:${host.port}` : ""}
                      </div>
                      <div className="host-tags">
                        <span className={"deploy-chip deploy-chip--" + scope}>{deployScopeLabel(scope, lang)}</span>
                        {host.cloudProvider && <span className="deploy-chip deploy-chip--provider">{host.cloudProvider}</span>}
                        {host.lastConnectedAt && <span className="deploy-chip deploy-chip--recent">{formatRecent(host.lastConnectedAt, lang)}</span>}
                      </div>
                    </span>
                    <span className="row-flex gap-tight">
                      <button
                        type="button"
                        className={"host-favorite" + (favorite ? " active" : "")}
                        title={favorite
                          ? (lang === "zh" ? "Remove from favorites" : "Remove from favorites")
                          : (lang === "zh" ? "Add to favorites" : "Add to favorites")}
                        aria-label={favorite
                          ? (lang === "zh" ? "Remove from favorites" : "Remove from favorites")
                          : (lang === "zh" ? "Add to favorites" : "Add to favorites")}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleFavorite(host.id);
                        }}
                      >
                        {Icon.bookmark}
                      </button>
                      <span
                        className={"latency " + latencyClass(effLatency, effStatus)}
                        data-tooltip={statusTooltip(effLatency, effStatus, lang)}
                        aria-label={statusTooltip(effLatency, effStatus, lang)}
                      />
                    </span>
                  </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function statusTooltip(latency?: number | null, status?: Host["status"], lang?: Lang) {
  if (status === "off" || latency == null) {
    return lang === "zh" ? "Not checked yet: double-click to connect and update status" : "Not checked yet: double-click to connect and update status";
  }
  if (latency < 20) {
    return lang === "zh" ? `Healthy: ${latency} ms latency` : `Healthy: ${latency} ms latency`;
  }
  if (latency < 60) {
    return lang === "zh" ? `Needs attention: ${latency} ms latency` : `Needs attention: ${latency} ms latency`;
  }
  return lang === "zh" ? `Critical: ${latency} ms latency or connection issue` : `Critical: ${latency} ms latency or connection issue`;
}

function latencyClass(latency?: number | null, status?: Host["status"]) {
  if (status === "off" || latency == null) return "off";
  if (latency < 20) return "ok";
  if (latency < 60) return "warn";
  return "bad";
}

function isFavoriteHost(host: Host) {
  return Boolean(host.favorite ?? host.pinned);
}

function sortHostsForSidebar(
  hosts: Host[],
  filter: "all" | "favorite" | "recent" | "local" | "cloud"
) {
  return [...hosts].sort((a, b) => {
    if (filter === "recent") {
      return (b.lastConnectedAt || 0) - (a.lastConnectedAt || 0);
    }
    const favoriteDelta = Number(isFavoriteHost(b)) - Number(isFavoriteHost(a));
    if (favoriteDelta !== 0) return favoriteDelta;
    const recentDelta = (b.lastConnectedAt || 0) - (a.lastConnectedAt || 0);
    if (recentDelta !== 0) return recentDelta;
    return a.alias.localeCompare(b.alias);
  });
}

function formatRecent(timestamp: number, lang: Lang) {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) {
    return lang === "zh" ? `${minutes}m ago` : `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return lang === "zh" ? `${hours}h ago` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return lang === "zh" ? `${days}d ago` : `${days}d ago`;
}

function recentTooltip(timestamp: number | undefined, lang: Lang) {
  if (!timestamp) return lang === "zh" ? "Never connected" : "Never connected";
  return lang === "zh" ? `Last connected: ${formatRecent(timestamp, lang)}` : `Last connected: ${formatRecent(timestamp, lang)}`;
}
