// Hosts store. Combines ssh_config (read-only source of truth) with
// Netssh-managed metadata (tags, notes, favorite, lastConnectedAt, hue) from SQLite.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { HOST_GROUPS, MOCK_HOSTS } from "../config/defaults";
import { parseSshConfig } from "../api/tauri";
import { slugify } from "../utils/slugify";
import type { Host, Group } from "../config/types";
import { appStorage } from "./persistence";

interface HostsState {
  hosts: Host[];
  groups: Group[];
  loadFromSshConfig: () => Promise<void>;
  togglePin: (id: string) => void;
  toggleFavorite: (id: string) => void;
  markConnected: (id: string, at?: number) => void;
  setTags: (id: string, tags: string[]) => void;
  addHost: (host: Omit<Host, "id"> & { id?: string }) => Host;
  importHosts: (list: Omit<Host, "id">[]) => Host[];
  updateHost: (id: string, patch: Partial<Host>) => void;
  removeHost: (id: string) => void;
  addGroup: (name: string, subnet?: string) => Group;
  renameGroup: (id: string, name: string, subnet?: string) => void;
  removeGroup: (id: string) => void;
  moveHostToGroup: (hostId: string, groupId: string) => void;
}

const HUES = ["#285c5f", "#b06438", "#6e8b57", "#7c5a8c", "#a32a26", "#3b6e8f"];

function nextHue(index: number) {
  return HUES[index % HUES.length];
}

export const useHosts = create<HostsState>()(
  persist(
    (set, get) => ({
      hosts: MOCK_HOSTS,
      groups: HOST_GROUPS,

      loadFromSshConfig: async () => {
        try {
          const parsed = await parseSshConfig();
          if (parsed.length === 0) return;

          const existing = get().hosts;
          const merged = [...existing];
          parsed.forEach((host, index) => {
            const dup = existing.find((h) => h.alias === host.alias);
            if (dup) return;
            merged.push({
              ...host,
              id: host.id || `cfg-${host.alias}`,
              group: host.group || "unassigned",
              hue: host.hue || nextHue(existing.length + index),
              status: host.status || "off",
              latency: host.latency ?? null,
              favorite: host.favorite ?? host.pinned ?? false,
            });
          });
          set({ hosts: merged });
        } catch {
          // Silently ignore ssh_config parse failures; user can still import manually.
        }
      },

      togglePin: (id) => {
        set({
          hosts: get().hosts.map((h) =>
            h.id === id ? { ...h, favorite: !(h.favorite ?? h.pinned), pinned: !(h.favorite ?? h.pinned) } : h
          ),
        });
      },

      toggleFavorite: (id) => {
        set({
          hosts: get().hosts.map((h) =>
            h.id === id ? { ...h, favorite: !(h.favorite ?? h.pinned), pinned: !(h.favorite ?? h.pinned) } : h
          ),
        });
      },

      markConnected: (id, at = Date.now()) => {
        set({
          hosts: get().hosts.map((h) =>
            h.id === id ? { ...h, lastConnectedAt: at, status: "ok" } : h
          ),
        });
      },

      setTags: (id, tags) => {
        set({ hosts: get().hosts.map((h) => (h.id === id ? { ...h, tags } : h)) });
      },

      addHost: (raw) => {
        const id = raw.id || `host-${Date.now()}`;
        const host: Host = {
          ...raw,
          id,
          port: raw.port ?? 22,
          status: raw.status ?? "off",
          hue: raw.hue ?? nextHue(get().hosts.length),
          favorite: raw.favorite ?? raw.pinned ?? false,
        };
        set({ hosts: [...get().hosts, host] });
        return host;
      },

      importHosts: (list) => {
        const existing = get().hosts;
        const existingAliases = new Set(existing.map((host) => host.alias.toLowerCase()));
        const groups = get().groups;
        const knownGroupIds = new Set(groups.map((g) => g.id));
        const created: Host[] = [];
        const nextGroups: Group[] = [...groups];
        list.forEach((raw, idx) => {
          if (raw.alias && existingAliases.has(raw.alias.toLowerCase())) return;
          let groupId = raw.group || "unassigned";
          if (!knownGroupIds.has(groupId)) {
            const slug = slugify(groupId) || `site-${Date.now()}-${idx}`;
            const id = knownGroupIds.has(slug) ? `${slug}-${Date.now()}` : slug;
            const newGroup: Group = {
              id,
              name: groupId,
              color: nextHue(nextGroups.length),
            };
            nextGroups.push(newGroup);
            knownGroupIds.add(id);
            groupId = id;
          }
          const host: Host = {
            ...raw,
            id: `imp-${Date.now()}-${idx}`,
            group: groupId,
            port: raw.port ?? 22,
            status: raw.status ?? "off",
            latency: raw.latency ?? null,
            hue: raw.hue ?? nextHue(existing.length + created.length),
            favorite: raw.favorite ?? raw.pinned ?? false,
          };
          existingAliases.add(host.alias.toLowerCase());
          created.push(host);
        });
        set({
          hosts: [...existing, ...created],
          groups: nextGroups,
        });
        return created;
      },

      updateHost: (id, patch) => {
        set({
          hosts: get().hosts.map((h) => (h.id === id ? { ...h, ...patch } : h)),
        });
      },

      removeHost: (id) => {
        set({ hosts: get().hosts.filter((h) => h.id !== id) });
      },

      addGroup: (name, subnet) => {
        const slug = slugify(name) || `site-${Date.now()}`;
        const id = get().groups.find((g) => g.id === slug)
          ? `${slug}-${Date.now()}`
          : slug;
        const group: Group = {
          id,
          name,
          color: nextHue(get().groups.length),
          subnet,
        };
        set({ groups: [...get().groups, group] });
        return group;
      },

      renameGroup: (id, name, subnet) => {
        set({
          groups: get().groups.map((g) => (g.id === id ? { ...g, name, subnet } : g)),
        });
      },

      removeGroup: (id) => {
        // hosts in the removed group fall back to "unassigned"
        set({
          groups: get().groups.filter((g) => g.id !== id),
          hosts: get().hosts.map((h) =>
            h.group === id ? { ...h, group: "unassigned" } : h
          ),
        });
      },

      moveHostToGroup: (hostId, groupId) => {
        set({
          hosts: get().hosts.map((host) =>
            host.id === hostId ? { ...host, group: groupId } : host
          ),
        });
      },
    }),
    {
      name: "netssh.hosts",
      storage: createJSONStorage(() => appStorage),
      partialize: (state) => ({
        hosts: state.hosts.map(({ ephemeralPassword: _ephemeralPassword, ...rest }) => rest),
        groups: state.groups,
      }),
    }
  )
);
