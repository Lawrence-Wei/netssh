import { useState } from "react";
import { t } from "../utils/i18n";
import type { QuickCommand } from "../config/defaults";
import type { Group, Host, Lang, Snippet } from "../config/types";
import { Icon } from "../components/Icons";
import { useConfirm } from "../components/ConfirmDialog";
import { useCredentials } from "../store/credentials";
import { TopologyView } from "./TopologyView";
import { brandIcon } from "../components/BrandIcons";
import { deployScope, deployScopeLabel } from "../utils/deployScope";
import { HostEditorFull } from "../components/HostForm";

interface HostDetailProps {
  lang: Lang;
  host?: Host | null;
  onConnect: () => void;
  snippets: Snippet[];
  quickCmds: QuickCommand[];
  hosts: Host[];
  onRunSnippet: (snippet: Snippet | QuickCommand) => void;
  groups: Group[];
  editing: boolean;
  startEditing: () => void;
  cancelEditing: () => void;
  onUpdateHost: (id: string, patch: Partial<Host>) => void;
  onRemoveHost: (id: string) => void;
  onAddHost: (host: Omit<Host, "id"> & { id?: string }) => Host;
  onManualConnect: (host: Host) => void;
  onAddGroup: (name: string, subnet?: string) => Group;
  onOpenImport: () => void;
  onPickHost: (host: Host) => void;
  onOpenHost: (host: Host) => void;
  onOpenQuad: () => void;
  canOpenQuad: boolean;
}

export function HostDetail({
  lang,
  host,
  onConnect,
  snippets,
  quickCmds,
  hosts,
  onRunSnippet,
  groups,
  editing,
  startEditing,
  cancelEditing,
  onUpdateHost,
  onRemoveHost,
  onAddHost,
  onManualConnect,
  onAddGroup,
  onOpenImport,
  onPickHost,
  onOpenHost,
  onOpenQuad,
  canOpenQuad,
}: HostDetailProps) {
  const confirm = useConfirm();

  // When host is null and we're not editing, show landing/home page
  if (!host) {
    return (
      <Landing
        lang={lang}
        groups={groups}
        hosts={hosts}
        onManualConnect={onManualConnect}
        onAddHost={onAddHost}
        onAddGroup={onAddGroup}
        onOpenImport={onOpenImport}
        onPickHost={onPickHost}
        onOpenHost={onOpenHost}
        onOpenQuad={onOpenQuad}
        canOpenQuad={canOpenQuad}
      />
    );
  }

  // If editing, show the full editor form instead of the detail view
  if (editing) {
    return (
      <HostEditorFull
        lang={lang}
        host={host}
        groups={groups}
        onSave={(patch) => {
          onUpdateHost(host.id, patch);
          cancelEditing();
        }}
        onCancel={cancelEditing}
        onRemove={() => {
          void confirm({
            title: t("host.action.confirmRemove", lang, { alias: host.alias }),
            message: lang === "zh"
              ? "Only Netssh local metadata is removed; ~/.ssh/config is not changed."
              : "Only Netssh local data is removed. Your ~/.ssh/config stays untouched.",
            confirmLabel: t("host.action.remove", lang),
            cancelLabel: t("common.cancel", lang),
            danger: true,
          }).then((ok) => {
            if (ok) {
              onRemoveHost(host.id);
              cancelEditing();
            }
          });
        }}
        onAddGroup={onAddGroup}
      />
    );
  }

  // Normal detail view
  const site = groups.find((g) => g.id === host.group);

  return (
    <div className="landing">
      <ManualConnectCard lang={lang} onManualConnect={onManualConnect} compact />

      {/* Host identity header */}
      <div className="host-detail-header">
        <div className="host-detail-header__icon" style={{ color: host.hue || "var(--accent)" }}>
          {brandIcon(host)}
        </div>
        <div className="host-detail-header__main">
          <h1 className="host-detail-header__alias">{host.alias}</h1>
          <div className="host-detail-header__target">
            <span className="host-detail-header__userhost">{host.user}@{host.hostname}</span>
            <span className="host-detail-header__port">:{host.port}</span>
          </div>
          <div className="host-detail-header__meta">
            {site && (
              <span className="host-detail-header__site">
                <span className="moon" style={{ background: site.color, boxShadow: `0 0 6px ${site.color}` }} />
                {site.name}
                {site.subnet && <span className="host-detail-header__subnet">{site.subnet}</span>}
              </span>
            )}
            <span className={"latency " + statusClass(host)} />
            <span className="host-detail-header__status">
              {host.status === "ok" ? (lang === "zh" ? "Online" : "Online") : host.status === "warn" ? (lang === "zh" ? "Warn" : "Warn") : (lang === "zh" ? "Offline" : "Offline")}
            </span>
          </div>
        </div>
        <div className="host-detail-header__actions">
          <button className="btn" onClick={onConnect}>
            {Icon.power}
            <span>{t("landing.connect", lang)}</span>
          </button>
          <button className="btn ghost" onClick={startEditing}>
            {Icon.edit}
            <span>{t("host.action.edit", lang)}</span>
          </button>
        </div>
      </div>

      {/* Info sections grid */}
      <div className="host-detail-grid">
        {/* Basic info */}
        <div className="panel">
          <div className="panel-head">
            <h3><span className="eyebrow">{lang === "zh" ? "Basic info" : "Basic info"}</span></h3>
          </div>
          <div className="panel-body dense">
            <div className="kvlist">
              <span className="k">{t("host.field.alias", lang)}</span>
              <span className="v">{host.alias}</span>
              <span className="k">{t("host.field.role", lang)}</span>
              <span className="v">{host.role || "—"}</span>
              <span className="k">{t("host.field.env", lang)}</span>
              <span className="v">{host.env || "—"}</span>
              <span className="k">{lang === "zh" ? "Deploy" : "Deploy"}</span>
              <span className="v">{deployScopeLabel(deployScope(host), lang)}</span>
              {host.cloudProvider && (
                <>
                  <span className="k">{lang === "zh" ? "Cloud" : "Cloud"}</span>
                  <span className="v">{host.cloudProvider}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* SSH connection info */}
        <div className="panel">
          <div className="panel-head">
            <h3><span className="eyebrow">SSH</span></h3>
          </div>
          <div className="panel-body dense">
            <div className="kvlist">
              <span className="k">{t("host.field.hostname", lang)}</span>
              <span className="v">{host.hostname}</span>
              <span className="k">{t("host.field.user", lang)}</span>
              <span className="v">{host.user}</span>
              <span className="k">{t("host.field.port", lang)}</span>
              <span className="v">{host.port}</span>
              <span className="k">{t("host.eyebrow.key", lang)}</span>
              <span className="v" style={{ fontSize: 11 }}>{identityName(host.identityFile)}</span>
              <span className="k">{lang === "zh" ? "Command" : "Command"}</span>
              <span className="v" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>ssh {host.alias}</span>
            </div>
          </div>
        </div>

        {/* Site / Group */}
        <div className="panel">
          <div className="panel-head">
            <h3><span className="eyebrow">{lang === "zh" ? "Site / group" : "Site / group"}</span></h3>
          </div>
          <div className="panel-body dense">
            <div className="kvlist">
              <span className="k">{t("host.field.group", lang)}</span>
              <span className="v">{site ? site.name : host.group}</span>
              {site?.subnet && (
                <>
                  <span className="k">{lang === "zh" ? "Subnet" : "Subnet"}</span>
                  <span className="v" style={{ fontFamily: "var(--font-mono)" }}>{site.subnet}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="panel">
          <div className="panel-head">
            <h3><span className="eyebrow">{t("host.eyebrow.notes", lang)}</span></h3>
          </div>
          <div className="panel-body dense">
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>
              {host.notes || (lang === "zh" ? "No notes" : "No notes")}
            </p>
          </div>
        </div>
      </div>

      {/* Tags row */}
      <div className="tag-row" style={{ marginTop: 4 }}>
        {host.env && <span className={"tag env-" + host.env}>{host.env}</span>}
        <span className={"tag deploy-chip deploy-chip--" + deployScope(host)}>{deployScopeLabel(deployScope(host), lang)}</span>
        {host.cloudProvider && <span className="tag deploy-chip deploy-chip--provider">{host.cloudProvider}</span>}
        {host.role && <span className="tag role">{host.role}</span>}
        {(host.tags || []).map((tag) => (
          <span key={tag} className="tag">{tag}</span>
        ))}
      </div>

      {/* Quick commands + Snippets */}
      <div className="landing-grid">
        <div className="panel">
          <div className="panel-head">
            <h3><span className="eyebrow">{t("host.eyebrow.quickcmd", lang)}</span></h3>
            <span className="eyebrow" style={{ color: "var(--text-mute)" }}>
              {quickCmds.length} / {snippets.length}
            </span>
          </div>
          <div className="panel-body">
            {quickCmds.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-mute)", fontSize: 12 }}>
                {t("host.quickcmd.empty", lang)}
              </div>
            )}
            {quickCmds.map((cmd) => (
              <CommandRow key={cmd.name} name={cmd.name} cmd={cmd.cmd} lang={lang} onRun={() => onRunSnippet(cmd)} />
            ))}
            <div style={{ height: 6 }} />
            <div className="panel-head" style={{ borderBottom: 0, borderTop: "1px solid var(--glass-stroke)", paddingTop: 12 }}>
              <h3><span className="eyebrow">{t("host.eyebrow.snippets", lang)}</span></h3>
            </div>
            {snippets.slice(0, 4).map((snippet) => (
              <CommandRow key={snippet.id} name={snippet.name} cmd={snippet.cmd} lang={lang} onRun={() => onRunSnippet(snippet)} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-head">
              <h3><span className="eyebrow">{t("host.eyebrow.lastseen", lang)}</span></h3>
            </div>
            <div className="panel-body dense">
              <span style={{ color: "var(--text-dim)", fontSize: 13 }}>
                {formatLastConnected(host.lastConnectedAt, lang)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   Landing / Home page
   ================================================================ */
function Landing({
  lang,
  groups,
  hosts,
  onManualConnect,
  onAddHost,
  onAddGroup,
  onOpenImport,
  onPickHost,
  onOpenHost,
  onOpenQuad,
  canOpenQuad,
}: {
  lang: Lang;
  groups: Group[];
  hosts: Host[];
  onManualConnect: (host: Host) => void;
  onAddHost: (host: Omit<Host, "id"> & { id?: string }) => Host;
  onAddGroup: (name: string, subnet?: string) => Group;
  onOpenImport: () => void;
  onPickHost: (host: Host) => void;
  onOpenHost: (host: Host) => void;
  onOpenQuad: () => void;
  canOpenQuad: boolean;
}) {
  return (
    <div className="landing landing--center">
      <div className="landing-intro">
        <span className="eyebrow">{t("landing.eyebrow", lang)}</span>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 300, fontSize: 38, lineHeight: 1.1, margin: "12px 0 10px" }}>
          {t("landing.heading.start", lang)}{" "}
          <span style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))", WebkitBackgroundClip: "text", color: "transparent", fontWeight: 500 }}>
            {t("landing.heading.accent", lang)}
          </span>
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.6, maxWidth: 520 }}>
          {t("landing.sub", lang)}
        </p>
      </div>

      <div className="home-toolbar">
        <button className="btn" onClick={onOpenImport}>
          {Icon.import}
          <span>{t("import.title", lang)}</span>
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            const created = onAddHost({
              alias: "new-host",
              hostname: "example.com",
              user: "root",
              port: 22,
              group: groups[0]?.id || "unassigned",
            });
            onPickHost(created);
          }}
        >
          {Icon.plus}
          <span>{t("host.action.add", lang)}</span>
        </button>
        <SiteQuickAdd lang={lang} onAddGroup={onAddGroup} />
        <button
          className="btn ghost"
          onClick={onOpenQuad}
          disabled={!canOpenQuad}
          title={lang === "zh" ? "Available when 2-4 sessions are open" : "Available when 2-4 sessions are open"}
        >
          {Icon.split}
          <span>{lang === "zh" ? "Quad view" : "Quad view"}</span>
        </button>
      </div>

      <TopologyView
        lang={lang}
        hosts={hosts}
        groups={groups}
        onPickHost={onPickHost}
        onOpenHost={onOpenHost}
      />

      <ManualConnectCard lang={lang} onManualConnect={onManualConnect} />
    </div>
  );
}

function SiteQuickAdd({ lang, onAddGroup }: { lang: Lang; onAddGroup: (name: string, subnet?: string) => Group }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [subnet, setSubnet] = useState("");
  if (!open) {
    return (
      <button className="btn ghost" onClick={() => setOpen(true)}>
        {Icon.plus}
        <span>{t("site.action.add", lang)}</span>
      </button>
    );
  }
  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onAddGroup(name.trim(), subnet.trim() || undefined);
        setOpen(false);
        setName("");
        setSubnet("");
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("site.field.name", lang)} autoFocus />
      <input value={subnet} onChange={(e) => setSubnet(e.target.value)} placeholder={t("site.field.subnet", lang)} />
      <button className="btn" type="submit">{t("common.save", lang)}</button>
      <button className="btn ghost" type="button" onClick={() => setOpen(false)}>{t("common.cancel", lang)}</button>
    </form>
  );
}

function ManualConnectCard({
  lang,
  onManualConnect,
  compact = false,
}: {
  lang: Lang;
  onManualConnect: (host: Host) => void;
  compact?: boolean;
}) {
  const [alias, setAlias] = useState("");
  const [host, setHost] = useState("");
  const [user, setUser] = useState("");
  const [port, setPort] = useState("22");
  const [password, setPassword] = useState("");
  const [identityFile, setIdentityFile] = useState<string | undefined>(undefined);
  const { credentials } = useCredentials();

  const applyCredential = (id: string) => {
    if (!id) return;
    const cred = credentials.find((c) => c.id === id);
    if (!cred) return;
    setUser(cred.user);
    if (cred.hasPassword) setPassword("");
    if (cred.identityFile) setIdentityFile(cred.identityFile);
  };

  return (
    <form
      className={"manual-card" + (compact ? " manual-card--compact" : "")}
      onSubmit={(event) => {
        event.preventDefault();
        if (!host.trim() || !user.trim()) return;
        const ephemeral: Host = {
          id: `manual-${Date.now()}`,
          alias: alias.trim() || host.trim(),
          hostname: host.trim(),
          user: user.trim(),
          port: normalizePort(port),
          group: "unassigned",
          status: "ok",
          deployScope: "unknown",
          hue: "#7c3aed",
          identityFile,
          ephemeralPassword: password || undefined,
        };
        onManualConnect(ephemeral);
        setPassword("");
      }}
    >
      <div className="manual-card__head">
        <span className="eyebrow">{t("manual.eyebrow", lang)}</span>
        <span className="manual-card__hint">{t("manual.hint", lang)}</span>
      </div>
      {credentials.length > 0 && (
        <label className="manual-card__cred">
          <span className="k">{t("manual.field.credential", lang)}</span>
          <select
            defaultValue=""
            onChange={(e) => {
              applyCredential(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">{t("manual.field.credential.pick", lang)}</option>
            {credentials.map((cred) => (
              <option key={cred.id} value={cred.id}>
                {cred.group} - {cred.name} ({cred.user})
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="manual-card__grid">
        <label>
          <span className="k">{t("manual.field.host", lang)}</span>
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="example.com / 10.0.0.1" autoComplete="off" />
        </label>
        <label>
          <span className="k">{t("manual.field.port", lang)}</span>
          <input value={port} inputMode="numeric" onChange={(e) => setPort(e.target.value.replace(/[^\d]/g, ""))} placeholder="22" />
        </label>
        <label>
          <span className="k">{t("manual.field.user", lang)}</span>
          <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="root" autoComplete="off" />
        </label>
        <label>
          <span className="k">{t("manual.field.password", lang)}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        </label>
        <label className="manual-card__alias">
          <span className="k">{t("manual.field.alias", lang)}</span>
          <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder={t("manual.field.alias.placeholder", lang)} autoComplete="off" />
        </label>
      </div>
      <div className="manual-card__foot">
        <button className="btn" type="submit">
          {Icon.power}
          <span>{t("manual.action.connect", lang)}</span>
        </button>
      </div>
    </form>
  );
}

/* ================================================================
   Helpers
   ================================================================ */
function normalizePort(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 22;
  return Math.min(65535, Math.max(1, Math.trunc(parsed)));
}

function CommandRow({ name, cmd, lang, onRun }: { name: string; cmd: string; lang: Lang; onRun: () => void }) {
  const note = commandNote(cmd, lang);
  return (
    <div className="quick-cmd" onClick={onRun} data-tooltip={note}>
      <div>
        <div className="cmd-name">{name}</div>
        <div className="cmd-line">$ {cmd}</div>
      </div>
      <span className="run">{t("snippets.run", lang)} -&gt;</span>
    </div>
  );
}

function commandNote(cmd: string, lang: Lang) {
  const lower = cmd.toLowerCase();
  if (lower.startsWith("ssh ")) return lang === "zh" ? "Open an SSH session" : "Open an SSH session";
  if (lower.startsWith("ping")) return lang === "zh" ? "Send ICMP probes" : "Send ICMP probes";
  if (lower.includes("ip a") || lower.includes("ifconfig")) return lang === "zh" ? "Show network interfaces" : "Show network interfaces";
  if (lower.startsWith("uptime")) return lang === "zh" ? "Show uptime" : "Show uptime";
  if (lower.startsWith("df ")) return lang === "zh" ? "Show disk usage" : "Show disk usage";
  if (lower.startsWith("uname")) return lang === "zh" ? "Show system info" : "Show system info";
  if (lower.startsWith("docker ps")) return lang === "zh" ? "List running containers" : "List running containers";
  return lang === "zh" ? "Click to run in active session" : "Click to run in active session";
}

function identityName(path?: string) {
  if (!path) return "(agent)";
  return path.split(/[\\/]/).pop() || path;
}

function statusClass(host: Host) {
  if (host.status === "off" || host.latency == null) return "off";
  if (host.latency < 20) return "ok";
  if (host.latency < 60) return "warn";
  return "bad";
}

function formatLastConnected(timestamp: number | undefined, lang: Lang) {
  if (!timestamp) return t("host.lastseen.never", lang);
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return t("host.lastseen.minutes", lang, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("host.lastseen.hours", lang, { n: hours });
  return t("host.lastseen.days", lang, { n: Math.floor(hours / 24) });
}
