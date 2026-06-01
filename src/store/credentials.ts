// Credential vault. Stores reusable login profiles (name + user + key + tags)
// grouped by purpose (root, switch, ops, etc.).
//
// SECURITY: passwords are NEVER persisted to localStorage.  They go to the
// OS Credential Manager (Windows Credential Manager on Windows, Keychain on
// macOS, etc.) via the Tauri `cred_store` / `cred_load` commands.  The zustand
// store only keeps metadata and a boolean flag `hasPassword`.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { credDelete, credLoad, credStore } from "../api/tauri";

export interface Credential {
  id: string;
  name: string;
  group: string;
  user: string;
  /** true if a password was saved to the OS credential store */
  hasPassword?: boolean;
  identityFile?: string;
  notes?: string;
  tags?: string[];
  createdAt: number;
}

interface CredentialsState {
  credentials: Credential[];
  add: (input: Omit<Credential, "id" | "createdAt">) => Promise<Credential>;
  update: (id: string, patch: Partial<Credential>, password?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  loadPassword: (id: string) => Promise<string | null>;
}

function credAccount(id: string) {
  return `netssh:cred:${id}`;
}

export const useCredentials = create<CredentialsState>()(
  persist(
    (set, get) => ({
      credentials: [],

      add: async (input: Omit<Credential, "id" | "createdAt"> & { password?: string }) => {
        const id = `cred-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const { password, ...meta } = input;
        const cred: Credential = {
          ...meta,
          id,
          createdAt: Date.now(),
          hasPassword: !!password,
        };
        if (password) {
          try { await credStore(credAccount(id), password); } catch { /* ignore */ }
        }
        set({ credentials: [...get().credentials, cred] });
        return cred;
      },

      update: async (id, patch, password) => {
        const existing = get().credentials.find((c) => c.id === id);
        if (!existing) return;
        const next: Credential = { ...existing, ...patch };
        if (password !== undefined) {
          next.hasPassword = !!password;
          try {
            if (password) await credStore(credAccount(id), password);
            else await credDelete(credAccount(id));
          } catch { /* ignore */ }
        }
        set({
          credentials: get().credentials.map((c) =>
            c.id === id ? next : c
          ),
        });
      },

      remove: async (id) => {
        try { await credDelete(credAccount(id)); } catch { /* ignore */ }
        set({ credentials: get().credentials.filter((c) => c.id !== id) });
      },

      loadPassword: async (id) => {
        try {
          return await credLoad(credAccount(id));
        } catch {
          return null;
        }
      },
    }),
    {
      name: "netssh.credentials",
      partialize: (state) => ({
        credentials: state.credentials.map((c) => {
          // Never write password to localStorage — keep only metadata
          const { ...safe } = c;
          return safe;
        }),
      }),
    }
  )
);
