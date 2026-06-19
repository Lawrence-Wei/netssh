import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { LOCAL_SHELLS, SSH_KEYS } from "../config/defaults";
import { APP_VERSION } from "../config/app";
import { detectShells, listKeys } from "../api/tauri";
import { t } from "../utils/i18n";
import type {
  Lang,
  ShellInfo,
  SshKey,
  TerminalCursorStyle,
  TerminalLocale,
  TerminalTimezone,
  Theme,
} from "../config/types";
import { Icon } from "../components/Icons";
import { useCredentials } from "../store/credentials";
import { useConfirm } from "../components/ConfirmDialog";

interface SettingsSnapshot {
  translucency: boolean;
  reduceMotion: boolean;
  fontSize: number;
  fontFamily: string;
  terminalCursorStyle: TerminalCursorStyle;
  terminalCursorBlink: boolean;
  terminalScrollback: number;
  terminalCopyOnSelect: boolean;
  terminalRightClickPaste: boolean;
  terminalLocale: TerminalLocale;
  terminalTimezone: TerminalTimezone;
  defaultShellId: string;
  defaultShellName: string;
  defaultShellPath: string | undefined;
  customShells: ShellInfo[];
  hardwareAcceleration: boolean;
  telemetry: boolean;
  autostart: boolean;
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

type SectionId = "appearance" | "language" | "shells" | "keys" | "credentials" | "terminal" | "shortcuts" | "advanced" | "about";

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
    { id: "about", icon: Icon.info, label: t("settings.nav.about", lang) },
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
        {section === "shells" && <ShellsPane lang={lang} settings={settings} setSetting={setSetting} />}
        {section === "keys" && <KeysPane lang={lang} />}
        {section === "credentials" && <CredentialsPane lang={lang} />}
        {section === "terminal" && <TerminalPaneSettings lang={lang} settings={settings} setSetting={setSetting} />}
        {section === "shortcuts" && <ShortcutsPane lang={lang} />}
        {section === "advanced" && <AdvancedPane lang={lang} settings={settings} setSetting={setSetting} />}
        {section === "about" && <AboutPane lang={lang} />}
      </div>
    </div>
  );
}

const TERMINAL_FONTS = ["JetBrains Mono", "Cascadia Mono", "Fira Code", "Consolas"];
const SCROLLBACK_OPTIONS = [1000, 5000, 10000, 50000];
const TERMINAL_LOCALES: TerminalLocale[] = ["system", "C.UTF-8", "en_US.UTF-8", "zh_CN.UTF-8"];
const TERMINAL_TIMEZONES: TerminalTimezone[] = ["system", "Asia/Shanghai", "UTC"];

function AppearancePane({ lang, theme, setTheme, settings, setSetting }: {
  lang: Lang;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  settings: SettingsSnapshot;
  setSetting: SettingsProps["setSetting"];
}) {
  const themes: Array<{ id: Theme; name: string; eyebrow: string }> = [
    { id: "purple", name: t("settings.appearance.theme.purple", lang), eyebrow: t("settings.appearance.theme.purple.eyebrow", lang) },
    { id: "blue", name: t("settings.appearance.theme.blue", lang), eyebrow: t("settings.appearance.theme.blue.eyebrow", lang) },
    { id: "mica", name: t("settings.appearance.theme.mica", lang), eyebrow: t("settings.appearance.theme.mica.eyebrow", lang) },
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
          <div className="seg">
            {TERMINAL_FONTS.map((font) => (
              <button
                key={font}
                className={settings.fontFamily === font ? "active" : ""}
                onClick={() => setSetting("fontFamily", font)}
              >
                {font}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="label">{t("settings.appearance.font.size", lang)}</div>
            <div className="desc">{t("settings.appearance.font.size.range", lang)}</div>
          </div>
          <div className="seg">
            {[12, 13, 14, 16].map((size) => (
              <button key={size} className={settings.fontSize === size ? "active" : ""} onClick={() => setSetting("fontSize", size)}>
                {t("settings.appearance.font.size.option", lang, { size })}
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
            <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>{t("settings.language.option.en", lang)}</button>
            <button className={lang === "zh" ? "active" : ""} onClick={() => setLang("zh")}>{t("settings.language.option.zh", lang)}</button>
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
          <div className="seg">
            {TERMINAL_LOCALES.map((locale) => (
              <button
                key={locale}
                className={settings.terminalLocale === locale ? "active" : ""}
                onClick={() => setSetting("terminalLocale", locale)}
              >
                {locale === "system" ? t("settings.language.system.short", lang) : locale}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="label">{t("settings.language.timezone", lang)}</div>
            <div className="desc">{t("settings.language.timezone.desc", lang)}</div>
          </div>
          <div className="seg">
            {TERMINAL_TIMEZONES.map((timezone) => (
              <button
                key={timezone}
                className={settings.terminalTimezone === timezone ? "active" : ""}
                onClick={() => setSetting("terminalTimezone", timezone)}
              >
                {timezone === "system" ? t("settings.language.timezone.system", lang) : timezone}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function ShellsPane({ lang, settings, setSetting }: {
  lang: Lang;
  settings: SettingsSnapshot;
  setSetting: SettingsProps["setSetting"];
}) {
  const [shells, setShells] = useState<ShellInfo[]>(LOCAL_SHELLS);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", path: "" });

  useEffect(() => {
    detectShells().then((detected) => {
      if (detected.length) setShells(detected);
    }).catch(() => undefined);
  }, []);

  const effectiveShells = mergeShells(shells, settings.customShells);
  const startCustom = (shell?: ShellInfo) => {
    setEditingCustomId(shell?.id ?? "new");
    setDraft({ name: shell?.name ?? "", path: shell?.path ?? "" });
  };
  const saveCustom = () => {
    const name = draft.name.trim();
    const path = draft.path.trim();
    if (!name || !path) return;
    const existing = settings.customShells.find((shell) => shell.id === editingCustomId);
    const shell: ShellInfo = {
      id: existing?.id ?? `custom-${Date.now()}`,
      name,
      path,
      is_default: false,
    };
    const customShells = existing
      ? settings.customShells.map((item) => (item.id === existing.id ? shell : item))
      : [...settings.customShells, shell];
    setSetting("customShells", customShells);
    if (!settings.defaultShellId || settings.defaultShellId === existing?.id) {
      setDefaultShell(shell);
    }
    setEditingCustomId(null);
  };
  const setDefaultShell = (shell: ShellInfo) => {
    setSetting("defaultShellId", shell.id);
    setSetting("defaultShellName", shell.name);
    setSetting("defaultShellPath", shell.path);
  };

  return (
    <>
      <h2>{t("settings.shells.title", lang)}</h2>
      <p className="lead">{t("settings.shells.lead", lang)}</p>
      <div className="settings-section">
        <span className="eyebrow">{t("settings.shells.detected", lang)}</span>
        <div className="shell-list">
          {effectiveShells.map((shell) => (
            <div className="shell-item" key={shell.id}>
              <div className="icon" style={{ color: shellHue(shell.id), background: `${shellHue(shell.id)}20` }}>{abbr(shell.name)}</div>
              <div>
                <div className="name">{shell.name}</div>
                <div className="path">{shell.path}</div>
              </div>
              {settings.defaultShellId === shell.id || (!settings.defaultShellId && shell.is_default)
                ? <span className="default-pill">{t("settings.shells.default", lang)}</span>
                : <button className="select-pill" onClick={() => setDefaultShell(shell)}>{t("settings.shells.makeDefault", lang)}</button>}
              <button
                className="icon-btn"
                disabled={!settings.customShells.some((item) => item.id === shell.id)}
                onClick={() => startCustom(shell)}
                title={t("host.action.edit", lang)}
              >
                {Icon.edit}
              </button>
            </div>
          ))}
        </div>
        {editingCustomId && (
          <div className="cred-editor" style={{ marginTop: 14 }}>
            <div className="cred-editor__grid">
              <label>
                <span className="k">{t("settings.shells.field.name", lang)}</span>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="PowerShell 7" />
              </label>
              <label className="span-2">
                <span className="k">{t("settings.shells.field.path", lang)}</span>
                <input value={draft.path} onChange={(e) => setDraft({ ...draft, path: e.target.value })} placeholder="C:\\Program Files\\PowerShell\\7\\pwsh.exe" />
              </label>
            </div>
            <div className="cred-editor__foot">
              <button className="btn ghost" onClick={() => setEditingCustomId(null)}>{t("common.cancel", lang)}</button>
              <button className="btn" onClick={saveCustom}>{t("common.save", lang)}</button>
            </div>
          </div>
        )}
        <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => startCustom()}>
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
              <button
                className="icon-btn"
                onClick={() => void navigator.clipboard?.writeText(`${key.name} ${key.fingerprint} ${key.path}`)}
                title={t("common.copy", lang)}
              >
                {Icon.copy}
              </button>
              <button className="icon-btn danger" disabled title={t("settings.keys.delete.disabled", lang)}>{Icon.trash}</button>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <button className="btn ghost" disabled>{Icon.import}<span>{t("settings.keys.import", lang)}</span></button>
          <button className="btn" disabled>{Icon.plus}<span>{t("settings.keys.generate", lang)}</span></button>
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
  const cursorStyles: Array<{ id: TerminalCursorStyle; label: string }> = [
    { id: "block", label: t("settings.terminal.cursor.block", lang) },
    { id: "underline", label: t("settings.terminal.cursor.underline", lang) },
    { id: "bar", label: t("settings.terminal.cursor.bar", lang) },
  ];
  return (
    <>
      <h2>{t("settings.nav.terminal", lang)}</h2>
      <p className="lead">{t("settings.terminal.lead", lang)}</p>
      <div className="settings-section">
        <div className="setting-row">
          <div><div className="label">{t("settings.terminal.cursor", lang)}</div><div className="desc">{t("settings.terminal.cursor.desc", lang)}</div></div>
          <div className="seg">
            {cursorStyles.map((style) => (
              <button
                key={style.id}
                className={settings.terminalCursorStyle === style.id ? "active" : ""}
                onClick={() => setSetting("terminalCursorStyle", style.id)}
              >
                {style.label}
              </button>
            ))}
          </div>
        </div>
        <ToggleRow
          label={t("settings.terminal.cursorBlink", lang)}
          desc={t("settings.terminal.cursorBlink.desc", lang)}
          on={settings.terminalCursorBlink}
          onToggle={() => setSetting("terminalCursorBlink", !settings.terminalCursorBlink)}
        />
        <div className="setting-row">
          <div><div className="label">{t("settings.terminal.scrollback", lang)}</div><div className="desc">{t("settings.terminal.scrollback.desc", lang)}</div></div>
          <div className="seg">
            {SCROLLBACK_OPTIONS.map((lines) => (
              <button
                key={lines}
                className={settings.terminalScrollback === lines ? "active" : ""}
                onClick={() => setSetting("terminalScrollback", lines)}
              >
                {lines.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
        <ToggleRow
          label={t("settings.terminal.copyOnSelect", lang)}
          desc={t("settings.terminal.copyOnSelect.desc", lang)}
          on={settings.terminalCopyOnSelect}
          onToggle={() => setSetting("terminalCopyOnSelect", !settings.terminalCopyOnSelect)}
        />
        <ToggleRow
          label={t("settings.terminal.rightPaste", lang)}
          desc={t("settings.terminal.rightPaste.desc", lang)}
          on={settings.terminalRightClickPaste}
          onToggle={() => setSetting("terminalRightClickPaste", !settings.terminalRightClickPaste)}
        />
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
        ["Ctrl + K", t("settings.shortcuts.commandPalette", lang)],
        ["Ctrl + T", t("settings.shortcuts.newTab", lang)],
        ["Ctrl + W", t("settings.shortcuts.closeTab", lang)],
        ["Ctrl + Tab", t("settings.shortcuts.nextTab", lang)],
        ["Ctrl + Shift + Tab", t("settings.shortcuts.previousTab", lang)],
        ["Ctrl + 1..9", t("settings.shortcuts.switchToTab", lang)],
      ],
    },
    {
      title: t("settings.shortcuts.session", lang),
      items: [
        [t("settings.shortcuts.enterOnHost", lang), t("settings.shortcuts.connect", lang)],
        ["Ctrl + D", t("settings.shortcuts.splitRight", lang)],
        ["Ctrl + Shift + D", t("settings.shortcuts.splitDown", lang)],
        ["Ctrl + Shift + F", t("settings.shortcuts.searchScrollback", lang)],
        ["F4", t("settings.shortcuts.openSftp", lang)],
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
        <ToggleRow
          label={t("settings.advanced.telemetry", lang)}
          desc={t("settings.advanced.telemetry.desc", lang)}
          on={settings.telemetry}
          onToggle={() => setSetting("telemetry", !settings.telemetry)}
          disabled
        />
        <ToggleRow
          label={t("settings.advanced.hardware", lang)}
          desc={t("settings.advanced.hardware.desc", lang)}
          on={settings.hardwareAcceleration}
          onToggle={() => setSetting("hardwareAcceleration", !settings.hardwareAcceleration)}
        />
        <ToggleRow
          label={t("settings.advanced.autostart", lang)}
          desc={t("settings.advanced.autostart.desc", lang)}
          on={settings.autostart}
          onToggle={() => setSetting("autostart", !settings.autostart)}
          disabled
        />
      </div>
    </>
  );
}

function AboutPane({ lang }: { lang: Lang }) {
  return (
    <>
      <h2>{t("settings.about.title", lang)}</h2>
      <p className="lead">{t("settings.about.lead", lang)}</p>
      <div className="settings-section about-panel">
        <div className="about-product">
          <span className="mark">
            <svg viewBox="0 0 13 13" fill="none">
              <path d="M2 3L5.5 6.5L2 10M6.5 10H11" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <div className="label">{t("app.name", lang)}</div>
            <div className="desc">{t("settings.about.product", lang)}</div>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="label">{t("settings.about.version", lang)}</div>
            <div className="desc">{t("settings.about.version.desc", lang)}</div>
          </div>
          <span className="select-pill">{APP_VERSION}</span>
        </div>
      </div>
    </>
  );
}

function ToggleRow({ label, desc, on, onToggle, disabled }: {
  label: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="setting-row">
      <div>
        <div className="label">{label}</div>
        <div className="desc">{desc}</div>
      </div>
      <button
        className={"toggle " + (on ? "on" : "")}
        onClick={onToggle}
        aria-label={label}
        disabled={disabled}
      />
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
    else {
      const { password, ...metadata } = payload;
      update(editingId, metadata, password);
    }
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
                    {cred.hasPassword ? ` - ${t("settings.credentials.hasPassword", lang)}` : ""}
                    {cred.identityFile ? ` - ${cred.identityFile}` : ""}
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

function mergeShells(detected: ShellInfo[], custom: ShellInfo[]) {
  const seen = new Set<string>();
  const merged: ShellInfo[] = [];
  for (const shell of [...detected, ...custom]) {
    const key = `${shell.id}:${shell.path}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(shell);
  }
  return merged;
}

function shellHue(id: string) {
  if (id.includes("pwsh")) return "#60a5fa";
  if (id.includes("wsl")) return "#fbbf24";
  if (id.includes("git")) return "#a78bfa";
  return "#9ca3af";
}
