import type { Host } from "../config/types";
import { deployScope } from "./deployScope";

export type HostListFilter = "all" | "favorite" | "recent" | "local" | "cloud";

interface HostFilterOptions {
  query: string;
  filter: HostListFilter;
}

export function filterHostsForInventory(hosts: Host[], options: HostFilterOptions) {
  let list = [...hosts].filter((host) => host.alias.trim());
  const { filter, query } = options;

  if (filter === "favorite") list = list.filter(isFavoriteHost);
  if (filter === "recent") list = list.filter((host) => Boolean(host.lastConnectedAt));
  if (filter === "local") list = list.filter((host) => deployScope(host) === "local");
  if (filter === "cloud") list = list.filter((host) => deployScope(host) === "cloud");

  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery) {
    list = list.filter((host) => hostMatchesQuery(host, normalizedQuery));
  }

  return list;
}

export function sortHostsForSidebar(hosts: Host[], filter: HostListFilter) {
  if (filter === "recent") {
    return [...hosts].sort((a, b) => (b.lastConnectedAt || 0) - (a.lastConnectedAt || 0));
  }

  const fallbackOrder = new Map<string, number>();
  [...hosts]
    .sort(baseHostComparator)
    .forEach((host, index) => fallbackOrder.set(host.id, index));

  return [...hosts].sort((a, b) => {
    const orderA = a.order ?? fallbackOrder.get(a.id) ?? 0;
    const orderB = b.order ?? fallbackOrder.get(b.id) ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return baseHostComparator(a, b);
  });
}

export function isFavoriteHost(host: Host) {
  return Boolean(host.favorite ?? host.pinned);
}

function baseHostComparator(a: Host, b: Host) {
  const favoriteDelta = Number(isFavoriteHost(b)) - Number(isFavoriteHost(a));
  if (favoriteDelta !== 0) return favoriteDelta;
  const recentDelta = (b.lastConnectedAt || 0) - (a.lastConnectedAt || 0);
  if (recentDelta !== 0) return recentDelta;
  return a.alias.localeCompare(b.alias);
}

function hostMatchesQuery(host: Host, normalizedQuery: string) {
  return [
    host.alias,
    ...(host.aliases || []),
    host.hostname,
    host.role,
    host.user,
    host.env,
    host.cloudProvider,
    host.region,
    host.notes,
    host.assetType,
    host.iconOverride,
    (host.tags || []).join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}
