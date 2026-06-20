// User-facing settings. Persisted to localStorage immediately + mirrored
// into SQLite on a debounce.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  Lang,
  ShellInfo,
  TerminalCursorStyle,
  TerminalLocale,
  TerminalTimezone,
  Theme,
} from "../config/types";
import { appStorage } from "./persistence";

const VALID_THEMES: Theme[] = ["purple", "blue", "mica", "light"];

interface SettingsState {
  theme: Theme;
  lang: Lang;
  followSystem: boolean;
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
  defaultShellPath?: string;
  customShells: ShellInfo[];
  hardwareAcceleration: boolean;
  telemetry: boolean;
  autostart: boolean;
  showSessionRail: boolean;
  allowConfigWrite: boolean;       // Settings → Advanced — default false
  setTheme: (t: Theme) => void;
  setLang: (l: Lang) => void;
  set: <K extends keyof Omit<SettingsState, "setTheme" | "setLang" | "set">>(
    key: K,
    value: SettingsState[K]
  ) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "purple",
      lang: "en",
      followSystem: true,
      translucency: true,
      reduceMotion: false,
      fontSize: 13,
      fontFamily: "JetBrains Mono",
      terminalCursorStyle: "bar",
      terminalCursorBlink: true,
      terminalScrollback: 10000,
      terminalCopyOnSelect: false,
      terminalRightClickPaste: false,
      terminalLocale: "system",
      terminalTimezone: "system",
      defaultShellId: "pwsh",
      defaultShellName: "PowerShell",
      defaultShellPath: undefined,
      customShells: [],
      hardwareAcceleration: false,
      telemetry: false,
      autostart: false,
      showSessionRail: false,
      allowConfigWrite: false,
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
      set: <K extends keyof Omit<SettingsState, "setTheme" | "setLang" | "set">>(
        key: K,
        value: SettingsState[K]
      ) => set((state) => ({ ...state, [key]: value })),
    }),
    {
      name: "netssh.settings",
      storage: createJSONStorage(() => appStorage),
      migrate: (persisted) => {
        const state = persisted as (Partial<SettingsState> & { theme?: string }) | undefined;
        const savedTheme = state?.theme as string | undefined;
        const nextTheme = savedTheme === "xuan"
          ? "purple"
          : VALID_THEMES.includes(savedTheme as Theme)
            ? (savedTheme as Theme)
            : "purple";
        const next = {
          followSystem: true,
          translucency: true,
          reduceMotion: false,
          fontSize: 13,
          fontFamily: "JetBrains Mono",
          terminalCursorStyle: "bar" as TerminalCursorStyle,
          terminalCursorBlink: true,
          terminalScrollback: 10000,
          terminalCopyOnSelect: false,
          terminalRightClickPaste: false,
          terminalLocale: "system" as TerminalLocale,
          terminalTimezone: "system" as TerminalTimezone,
          defaultShellId: "pwsh",
          defaultShellName: "PowerShell",
          defaultShellPath: undefined,
          customShells: [],
          hardwareAcceleration: false,
          telemetry: false,
          autostart: false,
          showSessionRail: false,
          allowConfigWrite: false,
          ...state,
          theme: nextTheme,
          lang: state?.lang ?? "en",
        };
        return next as SettingsState;
      },
    }
  )
);
