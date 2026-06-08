/**
 * Full-screen host editor inspired by Termius-style workflows.
 * Split from HostDetail so editing state and validation stay isolated.
 */
import { useEffect, useState } from "react";
import { t } from "../utils/i18n";
import { Icon } from "./Icons";
import { useIdentities } from "../store/identities";
import { deployScope, deviceTypeFromHost } from "../utils/deployScope";
import type { DeployScope, Group, GroupId, Host, Lang } from "../config/types";

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

  useEffect(() => {
    setDraft(host);
    setPort(String(host.port || 22));
    setPortError("");
  }, [host.id, host.port]);

  /** Save after port validation. */
  const validateAndSave = () => {
    const portNum = Number(port);
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535 || !Number.isInteger(portNum)) {
      setPortError(lang === "zh" ? "Port must be 1-65535" : "Port must be 1-65535");
      return;
    }
    setPortError("");
    onSave({ ...draft, port: portNum });
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
            </div>
          </section>

          {/* SSH connection information */}
          <section className="host-editor-section">
            <h3 className="host-editor-section__title">
              {lang === "zh" ? "SSH connection" : "SSH connection"}
            </h3>
            <div className="host-editor-full__grid">
              {identities.length > 0 && (
                <label style={{ gridColumn: "1 / -1" }}>
                  <span className="k">{lang === "zh" ? "Identity / Profile" : "Identity / Profile"}</span>
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
                    <option value="">{lang === "zh" ? "Pick an identity to autofill..." : "Pick an identity to autofill..."}</option>
                    {identities.map((ident) => (
                      <option key={ident.id} value={ident.id}>
                        {ident.name} ({ident.user}){ident.identityFile ? ` — ${ident.identityFile.split(/[\\/]/).pop()}` : ""}
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
                <span className="k">{lang === "zh" ? "Password (ephemeral, never persisted)" : "Password (ephemeral, never persisted)"}</span>
                <input
                  type="password"
                  value={draft.ephemeralPassword || ""}
                  onChange={(e) => setDraft({ ...draft, ephemeralPassword: e.target.value || undefined })}
                  placeholder={lang === "zh" ? "Leave empty for key auth" : "Leave empty for key auth"}
                  autoComplete="off"
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
                  style={{ WebkitAppearance: "none", MozAppearance: "textfield" } as React.CSSProperties}
                />
                {portError && <span className="field-error">{portError}</span>}
              </label>
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
