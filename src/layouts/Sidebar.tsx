import { Fragment, useMemo, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent } from "react";
import { t } from "../utils/i18n";
import { useReachability } from "../store/reachability";
import { brandIcon } from "../components/BrandIcons";
import { useConfirm } from "../components/ConfirmDialog";
import { deployScope, deployScopeLabel } from "../utils/deployScope";
import { displayGroupName, groupHostsForDisplay } from "../utils/groups";
import { filterHostsForInventory, isFavoriteHost, sortHostsForSidebar, type HostListFilter } from "../utils/hostFilters";
import type { Group, GroupId, Host, Lang, ReadonlyCheckId } from "../config/types";
import { Icon } from "../components/Icons";

const HOST_DRAG_TYPES = ["application/x-netssh-host", "text/netssh-host", "text/plain"] as const;
const HOST_DRAG_READ_TYPES = [...HOST_DRAG_TYPES, "Text", "text"] as const;

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
  onReorderHost: (hostId: string, targetOrder: number, targetGroupId?: string, orderedHostIds?: string[]) => void;
  onAddHostQuick: () => void;
  onRemoveHosts: (ids: string[]) => void;
  onToggleFavorite: (hostId: string) => void;
  query?: string;
  filter?: HostListFilter;
  onQueryChange?: (query: string) => void;
  onFilterChange?: (filter: HostListFilter) => void;
  onRunReadonlyCheck?: (hosts: Host[], checkId: ReadonlyCheckId) => void;
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
  onReorderHost,
  onAddHostQuick,
  onRemoveHosts,
  onToggleFavorite,
  query: controlledQuery,
  filter: controlledFilter,
  onQueryChange,
  onFilterChange,
  onRunReadonlyCheck,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragOverGroup, setDragOverGroup] = useState<GroupId | null>(null);
  const [dragOverHostId, setDragOverHostId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"above" | "below" | null>(null);
  const [internalQuery, setInternalQuery] = useState("");
  const [internalFilter, setInternalFilter] = useState<HostListFilter>("all");
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
  const query = controlledQuery ?? internalQuery;
  const filter = controlledFilter ?? internalFilter;

  const updateQuery = (nextQuery: string) => {
    if (controlledQuery === undefined) setInternalQuery(nextQuery);
    onQueryChange?.(nextQuery);
  };

  const updateFilter = (nextFilter: HostListFilter) => {
    if (controlledFilter === undefined) setInternalFilter(nextFilter);
    onFilterChange?.(nextFilter);
  };

  const filtered = useMemo(() => {
    return sortHostsForSidebar(filterHostsForInventory(hosts, { query, filter }), filter);
  }, [filter, hosts, query]);
  const canManualReorder = filter !== "recent";

  const filteredIds = useMemo(() => new Set(filtered.map((h) => h.id)), [filtered]);
  const knownHostIds = useMemo(() => new Set(hosts.map((h) => h.id)), [hosts]);
  const selectedHosts = useMemo(
    () => filtered.filter((host) => selectedIds.has(host.id)),
    [filtered, selectedIds]
  );

  const grouped = useMemo(() => {
    return groupHostsForDisplay(filtered, groups, t("groups.unassigned", lang))
      .map((bucket) => ({
        ...bucket.group,
        hosts: bucket.hosts,
      }));
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
      title: t("host.action.confirmRemoveMany", lang, { count: selectedIds.size }),
      message: t("host.action.removeMessage", lang),
      confirmLabel: t("host.action.remove", lang),
      cancelLabel: t("common.cancel", lang),
      danger: true,
    }).then((ok) => {
      if (ok) {
        onRemoveHosts([...selectedIds]);
        exitBatchMode();
      }
    });
  };

  const handleBatchCheck = (checkId: ReadonlyCheckId) => {
    if (selectedHosts.length === 0) return;
    onRunReadonlyCheck?.(selectedHosts, checkId);
    exitBatchMode();
  };

  const clearDragState = () => {
    setDragOverGroup(null);
    setDragOverHostId(null);
    setDropPosition(null);
  };

  const moveDraggedHostToGroup = (hostId: string, groupId: GroupId, orderedHostIds?: string[]) => {
    if (knownHostIds.has(hostId) && orderedHostIds?.length) {
      onReorderHost(hostId, orderedHostIds.indexOf(hostId), groupId, orderedHostIds);
    } else {
      onMoveHostToGroup(hostId, groupId);
    }
    setCollapsed((current) => ({ ...current, [groupId]: false }));
    clearDragState();
  };

  const handleGroupDragOver = (event: DragEvent<HTMLElement>, groupId: GroupId) => {
    if (batchMode || !canAcceptHostDragOver(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverGroup(groupId);
    setDragOverHostId(null);
    setDropPosition(null);
  };

  const handleGroupDragLeave = (event: DragEvent<HTMLElement>, groupId: GroupId) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverGroup((id) => (id === groupId ? null : id));
  };

  const handleGroupDrop = (event: DragEvent<HTMLElement>, group: Group & { hosts: Host[] }) => {
    event.preventDefault();
    event.stopPropagation();
    const hostId = readHostDragId(event.dataTransfer);
    if (!hostId) {
      clearDragState();
      return;
    }
    moveDraggedHostToGroup(hostId, group.id, orderedIdsForGroupDrop(group.hosts, hostId));
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-title">
          <span className="eyebrow">{t("sidebar.eyebrow", lang)}</span>
          <span className="sidebar-title__actions">
            <span className="count">{filtered.length}</span>
          </span>
        </div>
        <div className="search">
          {Icon.search}
          <input placeholder={t("sidebar.search", lang)} value={query} onChange={(event) => updateQuery(event.target.value)} />
          <kbd>Ctrl + K</kbd>
        </div>
        <div className="sidebar-filters">
          {[
            ["all", t("sidebar.filter.all", lang)],
            ["favorite", t("sidebar.filter.pinned", lang)],
            ["recent", t("sidebar.filter.recent", lang)],
            ["local", t("sidebar.filter.local", lang)],
            ["cloud", t("sidebar.filter.cloud", lang)],
          ].map(([id, label]) => (
            <button key={id} className={"chip " + (filter === id ? "active" : "")} onClick={() => updateFilter(id as HostListFilter)}>
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
              title={t("sidebar.batch.title", lang)}
            >
              <svg viewBox="0 0 14 14" width="10" height="10" fill="none">
                <rect x="1.5" y="2" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 7l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{t("sidebar.batch.label", lang)}</span>
            </button>
          ) : (
            <div className="batch-actions">
              <button className="chip" onClick={selectAllFiltered}>
                {t("sidebar.batch.selectAll", lang)}
              </button>
              <button className="chip" onClick={deselectAll}>
                {t("sidebar.batch.deselect", lang)}
              </button>
              <button
                className="chip"
                disabled={selectedIds.size === 0}
                onClick={() => handleBatchCheck("reachability")}
              >
                {t("ops.check.reachability", lang)}
              </button>
              <button
                className="chip"
                disabled={selectedIds.size === 0}
                onClick={() => handleBatchCheck("identity")}
              >
                {t("ops.check.identity", lang)}
              </button>
              <button
                className="chip"
                disabled={selectedIds.size === 0}
                onClick={() => handleBatchCheck("health")}
              >
                {t("ops.check.health", lang)}
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
                {t("sidebar.batch.done", lang)}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-body">
        {grouped.map((group) => {
          const isCollapsed = !!collapsed[group.id];
          const label = displayGroupName(group, lang);
          return (
            <div
              key={group.id}
              className={
                "host-group " +
                (isCollapsed ? "collapsed" : "") +
                (group.hosts.length === 0 ? " host-group--empty" : "") +
                (dragOverGroup === group.id ? " drop-target" : "")
              }
              style={{ "--site-color": group.color } as CSSProperties}
              onDragEnter={(event) => handleGroupDragOver(event, group.id)}
              onDragOver={(event) => handleGroupDragOver(event, group.id)}
              onDragLeave={(event) => handleGroupDragLeave(event, group.id)}
              onDrop={(event) => handleGroupDrop(event, group)}
            >
              <div
                className={"host-group-head " + (dragOverGroup === group.id ? "drop-target" : "")}
                onClick={() => setCollapsed({ ...collapsed, [group.id]: !isCollapsed })}
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
                {group.hosts.length === 0 && (
                  <div className="host-empty-drop">
                    {t("site.emptyDrop", lang)}
                  </div>
                )}
                {group.hosts.map((host, hostIndex) => {
                  const assetKey = assetBucketKey(host);
                  const previousAssetKey = hostIndex > 0 ? assetBucketKey(group.hosts[hostIndex - 1]) : "";
                  const showAssetHeader = hostIndex === 0 || assetKey !== previousAssetKey;
                  const live = reachability[host.id];
                  const effStatus = live?.status ?? host.status;
                  const effLatency = live?.latency ?? host.latency;
                  const scope = deployScope(host);
                  const isSelected = selectedIds.has(host.id);
                  const favorite = isFavoriteHost(host);
                  const isDragOver = dragOverHostId === host.id;
                  const dndAbove = isDragOver && dropPosition === "above";
                  const dndBelow = isDragOver && dropPosition === "below";
                  const canMoveUp = canManualReorder && hostIndex > 0;
                  const canMoveDown = canManualReorder && hostIndex < group.hosts.length - 1;
                  const moveHost = (delta: -1 | 1) => {
                    const orderedHostIds = orderedIdsForMove(group.hosts, hostIndex, delta);
                    onReorderHost(host.id, orderedHostIds.indexOf(host.id), group.id, orderedHostIds);
                  };
                  return (
                  <Fragment key={host.id}>
                  {showAssetHeader && (
                    <div className="asset-tree-head">
                      <span>{assetBucketLabel(assetKey, lang)}</span>
                      <small>{group.hosts.filter((item) => assetBucketKey(item) === assetKey).length}</small>
                    </div>
                  )}
                  <div
                    draggable={!batchMode}
                    onDragStart={(event) => {
                      if (batchMode) return;
                      writeHostDragData(event.dataTransfer, host.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={clearDragState}
                    onDragOver={(event) => {
                      if (batchMode || !canAcceptHostDragOver(event.dataTransfer)) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "move";
                      if (!canManualReorder) {
                        setDragOverGroup(group.id);
                        setDragOverHostId(null);
                        setDropPosition(null);
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      const y = event.clientY - rect.top;
                      const mid = rect.height / 2;
                      setDragOverHostId(host.id);
                      setDropPosition(y < mid ? "above" : "below");
                    }}
                    onDragLeave={() => {
                      setDragOverHostId(null);
                      setDropPosition(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const dragHostId = readHostDragId(event.dataTransfer);
                      if (!dragHostId || dragHostId === host.id) {
                        clearDragState();
                        return;
                      }
                      if (!canManualReorder) {
                        moveDraggedHostToGroup(dragHostId, group.id);
                        return;
                      }
                      const pos = dropPosition;
                      if (!pos) {
                        clearDragState();
                        return;
                      }
                      const orderedHostIds = orderedIdsForDrop(group.hosts, dragHostId, host.id, pos);
                      moveDraggedHostToGroup(dragHostId, group.id, orderedHostIds);
                    }}
                    title={`${host.alias} - ${host.user}@${host.hostname}${host.port !== 22 ? `:${host.port}` : ""} - ${statusTooltip(effLatency, effStatus, lang)} - ${recentTooltip(host.lastConnectedAt, lang)}`}
                    className={
                      "host-row" +
                      (host.id === activeHostId ? " active" : "") +
                      (effStatus === "ok" ? " connected" : "") +
                      (isSelected ? " selected" : "") +
                      (dndAbove ? " drag-over-above" : "") +
                      (dndBelow ? " drag-over-below" : "")
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
                      <span className="host-reorder-actions">
                        <button
                          type="button"
                          className="host-order-btn host-order-btn--up"
                          title={t("host.action.moveUp", lang)}
                          aria-label={t("host.action.moveUp", lang)}
                          disabled={!canMoveUp}
                          onClick={(event) => {
                            event.stopPropagation();
                            moveHost(-1);
                          }}
                        >
                          {Icon.chevron}
                        </button>
                        <button
                          type="button"
                          className="host-order-btn host-order-btn--down"
                          title={t("host.action.moveDown", lang)}
                          aria-label={t("host.action.moveDown", lang)}
                          disabled={!canMoveDown}
                          onClick={(event) => {
                            event.stopPropagation();
                            moveHost(1);
                          }}
                        >
                          {Icon.chevron}
                        </button>
                      </span>
                      <button
                        type="button"
                        className={"host-favorite" + (favorite ? " active" : "")}
                        title={favorite
                          ? t("host.action.favoriteRemove", lang)
                          : t("host.action.favoriteAdd", lang)}
                        aria-label={favorite
                          ? t("host.action.favoriteRemove", lang)
                          : t("host.action.favoriteAdd", lang)}
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
                  </Fragment>
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
  const resolvedLang = lang || "en";
  if (status === "off" || latency == null) {
    return t("sidebar.status.unchecked", resolvedLang);
  }
  if (latency < 20) {
    return t("sidebar.status.healthy", resolvedLang, { latency });
  }
  if (latency < 60) {
    return t("sidebar.status.attention", resolvedLang, { latency });
  }
  return t("sidebar.status.critical", resolvedLang, { latency });
}

function latencyClass(latency?: number | null, status?: Host["status"]) {
  if (status === "off" || latency == null) return "off";
  if (latency < 20) return "ok";
  if (latency < 60) return "warn";
  return "bad";
}

function formatRecent(timestamp: number, lang: Lang) {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) {
    return t("host.lastseen.minutes", lang, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t("host.lastseen.hours", lang, { n: hours });
  }
  const days = Math.floor(hours / 24);
  return t("host.lastseen.days", lang, { n: days });
}

function recentTooltip(timestamp: number | undefined, lang: Lang) {
  if (!timestamp) return t("host.lastseen.never", lang);
  return t("sidebar.status.recent", lang, { time: formatRecent(timestamp, lang) });
}

function orderedIdsForMove(hosts: Host[], fromIndex: number, delta: -1 | 1) {
  const ids = hosts.map((host) => host.id);
  const toIndex = Math.max(0, Math.min(ids.length - 1, fromIndex + delta));
  if (toIndex === fromIndex) return ids;
  const [id] = ids.splice(fromIndex, 1);
  ids.splice(toIndex, 0, id);
  return ids;
}

function orderedIdsForDrop(hosts: Host[], dragHostId: string, targetHostId: string, pos: "above" | "below") {
  const ids = hosts.map((host) => host.id).filter((id) => id !== dragHostId);
  const targetIndex = ids.indexOf(targetHostId);
  const insertAt = targetIndex < 0
    ? ids.length
    : targetIndex + (pos === "below" ? 1 : 0);
  ids.splice(insertAt, 0, dragHostId);
  return ids;
}

function orderedIdsForGroupDrop(hosts: Host[], dragHostId: string) {
  return [...hosts.map((host) => host.id).filter((id) => id !== dragHostId), dragHostId];
}

function writeHostDragData(dataTransfer: DataTransfer, hostId: string) {
  HOST_DRAG_READ_TYPES.forEach((type) => {
    try {
      dataTransfer.setData(type, hostId);
    } catch {
      // Some browser shells reject custom drag MIME types; text/plain is enough for fallback.
    }
  });
}

function canAcceptHostDragOver(dataTransfer: DataTransfer) {
  const types = transferTypes(dataTransfer);
  if (types.includes("files")) return false;
  if (types.length === 0) return true;
  return HOST_DRAG_READ_TYPES.some((type) => types.includes(type.toLowerCase()));
}

function readHostDragId(dataTransfer: DataTransfer) {
  for (const type of HOST_DRAG_READ_TYPES) {
    try {
      const value = dataTransfer.getData(type).trim();
      if (value) return value;
    } catch {
      // Keep trying the next representation.
    }
  }
  return "";
}

function transferTypes(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types || []).map((type) => type.toLowerCase());
}

function assetBucketKey(host: Host) {
  if ((host.connectionType || "ssh") === "serial") return "serial";
  const explicit = [host.assetType, host.iconOverride].filter(Boolean).join(" ").toLowerCase();
  const text = [explicit, host.alias, host.hostname, host.role, ...(host.tags || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/router|gateway|\bgw\b|openwrt|istore|lede|immortalwrt/.test(text)) return "router";
  if (/switch|h3c|huawei|cisco|catalyst|nexus|s\d{4,}/.test(text)) return "switch";
  if (/firewall|fw|asa|usg/.test(text)) return "firewall";
  if (/nas|synology|qnap|truenas|storage/.test(text)) return "nas";
  if (/windows|win11|win10|macos|macbook|desktop|laptop|pc/.test(text)) return "pc";
  if (deployScope(host) === "cloud") return "cloud-server";
  if (/linux|ubuntu|debian|centos|rocky|alma|server|pve|proxmox/.test(text)) return "linux-server";
  return "ssh";
}

function assetBucketLabel(key: string, lang: Lang) {
  const keyByBucket: Record<string, string> = {
    router: "sidebar.asset.router",
    switch: "sidebar.asset.switch",
    firewall: "sidebar.asset.firewall",
    nas: "sidebar.asset.nas",
    pc: "sidebar.asset.pc",
    "cloud-server": "sidebar.asset.cloudServer",
    "linux-server": "sidebar.asset.linuxServer",
    serial: "sidebar.asset.serial",
    ssh: "sidebar.asset.ssh",
  };
  return t(keyByBucket[key] || "sidebar.asset.ssh", lang);
}
