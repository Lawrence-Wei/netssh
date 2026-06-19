import type { StateStorage } from "zustand/middleware";
import { appStateDelete, appStateGet, appStatePut } from "../api/tauri";

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
    if (containsSensitiveAppState(name, value)) {
      throw new Error("app_state_sensitive_value_rejected");
    }
    window.localStorage.setItem(name, value);
    try {
      await appStatePut(name, value);
    } catch {
      // Keep localStorage as a reliable preview/offline fallback.
    }
  },
  async removeItem(name) {
    window.localStorage.removeItem(name);
    try {
      await appStateDelete(name);
    } catch {
      // Browser preview and older native builds may not expose delete yet.
    }
  },
};

function containsSensitiveAppState(name: string, value: string) {
  const haystack = `${name} ${value}`.toLowerCase();
  return [
    "password",
    "passphrase",
    "privatekey",
    "private_key",
    "ephemeralpassword",
    "ephemeral_password",
  ].some((needle) => haystack.includes(needle));
}
