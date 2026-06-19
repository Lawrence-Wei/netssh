/**
 * Full-screen host editor inspired by Termius-style workflows.
 * Split from HostDetail so editing state and validation stay isolated.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { SERIAL_PRESETS } from "../config/defaults";
import { t } from "../utils/i18n";
import { Icon } from "./Icons";
import { useCredentials } from "../store/credentials";
import { deployScope, deployScopeLabel, deviceTypeFromHost } from "../utils/deployScope";
import { displayGroupName } from "../utils/groups";
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
  const [aliasError, setAliasError] = useState("");
  const [serialError, setSerialError] = useState("");
  const [newSite, setNewSite] = useState("");
  const { credentials } = useCredentials();
  const connectionType = draft.connectionType || "ssh";
  const connectionSectionTitle = connectionType === "serial"
    ? t("host.connection.serialSection", lang)
    : t("host.connection.sshSection", lang);
  const serialProfile = normalizeSerialProfile(draft.serialProfile);

  useEffect(() => {
    setDraft(host);
    setPort(String(host.port || 22));
    setPortError("");
    setSerialError("");
  }, [host]);

  /** Save after alias + port validation. */
  const validateAndSave = () => {
    // Require the alias — a nameless host cannot be identified in the sidebar.
    if (!draft.alias?.trim()) {
      setAliasError(t("host.error.aliasRequired", lang));
      return;
    }
    setAliasError("");

    if (connectionType === "serial") {
      const serialProfile = normalizeSerialProfile(draft.serialProfile);
      if (!serialProfile.portName?.trim()) {
        setSerialError(t("host.error.serialPortRequired", lang));
        return;
      }
      if (!Number.isFinite(serialProfile.baudRate) || serialProfile.baudRate <= 0 || serialProfile.baudRate > 1152000) {
        setSerialError(t("host.error.serialBaudRate", lang));
        return;
      }
      setSerialError("");
      onSave({
        ...draft,
        connectionType: "serial",
        serialProfile: normalizeSerialProfile(draft.serialProfile),
        credentialProfileId: undefined,
        ephemeralPassword: undefined,
        identityFile: undefined,
      });
      return;
    }

    const portNum = Number(port);
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535 || !Number.isInteger(portNum)) {
      setPortError(t("host.error.portRange", lang));
      return;
    }
    setPortError("");
    onSave({
      ...draft,
      connectionType: "ssh",
      port: portNum,
      credentialProfileId: draft.credentialProfileId,
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
    setSerialError("");
  };

  return (
    <div className="landing">
      <div className="host-editor-full">
        <div className="host-editor-full__head">
          <h2>
            <span style={{ color: "var(--text-mute)", fontWeight: 400 }}>
              {t("host.editor.title", lang)}
            </span>
            <span style={{ marginLeft: 8, color: "var(--accent)" }}>{host.alias}</span>
          </h2>
          <span style={{ color: "var(--text-mute)", fontSize: 11, fontFamily: "var(--font-mono)" }}>{host.id}</span>
        </div>

        <div className="host-editor-full__body">
          <section className="host-editor-section host-editor-section--connection">
            <div className="host-editor-section__head">
              <h3 className="host-editor-section__title">
                {t("host.editor.connectionRequired", lang)}
              </h3>
              <span className="host-editor-section__badge">{connectionSectionTitle}</span>
            </div>
            <div className={"host-editor-connect-grid host-editor-connect-grid--" + connectionType}>
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
              {connectionType === "ssh" ? (
                <>
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
                      value={serialProfile.portName || ""}
                      onChange={(e) => setDraft({
                        ...draft,
                        serialProfile: {
                          ...serialProfile,
                          portName: e.target.value,
                        },
                      })}
                      onBlur={() => setSerialError("")}
                    />
                    {serialError && <span className="field-error">{serialError}</span>}
                  </label>
                  <label>
                    <span className="k">{t("host.field.serialPreset", lang)}</span>
                    <select
                      value={draft.serialProfile?.presetId ?? "custom"}
                      onChange={(e) => {
                        const presetId = e.target.value;
                        if (presetId === "custom") {
                          setDraft({ ...draft, serialProfile: { ...serialProfile } });
                          setSerialError("");
                          return;
                        }
                        const preset = SERIAL_PRESETS.find((item) => item.id === presetId);
                        if (!preset) return;
                        setDraft({
                          ...draft,
                          serialProfile: {
                            ...preset.profile,
                            portName: serialProfile.portName,
                            presetId,
                          },
                        });
                        setSerialError("");
                      }}
                    >
                      <option value="custom">{t("host.field.serialPresetCustom", lang)}</option>
                      {SERIAL_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="k">{t("host.field.serialBaudRate", lang)}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={String(serialProfile.baudRate)}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d]/g, "");
                        setDraft({
                          ...draft,
                          serialProfile: {
                            ...serialProfile,
                            baudRate: value ? Number(value) : 0,
                          },
                        });
                        setSerialError("");
                      }}
                    />
                  </label>
                </>
              )}
            </div>

            <div className="host-editor-advanced">
              <div className="host-editor-advanced__head">
                <span className="eyebrow">{t("manual.advanced.title", lang)}</span>
              </div>
              <div className={"host-editor-advanced-grid host-editor-advanced-grid--" + connectionType}>
                {connectionType === "ssh" ? (
                  <>
                    {credentials.length > 0 && (
                      <label>
                        <span className="k">{t("host.field.credentialProfile", lang)}</span>
                        <select
                          value={draft.credentialProfileId || ""}
                          onChange={(e) => {
                            const id = e.target.value;
                            if (!id) {
                              setDraft({ ...draft, credentialProfileId: undefined });
                              return;
                            }
                            const cred = credentials.find((i) => i.id === id);
                            if (!cred) return;
                            setDraft({
                              ...draft,
                              credentialProfileId: cred.id,
                              user: cred.user,
                              identityFile: cred.identityFile,
                            });
                          }}
                        >
                          <option value="">{t("host.field.credentialProfilePlaceholder", lang)}</option>
                          {credentials.map((cred) => (
                            <option key={cred.id} value={cred.id}>
                              {cred.group} · {cred.name} ({cred.user}){cred.identityFile ? ` - ${cred.identityFile.split(/[\\/]/).pop()}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      <span className="k">{t("manual.field.identityFile", lang)}</span>
                      <input
                        value={draft.identityFile || ""}
                        onChange={(e) => setDraft({ ...draft, identityFile: e.target.value || undefined })}
                        placeholder="~/.ssh/id_rsa"
                        autoComplete="off"
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      <span className="k">{t("host.field.serialDataBits", lang)}</span>
                      <select
                        value={serialProfile.dataBits}
                        onChange={(e) => {
                          setSerialError("");
                          setDraft({
                            ...draft,
                            serialProfile: {
                              ...serialProfile,
                              dataBits: Number(e.target.value) as 5 | 6 | 7 | 8,
                            },
                          });
                        }}
                      >
                        <option value={5}>5</option>
                        <option value={6}>6</option>
                        <option value={7}>7</option>
                        <option value={8}>8</option>
                      </select>
                    </label>
                    <label>
                      <span className="k">{t("host.field.serialParity", lang)}</span>
                      <select
                        value={serialProfile.parity}
                        onChange={(e) => {
                          setSerialError("");
                          setDraft({
                            ...draft,
                            serialProfile: {
                              ...serialProfile,
                              parity: e.target.value as SerialProfile["parity"],
                            },
                          });
                        }}
                      >
                        <option value="none">{t("host.serial.parity.none", lang)}</option>
                        <option value="odd">{t("host.serial.parity.odd", lang)}</option>
                        <option value="even">{t("host.serial.parity.even", lang)}</option>
                        <option value="mark">{t("host.serial.parity.mark", lang)}</option>
                        <option value="space">{t("host.serial.parity.space", lang)}</option>
                      </select>
                    </label>
                    <label>
                      <span className="k">{t("host.field.serialStopBits", lang)}</span>
                      <select
                        value={serialProfile.stopBits}
                        onChange={(e) => {
                          setSerialError("");
                          setDraft({
                            ...draft,
                            serialProfile: {
                              ...serialProfile,
                              stopBits: Number(e.target.value) as SerialProfile["stopBits"],
                            },
                          });
                        }}
                      >
                        <option value={1}>1</option>
                        <option value={1.5}>1.5</option>
                        <option value={2}>2</option>
                      </select>
                    </label>
                    <label>
                      <span className="k">{t("host.field.serialFlowControl", lang)}</span>
                      <select
                        value={serialProfile.flowControl}
                        onChange={(e) => {
                          setSerialError("");
                          setDraft({
                            ...draft,
                            serialProfile: {
                              ...serialProfile,
                              flowControl: e.target.value as SerialProfile["flowControl"],
                            },
                          });
                        }}
                      >
                        <option value="none">{t("host.serial.flow.none", lang)}</option>
                        <option value="software">{t("host.serial.flow.software", lang)}</option>
                        <option value="hardware">{t("host.serial.flow.hardware", lang)}</option>
                      </select>
                    </label>
                    <label>
                      <span className="k">{t("host.field.serialLineEnding", lang)}</span>
                      <select
                        value={serialProfile.lineEnding}
                        onChange={(e) => {
                          setSerialError("");
                          setDraft({
                            ...draft,
                            serialProfile: {
                              ...serialProfile,
                              lineEnding: e.target.value as SerialProfile["lineEnding"],
                            },
                          });
                        }}
                      >
                        <option value="none">{t("host.serial.lineEnding.none", lang)}</option>
                        <option value="lf">LF</option>
                        <option value="cr">CR</option>
                        <option value="crlf">CRLF</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="host-editor-section">
            <h3 className="host-editor-section__title">
              {t("host.editor.assetSection", lang)}
            </h3>
            <div className="host-editor-full__grid">
              <label>
                <span className="k">{t("host.field.alias", lang)}</span>
                <input
                  value={draft.alias}
                  onChange={(e) => {
                    setDraft({ ...draft, alias: e.target.value });
                    if (aliasError && e.target.value.trim()) setAliasError("");
                  }}
                  placeholder="my-server"
                />
                {aliasError && <span className="form-error">{aliasError}</span>}
              </label>
              <label>
                <span className="k">{t("host.field.env", lang)}</span>
                <select
                  value={draft.env || ""}
                  onChange={(e) => setDraft({ ...draft, env: e.target.value || undefined })}
                >
                  <option value="">--</option>
                  <option value="prod">{t("host.env.prod", lang)}</option>
                  <option value="stage">{t("host.env.stage", lang)}</option>
                  <option value="dev">{t("host.env.dev", lang)}</option>
                </select>
              </label>
              <label>
                <span className="k">{t("host.field.role", lang)}</span>
                <input
                  value={draft.role || ""}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                  placeholder="gateway, nas, web"
                />
              </label>
              <label>
                <span className="k">{t("host.field.tags", lang)}</span>
                <input
                  value={(draft.tags || []).join(", ")}
                  onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="huawei, cisco, ubuntu, raspberry, luckfox, zspace, openwrt..."
                />
              </label>
              <label>
                <span className="k">{t("host.field.deployScope", lang)}</span>
                <select
                  value={deployScope(draft) === "cloud" ? "cloud" : "local"}
                  onChange={(e) => setDraft({ ...draft, deployScope: e.target.value as DeployScope })}
                >
                  <option value="local">{deployScopeLabel("local", lang)}</option>
                  <option value="cloud">{deployScopeLabel("cloud", lang)}</option>
                </select>
              </label>
              <label>
                <span className="k">{t("host.field.deviceType", lang)}</span>
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
                  <option value="auto">{t("host.device.auto", lang)}</option>
                  <option value="router">{t("host.device.router", lang)}</option>
                  <option value="asus">{t("host.device.asus", lang)}</option>
                  <option value="huawei">{t("host.device.huawei", lang)}</option>
                  <option value="cisco">{t("host.device.cisco", lang)}</option>
                  <option value="openwrt">OpenWrt</option>
                  <option value="istoreos">iStoreOS</option>
                  <option value="nas">{t("host.device.nas", lang)}</option>
                  <option value="zspace">ZSpace / Zima</option>
                  <option value="luckfox">Luckfox</option>
                  <option value="raspberry">Raspberry Pi</option>
                  <option value="ubuntu">Ubuntu</option>
                  <option value="windows">Windows</option>
                  <option value="macos">macOS</option>
                  <option value="linux">Linux</option>
                  <option value="server">{t("host.device.server", lang)}</option>
                </select>
              </label>
              <label>
                <span className="k">{t("host.field.cloudProvider", lang)}</span>
                <select
                  value={draft.cloudProvider || ""}
                  onChange={(e) => setDraft({ ...draft, cloudProvider: (e.target.value || undefined) as Host["cloudProvider"] })}
                >
                  <option value="">{t("common.none", lang)}</option>
                  <option value="aliyun">Aliyun</option>
                  <option value="tencent">Tencent</option>
                  <option value="aws">AWS</option>
                  <option value="azure">Azure</option>
                  <option value="gcp">GCP</option>
                  <option value="cloudflare">Cloudflare</option>
                  <option value="other">{t("common.other", lang)}</option>
                </select>
              </label>
              <label>
                <span className="k">{t("host.field.notes", lang)}</span>
                <input
                  value={draft.notes || ""}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder={t("host.field.notes", lang)}
                />
              </label>
            </div>
          </section>

          {/* Site / group */}
          <section className="host-editor-section">
            <h3 className="host-editor-section__title">
              {t("host.editor.siteSection", lang)}
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
                      {displayGroupName(group, lang)}{group.subnet ? ` (${group.subnet})` : ""}
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
