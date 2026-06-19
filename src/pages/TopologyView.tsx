import type { Group, Host, Lang } from "../config/types";
import { brandIcon } from "../components/BrandIcons";
import { t } from "../utils/i18n";
import { displayGroupName, groupHostsForDisplay } from "../utils/groups";

type TopologyKind = "router" | "switch" | "server" | "pc";

interface TopologyNode {
  host: Host;
  kind: TopologyKind;
}

interface TopologyViewProps {
  lang: Lang;
  hosts: Host[];
  groups: Group[];
  onPickHost: (host: Host) => void;
  onOpenHost: (host: Host) => void;
  showRouters: boolean;
  showSwitches: boolean;
  showDevices: boolean;
}

export function TopologyView({
  lang,
  hosts,
  groups,
  onPickHost,
  onOpenHost,
  showRouters,
  showSwitches,
  showDevices,
}: TopologyViewProps) {
  const grouped = groupHostsForDisplay(hosts, groups, t("groups.unassigned", lang))
    .map(({ group, hosts: groupHosts }) => ({
      group,
      total: groupHosts.length,
      nodes: groupHosts
        .map((host) => ({ host, kind: inferKind(host) }))
        .filter((node) => {
          if (node.kind === "router") return showRouters;
          if (node.kind === "switch") return showSwitches;
          return showDevices;
        }),
    }))
    .filter((item) => item.nodes.length > 0);

  return (
    <section className="topology-panel">
      <div className="topology-panel__head">
        <span className="eyebrow">{t("topology.title", lang)}</span>
        <span>{t("topology.inferred", lang)}</span>
      </div>
      {hosts.length === 0 ? (
        <div className="topology-empty">
          <strong>{t("topology.empty.title", lang)}</strong>
          <span>{t("topology.empty.desc", lang)}</span>
        </div>
      ) : (
        <div className="topology-sites">
          {grouped.map(({ group, total, nodes }) => {
            const routers = nodes.filter((node) => node.kind === "router");
            const switches = nodes.filter((node) => node.kind === "switch");
            const leaves = nodes.filter((node) => node.kind !== "router" && node.kind !== "switch");
            return (
              <article key={group.id} className="topology-site">
                <div className="topology-site__title">
                  <span className="topology-site__dot" style={{ background: group.color }} />
                  <span>{displayGroupName(group, lang)}</span>
                  {group.subnet && <span className="topology-site__subnet">{group.subnet}</span>}
                  <small>{total}</small>
                </div>
                <TopologyLayer label={t("topology.layer.routers", lang)} nodes={routers} onPickHost={onPickHost} onOpenHost={onOpenHost} />
                <TopologyLayer label={t("topology.layer.switches", lang)} nodes={switches} onPickHost={onPickHost} onOpenHost={onOpenHost} />
                <TopologyLayer label={t("topology.layer.devices", lang)} nodes={leaves} onPickHost={onPickHost} onOpenHost={onOpenHost} />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TopologyLayer({
  label,
  nodes,
  onPickHost,
  onOpenHost,
}: {
  label: string;
  nodes: TopologyNode[];
  onPickHost: (host: Host) => void;
  onOpenHost: (host: Host) => void;
}) {
  if (nodes.length === 0) return null;
  return (
    <div className="topology-layer">
      <span className="topology-layer__label">{label}</span>
      <div className="topology-nodes">
        {nodes.map(({ host, kind }) => (
          <button
            key={host.id}
            className={"topology-node topology-node--" + kind}
            onClick={() => onPickHost(host)}
            onDoubleClick={() => onOpenHost(host)}
            title={`${host.alias} - ${host.user}@${host.hostname}`}
          >
            <span className="topology-node__icon" style={{ color: host.hue || "var(--accent)" }}>{brandIcon(host)}</span>
            <span className="topology-node__label">{host.alias}</span>
            <span className={"latency " + statusClass(host)} />
          </button>
        ))}
      </div>
    </div>
  );
}

function inferKind(host: Host): TopologyKind {
  const text = [host.alias, host.hostname, host.role, host.env, (host.tags || []).join(" ")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/router|gateway|gw|openwrt|istore|lede|immortalwrt|friendlywrt|r[0-9]/.test(text)) return "router";
  if (/switch|sw|h3c|cisco|huawei|s[0-9]{3,}/.test(text)) return "switch";
  if (/pc|win|windows|macbook|desktop|laptop|ubuntu/.test(text)) return "pc";
  return "server";
}

function statusClass(host: Host) {
  if (host.status === "off" || host.latency == null) return "off";
  if (host.latency < 20) return "ok";
  if (host.latency < 60) return "warn";
  return "bad";
}
