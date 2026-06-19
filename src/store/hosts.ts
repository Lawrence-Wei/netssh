// Hosts store. Combines ssh_config (read-only source of truth) with
// Netssh-managed metadata (tags, notes, favorite, lastConnectedAt, hue) from SQLite.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { HOST_GROUPS, MOCK_HOSTS } from "../config/defaults";
import { parseSshConfig } from "../api/tauri";
import { slugify } from "../utils/slugify";
import { canonicalGroupColor, canonicalGroupId, canonicalGroupName } from "../utils/groups";
import type { Host, Group, GroupId } from "../config/types";
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
  reorderHost: (hostId: string, targetOrder: number, targetGroupId?: string) => void;
}

const HUES = ["#285c5f", "#b06438", "#6e8b57", "#7c5a8c", "#a32a26", "#3b6e8f"];
const UNASSIGNED_GROUP_ID = "unassigned";

function nextHue(index: number) {
  return HUES[index % HUES.length];
}

function groupKey(value?: string | null) {
  return slugify(value || "");
}

function isUnassignedGroup(value?: string | null) {
  return canonicalGroupId(value) === UNASSIGNED_GROUP_ID || groupKey(value) === UNASSIGNED_GROUP_ID;
}

function buildGroupLookup(groups: Group[]) {
  const lookup = new Map<string, GroupId>();
  groups.forEach((group) => {
    const id = String(group.id || "").trim();
    const name = String(group.name || "").trim();
    const canonicalId = canonicalGroupId(id) || canonicalGroupId(name);
    if (id) lookup.set(id.toLowerCase(), group.id);
    const idKey = groupKey(id);
    if (idKey) lookup.set(idKey, group.id);
    const nameKey = groupKey(name);
    if (nameKey) lookup.set(nameKey, group.id);
    if (canonicalId) {
      if (id) lookup.set(id.toLowerCase(), canonicalId);
      if (idKey) lookup.set(idKey, canonicalId);
      if (nameKey) lookup.set(nameKey, canonicalId);
      lookup.set(canonicalId, canonicalId);
    }
  });
  lookup.set(UNASSIGNED_GROUP_ID, UNASSIGNED_GROUP_ID);
  return lookup;
}

function resolveKnownGroupId(value: string | undefined, groups: Group[]) {
  const raw = String(value || "").trim();
  if (!raw || isUnassignedGroup(raw)) return UNASSIGNED_GROUP_ID;
  const canonicalId = canonicalGroupId(raw);
  if (canonicalId) return canonicalId;

  const lookup = buildGroupLookup(groups);
  return lookup.get(raw.toLowerCase()) || lookup.get(groupKey(raw)) || raw;
}

function normalizeHostsData(hosts: Host[], groups: Group[]) {
  const remap = new Map<string, GroupId>();
  const lookup = new Map<string, GroupId>();
  const normalizedGroups: Group[] = [];

  const remember = (raw: string | undefined, id: GroupId) => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return;
    remap.set(trimmed, id);
    lookup.set(trimmed.toLowerCase(), id);
    const key = groupKey(trimmed);
    if (key) lookup.set(key, id);
  };

  const addGroup = (group: Group) => {
    const rawId = String(group.id || "").trim();
    const rawName = String(group.name || "").trim();
    if (!rawId && !rawName) return;
    const canonicalId = canonicalGroupId(rawId) || canonicalGroupId(rawName);

    if (canonicalId) {
      const existing = lookup.get(UNASSIGNED_GROUP_ID);
      if (canonicalId === UNASSIGNED_GROUP_ID) {
        if (!existing) {
          const fallback = HOST_GROUPS.find((item) => item.id === UNASSIGNED_GROUP_ID);
          normalizedGroups.push(fallback || { id: UNASSIGNED_GROUP_ID, name: "Unassigned", color: "#897e6e" });
          lookup.set(UNASSIGNED_GROUP_ID, UNASSIGNED_GROUP_ID);
        }
      } else if (!lookup.get(canonicalId)) {
        normalizedGroups.push({
          ...group,
          id: canonicalId,
          name: canonicalGroupName(canonicalId),
          color: group.color || canonicalGroupColor(canonicalId),
        });
        lookup.set(canonicalId, canonicalId);
      }
      remember(rawId, canonicalId);
      remember(rawName, canonicalId);
      return;
    }

    if (isUnassignedGroup(rawId) || isUnassignedGroup(rawName)) {
      const existing = lookup.get(UNASSIGNED_GROUP_ID);
      if (!existing) {
        const fallback = HOST_GROUPS.find((item) => item.id === UNASSIGNED_GROUP_ID);
        normalizedGroups.push(fallback || { id: UNASSIGNED_GROUP_ID, name: "Unassigned", color: "#897e6e" });
        lookup.set(UNASSIGNED_GROUP_ID, UNASSIGNED_GROUP_ID);
      }
      remember(rawId, UNASSIGNED_GROUP_ID);
      remember(rawName, UNASSIGNED_GROUP_ID);
      return;
    }

    const id = (rawId || groupKey(rawName)) as GroupId;
    const duplicate = lookup.get(id.toLowerCase()) || lookup.get(groupKey(id)) || lookup.get(groupKey(rawName));
    if (duplicate) {
      remember(rawId, duplicate);
      remember(rawName, duplicate);
      return;
    }

    const normalized = {
      ...group,
      id,
      name: rawName || id,
    };
    normalizedGroups.push(normalized);
    remember(rawId, normalized.id);
    remember(rawName, normalized.id);
  };

  HOST_GROUPS.forEach(addGroup);
  groups.forEach(addGroup);

  const normalizedHosts = hosts.map((host) => {
    const rawGroup = String(host.group || "").trim();
    const group = remap.get(rawGroup) || lookup.get(rawGroup.toLowerCase()) || lookup.get(groupKey(rawGroup)) || UNASSIGNED_GROUP_ID;
    return group === host.group ? host : { ...host, group };
  });

  return {
    hosts: normalizedHosts,
    groups: normalizedGroups,
  };
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
          const merged = existing.map((h) => {
            const fresh = parsed.find((p) => p.alias === h.alias);
            if (!fresh) return h;
            return {
              ...h,
              hostname: fresh.hostname ?? h.hostname,
              user: fresh.user ?? h.user,
              port: fresh.port ?? h.port,
              identityFile: fresh.identityFile ?? h.identityFile,
              aliases: fresh.aliases ?? h.aliases,
              role: fresh.role ?? h.role,
              tags: mergeTags(h.tags, fresh.tags),
              iconOverride: fresh.iconOverride ?? h.iconOverride,
              source: fresh.source ?? h.source,
              group: fresh.group && !isUnassignedGroup(fresh.group)
                ? resolveKnownGroupId(fresh.group, get().groups)
                : h.group,
            };
          });
          parsed.forEach((host, index) => {
            const dup = existing.find((h) => h.alias === host.alias);
            if (dup) return;
            merged.push({
              ...host,
              id: host.id || `cfg-${host.alias}`,
              group: resolveKnownGroupId(host.group, get().groups),
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
          group: resolveKnownGroupId(raw.group, get().groups),
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
          let groupId = resolveKnownGroupId(raw.group, nextGroups);
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
        const nextPatch = patch.group
          ? { ...patch, group: resolveKnownGroupId(patch.group, get().groups) }
          : patch;
        set({
          hosts: get().hosts.map((h) => (h.id === id ? { ...h, ...nextPatch } : h)),
        });
      },

      removeHost: (id) => {
        set({ hosts: get().hosts.filter((h) => h.id !== id) });
      },

      addGroup: (name, subnet) => {
        const existingId = resolveKnownGroupId(name, get().groups);
        const existing = get().groups.find((group) => group.id === existingId);
        if (existing) return existing;

        const slug = canonicalGroupId(name) || slugify(name) || `site-${Date.now()}`;
        const id = get().groups.find((g) => g.id === slug)
          ? `${slug}-${Date.now()}`
          : slug;
        const group: Group = {
          id,
          name: canonicalGroupId(name) ? canonicalGroupName(id) : name,
          color: canonicalGroupId(name) ? canonicalGroupColor(id) : nextHue(get().groups.length),
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
        const targetGroupId = resolveKnownGroupId(groupId, get().groups);
        set({
          hosts: get().hosts.map((host) =>
            host.id === hostId ? { ...host, group: targetGroupId } : host
          ),
        });
      },

      reorderHost: (hostId, targetOrder, targetGroupId) => {
        set({
          hosts: get().hosts.map((host) => {
            if (host.id !== hostId) return host;
            const next = { ...host, order: targetOrder };
            if (targetGroupId !== undefined) {
              next.group = resolveKnownGroupId(targetGroupId, get().groups);
            }
            return next;
          }),
        });
      },
    }),
    {
      name: "netssh.hosts",
      storage: createJSONStorage(() => appStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<Pick<HostsState, "hosts" | "groups">> | undefined;
        const data = normalizeHostsData(
          persisted?.hosts || currentState.hosts,
          persisted?.groups || currentState.groups
        );
        return {
          ...currentState,
          hosts: data.hosts,
          groups: data.groups,
        };
      },
      partialize: (state) => ({
        hosts: normalizeHostsData(state.hosts, state.groups).hosts.map(({ ephemeralPassword: _ephemeralPassword, ...rest }) => rest),
        groups: normalizeHostsData(state.hosts, state.groups).groups,
      }),
    }
  )
);

function mergeTags(current?: string[], incoming?: string[]) {
  if (!incoming?.length) return current;
  const tags = [...(current || [])];
  for (const tag of incoming) {
    if (!tags.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      tags.push(tag);
    }
  }
  return tags;
}
