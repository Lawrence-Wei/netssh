// Identity store — reusable SSH login profiles (root, Lawrence, switch-admin, etc.)
// Sensitive data goes to Windows Credential Manager. This store keeps only metadata.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { credDelete, credStore, credLoad } from "../api/tauri";
import type { Identity } from "../config/types";

type SensitiveIdentityInput = {
  password?: string;
  passphrase?: string;
  privateKey?: string;
  private_key?: string;
  ephemeralPassword?: string;
  ephemeral_password?: string;
  secret?: string;
};

interface IdentityState {
  identities: Identity[];
  add: (input: { name: string; user: string; identityFile?: string; notes?: string; password?: string }) => Promise<Identity>;
  update: (id: string, patch: Partial<Identity>, password?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  loadPassword: (id: string) => Promise<string | null>;
}

function identAccount(id: string) {
  return `netssh:ident:${id}`;
}

function sanitizeIdentityForPersistence(identity: Identity & Record<string, unknown>): Identity {
  const {
    password: _password,
    passphrase: _passphrase,
    privateKey: _privateKey,
    private_key: _private_key,
    ephemeralPassword: _ephemeralPassword,
    ephemeral_password: _ephemeral_password,
    secret: _secret,
    ...safe
  } = identity;
  return safe;
}

export const useIdentities = create<IdentityState>()(
  persist(
    (set, get) => ({
      identities: [],

      add: async (input) => {
        const id = `ident-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const identity: Identity = {
          id,
          name: input.name,
          user: input.user,
          identityFile: input.identityFile,
          notes: input.notes,
          createdAt: Date.now(),
        };
        if (input.password) {
          try { await credStore(identAccount(id), input.password); } catch { /* ignore */ }
        }
        set({ identities: [...get().identities, identity] });
        return identity;
      },

      update: async (id, patch, password) => {
        const existing = get().identities.find((i) => i.id === id);
        if (!existing) return;
        const {
          password: _password,
          passphrase: _passphrase,
          privateKey: _privateKey,
          private_key: _private_key,
          ephemeralPassword: _ephemeralPassword,
          ephemeral_password: _ephemeral_password,
          secret: _secret,
          ...safePatch
        } = patch as Partial<Identity> & SensitiveIdentityInput;
        const next = { ...existing, ...safePatch };
        if (password !== undefined) {
          try {
            if (password) await credStore(identAccount(id), password);
            else await credDelete(identAccount(id));
          } catch { /* ignore */ }
        }
        set({
          identities: get().identities.map((i) => (i.id === id ? next : i)),
        });
      },

      remove: async (id) => {
        try { await credDelete(identAccount(id)); } catch { /* ignore */ }
        set({ identities: get().identities.filter((i) => i.id !== id) });
      },

      loadPassword: async (id) => {
        try { return await credLoad(identAccount(id)); } catch { return null; }
      },
    }),
    {
      name: "netssh.identities",
      partialize: (state) => ({
        identities: state.identities.map((identity) =>
          sanitizeIdentityForPersistence(identity as Identity & Record<string, unknown>)
        ),
      }),
    }
  )
);
