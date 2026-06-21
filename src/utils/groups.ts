import type { Group, GroupId, Host, Lang } from "../config/types";
import { t } from "./i18n";
import { slugify } from "./slugify";

const UNASSIGNED_GROUP_ID = "unassigned";
const UNASSIGNED_COLOR = "#897e6e";
const CANONICAL_GROUPS: Record<string, { name: string; color: string }> = {
  shanghai: { name: "Shanghai", color: "#8f7a65" },
  "pr-office": { name: "PR / E20C", color: "#7f7395" },
  wuxi: { name: "Wuxi", color: "#6f7f95" },
  cloud: { name: "Cloud", color: "#5f7fb0" },
  unassigned: { name: "Unassigned", color: UNASSIGNED_COLOR },
};

const DEFAULT_GROUP_LABELS: Record<string, string[]> = {
  shanghai: ["Shanghai", "上海"],
  "pr-office": ["PR / E20C"],
  wuxi: ["Wuxi", "无锡"],
  cloud: ["Cloud", "云", "云端"],
  unassigned: ["Unassigned", "未分配"],
};

export interface HostGroupBucket {
  group: Group;
  hosts: Host[];
}

export function isUnassignedGroup(value?: string | null) {
  return canonicalGroupId(value) === UNASSIGNED_GROUP_ID;
}

export function canonicalGroupId(value?: string | null): GroupId | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  const key = slugify(raw);

  if (key === UNASSIGNED_GROUP_ID || lower.includes("未分配")) return UNASSIGNED_GROUP_ID;
  if (key === "shanghai" || key.startsWith("shanghai-") || key === "sh" || key.startsWith("sh-") || key.includes("shgw") || lower.includes("上海")) {
    return "shanghai";
  }
  if (key === "wuxi" || key.startsWith("wuxi-") || key === "wx" || key.startsWith("wx-") || lower.includes("无锡")) {
    return "wuxi";
  }
  if (key === "pr" || key.startsWith("pr-") || key.includes("e20c") || lower.includes("办公室")) {
    return "pr-office";
  }
  if (key === "cloud" || key.startsWith("cloud-") || key.includes("cloudcone") || key.includes("vps") || key.includes("aliyun") || key.includes("tencent") || key.includes("aws") || key.includes("azure") || key.includes("gcp") || lower.includes("云")) {
    return "cloud";
  }
  return undefined;
}

export function canonicalGroupName(id: GroupId) {
  return CANONICAL_GROUPS[id]?.name || id;
}

export function canonicalGroupColor(id: GroupId, fallback = UNASSIGNED_COLOR) {
  return CANONICAL_GROUPS[id]?.color || fallback;
}

export function displayGroupName(group: Group, lang: Lang) {
  const canonicalId = canonicalGroupId(group.id) || canonicalGroupId(group.name) || group.id;
  const customName = customGroupName(canonicalId, group.name);
  if (customName) return customName;
  const key = `groups.${canonicalId}`;
  const translated = t(key, lang);
  if (translated !== key) return translated;
  return canonicalGroupName(canonicalId);
}

export function storageGroupName(id: GroupId, name?: string | null) {
  return customGroupName(id, name) || canonicalGroupName(id);
}

export function resolveGroupIdForDisplay(value: string | undefined, groups: Group[]) {
  const raw = String(value || "").trim();
  if (!raw) return UNASSIGNED_GROUP_ID;
  const canonicalId = canonicalGroupId(raw);
  if (canonicalId) return canonicalId;

  const rawLower = raw.toLowerCase();
  const rawKey = slugify(raw);
  const match = groups.find((group) => {
    const id = String(group.id || "").trim();
    const name = String(group.name || "").trim();
    return (
      id.toLowerCase() === rawLower ||
      slugify(id) === rawKey ||
      slugify(name) === rawKey
    );
  });
  const matchCanonicalId = canonicalGroupId(match?.id) || canonicalGroupId(match?.name);
  if (matchCanonicalId) return matchCanonicalId;
  return match?.id || raw;
}

export function groupHostsForDisplay(hosts: Host[], groups: Group[], unassignedName: string): HostGroupBucket[] {
  const displayGroups = normalizeGroupsForDisplay(groups, unassignedName);
  const buckets = new Map<GroupId, HostGroupBucket>();

  displayGroups.forEach((group) => {
    buckets.set(group.id, { group, hosts: [] });
  });

  hosts.forEach((host) => {
    const groupId = resolveGroupIdForDisplay(host.group, groups);
    let bucket = buckets.get(groupId);
    if (!bucket) {
      const group: Group = {
        id: groupId,
        name: canonicalGroupName(groupId),
        color: canonicalGroupColor(groupId),
      };
      bucket = { group, hosts: [] };
      buckets.set(groupId, bucket);
    }
    bucket.hosts.push(host);
  });

  return [...buckets.values()].filter((bucket) => {
    return bucket.hosts.length > 0 || !isUnassignedGroup(bucket.group.id);
  });
}

function normalizeGroupsForDisplay(groups: Group[], unassignedName: string) {
  const normalized: Group[] = [];
  const seen = new Set<string>();

  const add = (group: Group) => {
    const rawId = String(group.id || "").trim();
    const rawName = String(group.name || "").trim();
    const id = canonicalGroupId(rawId) || canonicalGroupId(rawName) || (rawId || slugify(rawName)) as GroupId;
    const key = slugify(id);
    if (!id || seen.has(key)) return;
    seen.add(key);
    const customName = customGroupName(id, rawName);
    normalized.push({
      ...group,
      id,
      name: id === UNASSIGNED_GROUP_ID ? unassignedName : customName || canonicalGroupName(id),
      color: group.color || canonicalGroupColor(id),
    });
  };

  groups.forEach(add);

  return normalized;
}

function customGroupName(id: GroupId, name?: string | null) {
  const raw = String(name || "").trim();
  if (!raw || id === UNASSIGNED_GROUP_ID || isDamagedGroupLabel(raw)) return "";
  const defaults = DEFAULT_GROUP_LABELS[id] || [canonicalGroupName(id)];
  const rawKey = labelKey(raw);
  const defaultMatch = defaults.some((label) => labelKey(label) === rawKey);
  return defaultMatch ? "" : raw;
}

function isDamagedGroupLabel(value: string) {
  return value.includes("�") || /\?{2,}/.test(value);
}

function labelKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
