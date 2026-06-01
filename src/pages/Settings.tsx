import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { LOCAL_SHELLS, SSH_KEYS } from "../config/defaults";
import { detectShells, listKeys } from "../api/tauri";
import { t } from "../utils/i18n";
import type { Lang, ShellInfo, SshKey, Theme } from "../config/types";
import { Icon } from "../components/Icons";
import { useCredentials } from "../store/credentials";
import { useConfirm } from "../components/ConfirmDialog";

interface SettingsSnapshot {
  translucency: boolean;
  reduceMotion: boolean;
  fontSize: number;
  fontFamily: string;
  followSystem: boolean;
  allowConfigWrite: boolean;
}

interface SettingsProps {
  lang: Lang;
  setLang: (lang: Lang) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  settings: SettingsSnapshot;
  setSetting: <K extends keyof SettingsSnapshot>(key: K, value: SettingsSnapshot[K]) => void;
}

type SectionId = "appearance" | "language" | "shells" | "keys" | "credentials" | "terminal" | "shortcuts" | "advanced";

export function Settings({ lang, setLang, theme, setTheme, settings, setSetting }: SettingsProps) {
  const [section, setSection] = useState<SectionId>("appearance");
  const nav: Array<{ id: SectionId; icon: ReactNode; label: string }> = [
    { id: "appearance", icon: Icon.palette, label: t("settings.nav.appearance", lang) },
    { id: "language", icon: Icon.globe, label: t("settings.nav.language", lang) },
    { id: "shells", icon: Icon.shell, label: t("settings.nav.shells", lang) },
    { id: "keys", icon: Icon.key, label: t("settings.nav.keys", lang) },
    { id: "credentials", icon: Icon.bookmark, label: t("settings.nav.credentials", lang) },
    { id: "terminal", icon: Icon.terminal, label: t("settings.nav.terminal", lang) },
    { id: "shortcuts", icon: Icon.keyboard, label: t("settings.nav.shortcuts", lang) },
    { id: "advanced", icon: Icon.settings, label: t("settings.nav.advanced", lang) },
  ];

  return (
    <div className="settings">
      <nav className="settings-nav">
        <span className="eyebrow">{t("settings.eyebrow", lang)}</span>
        {nav.map((item) => (
          <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="settings-pane">
        {section === "appearance" && <AppearancePane lang={lang} theme={theme} setTheme={setTheme} settings={settings} setSetting={setSetting} />}
        {section === "language" && <LanguagePane lang={lang} setLang={setLang} settings={settings} setSetting={setSetting} />}
        {section === "shells" && <ShellsPane lang={lang} />}
        {section === "keys" && <KeysPane lang={lang} />}
        {section === "credentials" && <CredentialsPane lang={lang} />}
        {section === "terminal" && <TerminalPaneSettings lang={lang} settings={settings} setSetting={setSetting} />}
        {section === "shortcuts" && <ShortcutsPane lang={lang} />}
        {section === "advanced" && <AdvancedPane lang={lang} settings={settings} setSetting={setSetting} />}
      </div>
    </div>
  );
}

function AppearancePane({ lang, theme, setTheme, settings, setSetting }: {
  lang: Lang;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  settings: SettingsSnapshot;
  setSetting: SettingsProps["setSetting"];
}) {
  const themes: Array<{ id: Theme; name: string; eyebrow: string }> = [
    { id: "purple", name: t("settings.appearance.theme.purple", lang), eyebrow: "Aurora" },
    { id: "blue", name: t("settings.appearance.theme.blue", lang), eyebrow: "Cobalt" },
    { id: "mica", name: t("settings.appearance.theme.mica", lang), eyebrow: "System" },
  ];

  return (
    <>
      <h2>{t("settings.appearance.title", lang)}</h2>
      <p className="lead">{t("settings.appearance.lead", lang)}</p>

      <div className="settings-section">
        <span className="eyebrow">{t("settings.appearance.theme.eyebrow", lang)}</span>
        <div className="theme-grid">
          {themes.map((item) => (
            <button
              key={item.id}
              className={"theme-card " + (theme === item.id ? "active" : "")}
              data-theme-preview={item.id}
              onClick={() => setTheme(item.id)}
            >
              <div className="swatch" />
              <div className="meta">
                <div className="name">
                  <span className="eyebrow">{item.eyebrow}</span>
                  {item.name}
                </div>
                <span className="check">{theme === item.id ? Icon.check : null}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <span className="eyebrow">{t("settings.effects", lang)}</span>
        <ToggleRow
          label={t("settings.appearance.translucency", lang)}
          desc={t("settings.appearance.translucency.desc", lang)}
          on={settings.translucency}
          onToggle={() => setSetting("translucency", !settings.translucency)}
        />
        <ToggleRow
          label={t("settings.appearance.motion", lang)}
          desc={t("settings.appearance.motion.desc", lang)}
          on={settings.reduceMotion}
          onToggle={() => setSetting("reduceMotion", !settings.reduceMotion)}
        />
      </div>

      <div className="settings-section">
        <span className="eyebrow">{t("settings.terminal.type", lang)}</span>
        <div className="setting-row">
          <div>
            <div className="label">{t("settings.appearance.font.family", lang)}</div>
            <div className="desc">JetBrains Mono / Cascadia Code / Fira Code / Hack</div>
          </div>
          <div className="select-pill">{settings.fontFamily} {Icon.chevron}</div>
        </div>
        <div className="setting-row">
          <div>
            <div className="label">{t("settings.appearance.font.size", lang)}</div>
            <div className="desc">10-20 pt</div>
          </div>
          <div className="seg">
            {[12, 13, 14, 16].map((size) => (
              <button key={size} className={settings.fontSize === size ? "active" : ""} onClick={() => setSetting("fontSize", size)}>
                {size}pt
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function LanguagePane({ lang, setLang, settings, setSetting }: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  settings: SettingsSnapshot;
  setSetting: SettingsProps["setSetting"];
}) {
  return (
    <>
      <h2>{t("settings.language.title", lang)}</h2>
      <p className="lead">{t("settings.language.lead", lang)}</p>
      <div className="settings-section">
        <span className="eyebrow">{t("settings.language.eyebrow.app", lang)}</span>
        <ToggleRow
          label={t("settings.language.system", lang)}
          desc={t("settings.language.system.detected", lang)}
          on={settings.followSystem}
          onToggle={() => setSetting("followSystem", !settings.followSystem)}
        />
        <div className="setting-row">
          <div>
            <div className="label">{t("settings.language.manual", lang)}</div>
            <div className="desc">{t("settings.language.manual.desc", lang)}</div>
          </div>
          <div className="seg">
            <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
            <button className={lang === "zh" ? "active" : ""} onClick={() => setLang("zh")}>简体中文</button>
          </div>
        </div>
      </div>
      <div className="settings-section">
        <span className="eyebrow">{t("settings.language.eyebrow.term", lang)}</span>
        <div className="setting-row">
          <div>
            <div className="label">LANG / LC_ALL</div>
            <div className="desc">{t("settings.language.term.desc", lang)}</div>
          </div>
          <div className="select-pill">en_US.UTF-8 {Icon.chevron}</div>
        </div>
        <div className="setting-row">
          <div>
            <div className="label">{t("settings.language.timezone", lang)}</div>
            <div className="desc">{t("settings.language.timezone.desc", lang)}</div>
          </div>
          <div className="select-pill">System (Asia/Shanghai) {Icon.chevron}</div>
        </div>
      </div>
    </>
  );
}

function ShellsPane({ lang }: { lang: Lang }) {
  const [shells, setShells] = useState<ShellInfo[]>(LOCAL_SHELLS);

  useEffect(() => {
    detectShells().then((detected) => {
      if (detected.length) setShells(detected);
    }).catch(() => undefined);
  }, []);

  return (
    <>
      <h2>{t("settings.shells.title", lang)}</h2>
      <p className="lead">{t("settings.shells.lead", lang)}</p>
      <div className="settings-section">
        <span className="eyebrow">{t("settings.shells.detected", lang)}</span>
        <div className="shell-list">
          {shells.map((shell) => (
            <div className="shell-item" key={shell.id}>
              <div className="icon" style={{ color: shellHue(shell.id), background: `${shellHue(shell.id)}20` }}>{abbr(shell.name)}</div>
              <div>
                <div className="name">{shell.name}</div>
                <div className="path">{shell.path}</div>
              </div>
              {shell.is_default ? <span className="default-pill">{t("settings.shells.default", lang)}</span> : <button className="select-pill">{t("settings.shells.makeDefault", lang)}</button>}
              <button className="icon-btn">{Icon.edit}</button>
            </div>
          ))}
        </div>
        <button className="btn ghost" style={{ marginTop: 14 }}>
          {Icon.plus}
          <span>{t("settings.shells.add", lang)}</span>
        </button>
      </div>
    </>
  );
}

function KeysPane({ lang }: { lang: Lang }) {
  const [keys, setKeys] = useState<SshKey[]>(SSH_KEYS);

  useEffect(() => {
    listKeys().then((detected) => {
      if (detected.length) setKeys(detected);
    }).catch(() => undefined);
  }, []);

  return (
    <>
      <h2>{t("settings.keys.title", lang)}</h2>
      <p className="lead">{t("settings.keys.lead", lang)}</p>
      <div className="settings-section">
        <span className="eyebrow">{t("settings.keys.detected", lang)}</span>
        {keys.map((key) => (
          <div className="key-item" key={key.id}>
            <div className="icon">{Icon.key}</div>
            <div>
              <div className="name">{key.name}</div>
              <div className="meta">{key.key_type.toUpperCase()} / {key.fingerprint}</div>
            </div>
            <div className="row-flex">
              <button className="icon-btn">{Icon.copy}</button>
              <button className="icon-btn danger">{Icon.trash}</button>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <button className="btn ghost">{Icon.import}<span>{t("settings.keys.import", lang)}</span></button>
          <button className="btn">{Icon.plus}<span>{t("settings.keys.generate", lang)}</span></button>
        </div>
      </div>
    </>
  );
}

function TerminalPaneSettings({ lang, settings, setSetting }: {
  lang: Lang;
  settings: SettingsSnapshot;
  setSetting: SettingsProps["setSetting"];
}) {
  return (
    <>
      <h2>{t("settings.nav.terminal", lang)}</h2>
      <p className="lead">{t("settings.terminal.lead", lang)}</p>
      <div className="settings-section">
        <div className="setting-row">
          <div><div className="label">{t("settings.terminal.cursor", lang)}</div><div className="desc">{t("settings.terminal.cursor.desc", lang)}</div></div>
          <div className="seg">
            <button>{lang === "zh" ? "块" : "Block"}</button>
            <button>{lang === "zh" ? "下划线" : "Underline"}</button>
            <button className="active">{lang === "zh" ? "竖线" : "Bar"}</button>
          </div>
        </div>
        <ToggleRow label={t("settings.terminal.cursorBlink", lang)} desc={t("settings.terminal.cursorBlink.desc", lang)} on onToggle={() => undefined} />
        <div className="setting-row">
          <div><div className="label">{t("settings.terminal.scrollback", lang)}</div><div className="desc">{t("settings.terminal.scrollback.desc", lang)}</div></div>
          <div className="select-pill">10,000 {Icon.chevron}</div>
        </div>
        <ToggleRow label={t("settings.terminal.copyOnSelect", lang)} desc={t("settings.terminal.copyOnSelect.desc", lang)} on onToggle={() => undefined} />
        <ToggleRow label={t("settings.terminal.rightPaste", lang)} desc={t("settings.terminal.rightPaste.desc", lang)} on={false} onToggle={() => undefined} />
        <ToggleRow
          label={t("settings.appearance.motion", lang)}
          desc={t("settings.appearance.motion.desc", lang)}
          on={settings.reduceMotion}
          onToggle={() => setSetting("reduceMotion", !settings.reduceMotion)}
        />
      </div>
    </>
  );
}

function ShortcutsPane({ lang }: { lang: Lang }) {
  const groups = [
    {
      title: t("settings.shortcuts.navigation", lang),
      items: [
        ["Ctrl + K", lang === "zh" ? "命令面板" : "Command palette"],
        ["Ctrl + T", lang === "zh" ? "新建标签" : "New tab"],
        ["Ctrl + W", lang === "zh" ? "关闭标签" : "Close tab"],
        ["Ctrl + Tab", lang === "zh" ? "下一个标签" : "Next tab"],
        ["Ctrl + Shift + Tab", lang === "zh" ? "上一个标签" : "Previous tab"],
        ["Ctrl + 1..9", lang === "zh" ? "切到第 N 个标签" : "Switch to tab N"],
      ],
    },
    {
      title: t("settings.shortcuts.session", lang),
      items: [
        [lang === "zh" ? "Enter (选中主机)" : "Enter on host", lang === "zh" ? "连接" : "Connect"],
        ["Ctrl + D", lang === "zh" ? "向右分屏" : "Split pane right"],
        ["Ctrl + Shift + D", lang === "zh" ? "向下分屏" : "Split pane down"],
        ["Ctrl + Shift + F", lang === "zh" ? "搜索回滚" : "Search scrollback"],
        ["F4", lang === "zh" ? "打开 SFTP" : "Open SFTP"],
      ],
    },
  ];
  return (
    <>
      <h2>{t("settings.nav.shortcuts", lang)}</h2>
      <p className="lead">{t("settings.shortcuts.lead", lang)}</p>
      {groups.map((group) => (
        <div className="settings-section" key={group.title}>
          <span className="eyebrow">{group.title}</span>
          {group.items.map(([keys, label]) => (
            <div className="setting-row" key={keys}>
              <div className="label">{label}</div>
              <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 12, padding: "4px 10px", background: "var(--glass)", border: "1px solid var(--glass-stroke)", borderRadius: 6, color: "var(--text-dim)" }}>{keys}</kbd>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function AdvancedPane({ lang, settings, setSetting }: {
  lang: Lang;
  settings: SettingsSnapshot;
  setSetting: SettingsProps["setSetting"];
}) {
  return (
    <>
      <h2>{t("settings.nav.advanced", lang)}</h2>
      <p className="lead">{t("settings.advanced.lead", lang)}</p>
      <div className="settings-section">
        <ToggleRow
          label={t("settings.advanced.configWrite", lang)}
          desc={t("settings.advanced.configWrite.desc", lang)}
          on={settings.allowConfigWrite}
          onToggle={() => setSetting("allowConfigWrite", !settings.allowConfigWrite)}
        />
        <ToggleRow label={t("settings.advanced.telemetry", lang)} desc={t("settings.advanced.telemetry.desc", lang)} on={false} onToggle={() => undefined} />
        <ToggleRow label={t("settings.advanced.hardware", lang)} desc={t("settings.advanced.hardware.desc", lang)} on onToggle={() => undefined} />
        <ToggleRow label={t("settings.advanced.autostart", lang)} desc={t("settings.advanced.autostart.desc", lang)} on={false} onToggle={() => undefined} />
      </div>
    </>
  );
}

function ToggleRow({ label, desc, on, onToggle }: { label: string; desc: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="setting-row">
      <div>
        <div className="label">{label}</div>
        <div className="desc">{desc}</div>
      </div>
      <button className={"toggle " + (on ? "on" : "")} onClick={onToggle} aria-label={label} />
    </div>
  );
}

function CredentialsPane({ lang }: { lang: Lang }) {
  const { credentials, add, update, remove } = useCredentials();
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    group: string;
    user: string;
    password: string;
    identityFile: string;
    notes: string;
    tags: string;
  }>({
    name: "",
    group: "root",
    user: "",
    password: "",
    identityFile: "",
    notes: "",
    tags: "",
  });

  const grouped = credentials.reduce<Record<string, typeof credentials>>((acc, cred) => {
    const key = cred.group || "default";
    acc[key] = acc[key] || [];
    acc[key].push(cred);
    return acc;
  }, {});

  const startNew = () => {
    setEditingId("new");
    setDraft({ name: "", group: "root", user: "", password: "", identityFile: "", notes: "", tags: "" });
  };

  const startEdit = (id: string) => {
    const c = credentials.find((cred) => cred.id === id);
    if (!c) return;
    setEditingId(id);
    setDraft({
      name: c.name,
      group: c.group,
      user: c.user,
      password: "",
      identityFile: c.identityFile || "",
      notes: c.notes || "",
      tags: (c.tags || []).join(", "),
    });
  };

  const save = () => {
    const payload = {
      name: draft.name.trim() || draft.user || "credential",
      group: draft.group.trim() || "default",
      user: draft.user.trim(),
      password: draft.password || undefined,
      identityFile: draft.identityFile.trim() || undefined,
      notes: draft.notes.trim() || undefined,
      tags: draft.tags
        ? draft.tags.split(/[,;]/).map((tag) => tag.trim()).filter(Boolean)
        : undefined,
    };
    if (!payload.user) return;
    if (editingId === "new" || !editingId) add(payload);
    else update(editingId, payload);
    setEditingId(null);
  };

  return (
    <>
      <h2>{t("settings.credentials.title", lang)}</h2>
      <p className="lead">{t("settings.credentials.lead", lang)}</p>

      <div className="settings-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="eyebrow">{t("settings.credentials.list", lang)}</span>
          <button className="btn" onClick={startNew}>
            {Icon.plus}
            <span>{t("settings.credentials.add", lang)}</span>
          </button>
        </div>

        {credentials.length === 0 && editingId === null && (
          <div className="cred-empty">{t("settings.credentials.empty", lang)}</div>
        )}

        {Object.entries(grouped).map(([group, list]) => (
          <div key={group} className="cred-group">
            <div className="cred-group__head">{group}</div>
            {list.map((cred) => (
              <div key={cred.id} className="cred-item">
                <div className="cred-item__meta">
                  <div className="cred-item__name">{cred.name}</div>
                  <div className="cred-item__sub">
                    {cred.user}
                    {cred.hasPassword ? ` · ${t("settings.credentials.hasPassword", lang)}` : ""}
                    {cred.identityFile ? ` · ${cred.identityFile}` : ""}
                  </div>
                </div>
                <div className="cred-item__actions">
                  <button className="icon-btn" onClick={() => startEdit(cred.id)} title={t("host.action.edit", lang)}>
                    {Icon.edit}
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => {
                      void confirm({
                        title: t("settings.credentials.confirmRemove", lang, { name: cred.name }),
                        confirmLabel: t("host.action.remove", lang),
                        cancelLabel: t("common.cancel", lang),
                        danger: true,
                      }).then((ok) => {
                        if (ok) remove(cred.id);
                      });
                    }}
                    title={t("host.action.remove", lang)}
                  >
                    {Icon.trash}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {editingId && (
          <div className="cred-editor">
            <div className="cred-editor__grid">
              <label>
                <span className="k">{t("settings.credentials.field.name", lang)}</span>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label>
                <span className="k">{t("settings.credentials.field.group", lang)}</span>
                <input value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })} placeholder="root / switch / ops" />
              </label>
              <label>
                <span className="k">{t("settings.credentials.field.user", lang)}</span>
                <input value={draft.user} onChange={(e) => setDraft({ ...draft, user: e.target.value })} />
              </label>
              <label>
                <span className="k">{t("settings.credentials.field.password", lang)}</span>
                <input
                  type="password"
                  value={draft.password}
                  onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                />
              </label>
              <label className="span-2">
                <span className="k">{t("settings.credentials.field.identity", lang)}</span>
                <input
                  value={draft.identityFile}
                  onChange={(e) => setDraft({ ...draft, identityFile: e.target.value })}
                  placeholder="~/.ssh/id_ed25519"
                />
              </label>
              <label className="span-2">
                <span className="k">{t("settings.credentials.field.tags", lang)}</span>
                <input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="root, switch, prod" />
              </label>
              <label className="span-2">
                <span className="k">{t("settings.credentials.field.notes", lang)}</span>
                <textarea
                  rows={2}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </label>
            </div>
            <div className="cred-editor__foot">
              <button className="btn ghost" onClick={() => setEditingId(null)}>{t("common.cancel", lang)}</button>
              <button className="btn" onClick={save}>{t("common.save", lang)}</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function abbr(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function shellHue(id: string) {
  if (id.includes("pwsh")) return "#60a5fa";
  if (id.includes("wsl")) return "#fbbf24";
  if (id.includes("git")) return "#a78bfa";
  return "#9ca3af";
}
