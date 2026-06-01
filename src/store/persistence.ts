import type { StateStorage } from "zustand/middleware";
import { appStateGet, appStatePut } from "../api/tauri";

export const appStorage: StateStorage = {
  async getItem(name) {
    try {
      const value = await appStateGet(name);
      if (value != null) return value;
    } catch {
      // Browser preview and early startup fall back to localStorage.
    }
    return window.localStorage.getItem(name);
  },
  async setItem(name, value) {
    window.localStorage.setItem(name, value);
    try {
      await appStatePut(name, value);
    } catch {
      // Keep localStorage as a reliable preview/offline fallback.
    }
  },
  removeItem(name) {
    window.localStorage.removeItem(name);
  },
};
