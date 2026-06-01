// User-facing settings. Persisted to localStorage immediately + mirrored
// into SQLite on a debounce.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Lang, Theme } from "../config/types";
import { appStorage } from "./persistence";

interface SettingsState {
  theme: Theme;
  lang: Lang;
  followSystem: boolean;
  translucency: boolean;
  reduceMotion: boolean;
  fontSize: number;
  fontFamily: string;
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
        if (savedTheme === "xuan") return { ...state, theme: "purple" as Theme };
        return persisted as SettingsState;
      },
    }
  )
);
