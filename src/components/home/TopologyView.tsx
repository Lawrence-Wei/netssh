import type { Group, Host, Lang } from "../../types";
import { brandIcon } from "../shared/BrandIcons";

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
}

export function TopologyView({ lang, hosts, groups, onPickHost, onOpenHost }: TopologyViewProps) {
  const knownGroups = new Set(groups.map((group) => group.id));
  const grouped = groups
    .map((group) => ({
      group,
      nodes: hosts
        .filter((host) => host.group === group.id)
        .map((host) => ({ host, kind: inferKind(host) })),
    }))
    .filter((item) => item.nodes.length > 0);
  const orphans = hosts.filter((host) => !knownGroups.has(host.group));
  if (orphans.length) {
    grouped.push({
      group: {
        id: "unassigned",
        name: lang === "zh" ? "未分配" : "Unassigned",
        color: "#897e6e",
      },
      nodes: orphans.map((host) => ({ host, kind: inferKind(host) })),
    });
  }

  if (hosts.length === 0) return null;

  return (
    <section className="topology-panel">
      <div className="topology-panel__head">
        <span className="eyebrow">{lang === "zh" ? "网络拓扑" : "Network topology"}</span>
        <span>{lang === "zh" ? "按站点自动推断" : "Inferred by site"}</span>
      </div>
      <div className="topology-sites">
        {grouped.map(({ group, nodes }) => {
          const routers = nodes.filter((node) => node.kind === "router");
          const switches = nodes.filter((node) => node.kind === "switch");
          const leaves = nodes.filter((node) => node.kind !== "router" && node.kind !== "switch");
          return (
            <article key={group.id} className="topology-site">
              <div className="topology-site__title">
                <span className="topology-site__dot" style={{ background: group.color }} />
                <span>{group.name}</span>
                {group.subnet && <span className="topology-site__subnet">{group.subnet}</span>}
                <small>{nodes.length}</small>
              </div>
              <TopologyLayer label={lang === "zh" ? "路由器" : "Routers"} nodes={routers} onPickHost={onPickHost} onOpenHost={onOpenHost} />
              <TopologyLayer label={lang === "zh" ? "交换机" : "Switches"} nodes={switches} onPickHost={onPickHost} onOpenHost={onOpenHost} />
              <TopologyLayer label={lang === "zh" ? "设备 / 服务器" : "Devices / servers"} nodes={leaves} onPickHost={onPickHost} onOpenHost={onOpenHost} />
            </article>
          );
        })}
      </div>
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
  if (/switch|sw|交换机|h3c|cisco|huawei|s[0-9]{3,}/.test(text)) return "switch";
  if (/pc|win|windows|macbook|desktop|laptop|ubuntu/.test(text)) return "pc";
  return "server";
}

function statusClass(host: Host) {
  if (host.status === "off" || host.latency == null) return "off";
  if (host.latency < 20) return "ok";
  if (host.latency < 60) return "warn";
  return "bad";
}
