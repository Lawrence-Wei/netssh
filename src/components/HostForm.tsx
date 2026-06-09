/**
 * Full-screen host editor inspired by Termius-style workflows.
 * Split from HostDetail so editing state and validation stay isolated.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { SERIAL_PRESETS } from "../config/defaults";
import { t } from "../utils/i18n";
import { Icon } from "./Icons";
import { useIdentities } from "../store/identities";
import { deployScope, deviceTypeFromHost } from "../utils/deployScope";
import type { ConnectionType, DeployScope, Group, GroupId, Host, Lang, SerialProfile } from "../config/types";

interface HostFormProps {
  lang: Lang;
  host: Host;
  groups: Group[];
  /** Save callback that returns the edited patch to the parent. */
  onSave: (patch: Partial<Host>) => void;
  /** Cancel editing. */
  onCancel: () => void;
  /** Remove the current host. */
  onRemove: () => void;
  /** Add a new group inline. */
  onAddGroup: (name: string, subnet?: string) => Group;
}

export function HostEditorFull({
  lang,
  host,
  groups,
  onSave,
  onCancel,
  onRemove,
  onAddGroup,
}: HostFormProps) {
  const [draft, setDraft] = useState<Host>(host);
  const [port, setPort] = useState(String(host.port || 22));
  const [portError, setPortError] = useState("");
  const [newSite, setNewSite] = useState("");
  const { identities } = useIdentities();
  const connectionType = draft.connectionType || "ssh";
  const connectionSectionTitle = connectionType === "serial"
    ? t("host.connection.serialSection", lang)
    : t("host.connection.sshSection", lang);

  useEffect(() => {
    setDraft(host);
    setPort(String(host.port || 22));
    setPortError("");
  }, [host]);

  /** Save after port validation. */
  const validateAndSave = () => {
    if (connectionType === "serial") {
      onSave({
        ...draft,
        connectionType: "serial",
        serialProfile: normalizeSerialProfile(draft.serialProfile),
        ephemeralPassword: undefined,
      });
      return;
    }

    const portNum = Number(port);
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535 || !Number.isInteger(portNum)) {
      setPortError(lang === "zh" ? "Port must be 1-65535" : "Port must be 1-65535");
      return;
    }
    setPortError("");
    onSave({
      ...draft,
      connectionType: "ssh",
      port: portNum,
      ephemeralPassword: undefined,
    });
  };

  const setConnectionType = (nextType: ConnectionType) => {
    setDraft((current) => ({
      ...current,
      connectionType: nextType,
      serialProfile: nextType === "serial"
        ? normalizeSerialProfile(current.serialProfile)
        : current.serialProfile,
    }));
    setPortError("");
  };

  return (
    <div className="landing">
      <div className="host-editor-full">
        <div className="host-editor-full__head">
          <h2>
            <span style={{ color: "var(--text-mute)", fontWeight: 400 }}>
              {lang === "zh" ? "Edit host" : "Edit host"}
            </span>
            <span style={{ marginLeft: 8, color: "var(--accent)" }}>{host.alias}</span>
          </h2>
          <span style={{ color: "var(--text-mute)", fontSize: 11, fontFamily: "var(--font-mono)" }}>{host.id}</span>
        </div>

        <div className="host-editor-full__body">
          {/* Basic information */}
          <section className="host-editor-section">
            <h3 className="host-editor-section__title">
              {lang === "zh" ? "Basic information" : "Basic information"}
            </h3>
            <div className="host-editor-full__grid">
              <label>
                <span className="k">{t("host.field.alias", lang)}</span>
                <input
                  value={draft.alias}
                  onChange={(e) => setDraft({ ...draft, alias: e.target.value })}
                  placeholder="my-server"
                />
              </label>
              <label>
                <span className="k">{t("host.field.role", lang)}</span>
                <input
                  value={draft.role || ""}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                  placeholder={lang === "zh" ? "e.g. gateway, nas, web" : "e.g. gateway, nas, web"}
                />
              </label>
              <label>
                <span className="k">{lang === "zh" ? "Device type" : "Device type"}</span>
                <input
                  value={(draft.tags || []).join(", ")}
                  onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="ubuntu, raspberry, zspace, openwrt..."
                />
              </label>
              <label>
                <span className="k">{lang === "zh" ? "Notes" : "Notes"}</span>
                <input
                  value={draft.notes || ""}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder={lang === "zh" ? "Notes..." : "Notes..."}
                />
              </label>
              <label>
                <span className="k">{t("host.field.connectionType", lang)}</span>
                <select
                  aria-label={t("host.field.connectionType", lang)}
                  value={connectionType}
                  onChange={(e) => setConnectionType(e.target.value as ConnectionType)}
                >
                  <option value="ssh">{t("host.connection.ssh", lang)}</option>
                  <option value="serial">{t("host.connection.serial", lang)}</option>
                </select>
              </label>
            </div>
          </section>

          {/* Connection information */}
          <section className="host-editor-section">
            <h3 className="host-editor-section__title">
              {connectionSectionTitle}
            </h3>
            <div className="host-editor-full__grid">
              {connectionType === "ssh" ? (
                <>
                  {identities.length > 0 && (
                    <label style={{ gridColumn: "1 / -1" }}>
                      <span className="k">{t("host.field.identityProfile", lang)}</span>
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const id = e.target.value;
                          if (!id) return;
                          const ident = identities.find((i) => i.id === id);
                          if (ident) {
                            setDraft({ ...draft, user: ident.user, identityFile: ident.identityFile });
                          }
                          e.target.value = "";
                        }}
                      >
                        <option value="">{t("host.field.identityProfilePlaceholder", lang)}</option>
                        {identities.map((ident) => (
                          <option key={ident.id} value={ident.id}>
                            {ident.name} ({ident.user}){ident.identityFile ? ` - ${ident.identityFile.split(/[\\/]/).pop()}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    <span className="k">{t("host.field.hostname", lang)}</span>
                    <input
                      value={draft.hostname}
                      onChange={(e) => setDraft({ ...draft, hostname: e.target.value })}
                      placeholder="192.168.1.1 / example.com"
                    />
                  </label>
                  <label>
                    <span className="k">{t("host.field.user", lang)}</span>
                    <input
                      value={draft.user}
                      onChange={(e) => setDraft({ ...draft, user: e.target.value })}
                      placeholder="root"
                    />
                  </label>
                  <label>
                    <span className="k">{t("host.field.port", lang)}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={portError ? "has-error" : ""}
                      value={port}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d]/g, "");
                        setPort(v);
                        setPortError("");
                      }}
                      placeholder="22"
                      style={{ WebkitAppearance: "none", MozAppearance: "textfield" } as CSSProperties}
                    />
                    {portError && <span className="field-error">{portError}</span>}
                  </label>
                </>
              ) : (
                <>
                  <label>
                    <span className="k">{t("host.field.serialPort", lang)}</span>
                    <input
                      value={draft.serialProfile?.portName || ""}
                      onChange={(e) => setDraft({
                        ...draft,
                        serialProfile: {
                          ...normalizeSerialProfile(draft.serialProfile),
                          portName: e.target.value,
                        },
                      })}
                      placeholder="COM3"
                    />
                  </label>
                  <label>
                    <span className="k">{t("host.field.serialProfile", lang)}</span>
                    <input
                      value={formatSerialSummary(draft.serialProfile)}
                      readOnly
                    />
                  </label>
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--glass-stroke)",
                      background: "rgba(255, 255, 255, 0.03)",
                      color: "var(--text-dim)",
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    {t("host.editor.serialHint", lang)}
                  </div>
                </>
              )}
              <label>
                <span className="k">{lang === "zh" ? "Deploy scope" : "Deploy scope"}</span>
                <select
                  value={deployScope(draft) === "cloud" ? "cloud" : "local"}
                  onChange={(e) => setDraft({ ...draft, deployScope: e.target.value as DeployScope })}
                >
                  <option value="local">{lang === "zh" ? "Local" : "Local"}</option>
                  <option value="cloud">{lang === "zh" ? "Cloud" : "Cloud"}</option>
                </select>
              </label>
              <label>
                <span className="k">{lang === "zh" ? "Device type" : "Device type"}</span>
                <select
                  value={draft.iconOverride || deviceTypeFromHost(draft)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v || v === "auto") {
                      setDraft({ ...draft, iconOverride: undefined });
                    } else {
                      setDraft({ ...draft, iconOverride: v });
                    }
                  }}
                >
                  <option value="auto">{lang === "zh" ? "Auto detect" : "Auto detect"}</option>
                  <option value="router">{lang === "zh" ? "Router / Gateway" : "Router / Gateway"}</option>
                  <option value="openwrt">OpenWrt</option>
                  <option value="istoreos">iStoreOS</option>
                  <option value="nas">{lang === "zh" ? "NAS / Storage" : "NAS / Storage"}</option>
                  <option value="zspace">ZSpace / Zima</option>
                  <option value="raspberry">Raspberry Pi</option>
                  <option value="ubuntu">Ubuntu</option>
                  <option value="windows">{lang === "zh" ? "Windows" : "Windows"}</option>
                  <option value="macos">macOS</option>
                  <option value="linux">Linux</option>
                  <option value="server">{lang === "zh" ? "Server" : "Server"}</option>
                </select>
              </label>
              <label>
                <span className="k">{lang === "zh" ? "Cloud provider" : "Cloud provider"}</span>
                <select
                  value={draft.cloudProvider || ""}
                  onChange={(e) => setDraft({ ...draft, cloudProvider: (e.target.value || undefined) as Host["cloudProvider"] })}
                >
                  <option value="">{lang === "zh" ? "None" : "None"}</option>
                  <option value="aliyun">Aliyun</option>
                  <option value="tencent">Tencent</option>
                  <option value="aws">AWS</option>
                  <option value="azure">Azure</option>
                  <option value="gcp">GCP</option>
                  <option value="cloudflare">Cloudflare</option>
                  <option value="other">{lang === "zh" ? "Other" : "Other"}</option>
                </select>
              </label>
            </div>
          </section>

          {/* Site / group */}
          <section className="host-editor-section">
            <h3 className="host-editor-section__title">
              {lang === "zh" ? "Site / group" : "Site / group"}
            </h3>
            <div className="host-editor-full__grid">
              <label>
                <span className="k">{t("host.field.group", lang)}</span>
                <select
                  value={draft.group}
                  onChange={(e) => setDraft({ ...draft, group: e.target.value as GroupId })}
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}{group.subnet ? ` (${group.subnet})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="k">{t("site.field.newName", lang)}</span>
                <div className="host-editor__inline">
                  <input
                    value={newSite}
                    onChange={(e) => setNewSite(e.target.value)}
                    placeholder={t("site.field.name", lang)}
                  />
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => {
                      if (!newSite.trim()) return;
                      const group = onAddGroup(newSite.trim());
                      setDraft({ ...draft, group: group.id });
                      setNewSite("");
                    }}
                  >
                    {Icon.plus}
                    <span>{t("site.action.addInline", lang)}</span>
                  </button>
                </div>
              </label>
            </div>
          </section>
        </div>

        {/* Fixed footer actions */}
        <div className="host-editor-full__foot">
          <button className="btn danger" onClick={onRemove}>
            {Icon.trash}
            <span>{t("host.action.remove", lang)}</span>
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn ghost" onClick={onCancel}>
            {t("common.cancel", lang)}
          </button>
          <button className="btn" onClick={validateAndSave}>
            {Icon.check}
            <span>{t("common.save", lang)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function normalizeSerialProfile(profile?: SerialProfile): SerialProfile {
  const fallback = SERIAL_PRESETS.find((preset) => preset.id === "generic-9600-8n1")?.profile ?? SERIAL_PRESETS[0].profile;
  return {
    ...fallback,
    ...profile,
  };
}

function formatSerialSummary(profile?: SerialProfile) {
  const resolved = normalizeSerialProfile(profile);
  const parity = resolved.parity === "none" ? "N" : resolved.parity.slice(0, 1).toUpperCase();
  return `${resolved.baudRate} ${resolved.dataBits}${parity}${resolved.stopBits}`;
}
