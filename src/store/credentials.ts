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
  add: (input: Omit<Credential, "id" | "createdAt"> & { password?: string }) => Promise<Credential>;
  update: (id: string, patch: Partial<Credential>, password?: string) => Promise<void>;
  savePassword: (id: string, password: string) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  loadPassword: (id: string) => Promise<string | null>;
}

function credAccount(id: string) {
  return `netssh:cred:${id}`;
}

type PersistableCredential = Credential & Record<string, unknown>;

function sanitizeCredentialForPersistence(credential: PersistableCredential): Credential {
  const {
    password: _password,
    passphrase: _passphrase,
    privateKey: _privateKey,
    private_key: _private_key,
    ephemeralPassword: _ephemeralPassword,
    ephemeral_password: _ephemeral_password,
    secret: _secret,
    ...safe
  } = credential;
  return safe;
}

export const useCredentials = create<CredentialsState>()(
  persist(
    (set, get) => ({
      credentials: [],

      add: async (input: Omit<Credential, "id" | "createdAt"> & { password?: string }) => {
        const id = `cred-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const { password, ...meta } = input;
        let hasPassword = false;
        if (password) {
          try {
            await credStore(credAccount(id), password);
            hasPassword = true;
          } catch {
            hasPassword = false;
          }
        }
        const cred: Credential = {
          ...meta,
          id,
          createdAt: Date.now(),
          hasPassword,
        };
        set({ credentials: [...get().credentials, cred] });
        return cred;
      },

      update: async (id, patch, password) => {
        const existing = get().credentials.find((c) => c.id === id);
        if (!existing) return;
        const { password: _ignoredPassword, ...safePatch } = patch as Partial<Credential> & { password?: string };
        const next: Credential = { ...existing, ...safePatch };
        if (password !== undefined) {
          try {
            if (password) {
              await credStore(credAccount(id), password);
              next.hasPassword = true;
            } else {
              await credDelete(credAccount(id));
              next.hasPassword = false;
            }
          } catch {
            next.hasPassword = existing.hasPassword;
          }
        }
        set({
          credentials: get().credentials.map((c) =>
            c.id === id ? next : c
          ),
        });
      },

      savePassword: async (id, password) => {
        const existing = get().credentials.find((c) => c.id === id);
        if (!existing || !password) return false;
        try {
          await credStore(credAccount(id), password);
          set({
            credentials: get().credentials.map((c) =>
              c.id === id ? { ...c, hasPassword: true } : c
            ),
          });
          return true;
        } catch {
          return false;
        }
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
          // Never write secrets to localStorage - keep only profile metadata.
          return sanitizeCredentialForPersistence(c as PersistableCredential);
        }),
      }),
    }
  )
);
