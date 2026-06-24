import type { Host } from "../config/types";
import type { Credential } from "../store/credentials";
import { deviceTypeFromHost } from "./deployScope";

export function findCredentialForHost(host: Host, credentials: Credential[]) {
  const explicit = host.credentialProfileId
    ? credentials.find((item) => item.id === host.credentialProfileId)
    : undefined;
  if (explicit) return explicit;

  const ranked = credentials
    .map((credential) => ({
      credential,
      score: credentialMatchScore(host, credential),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.credential.createdAt - a.credential.createdAt);

  return ranked[0]?.credential;
}

export function hostCredentialTags(host: Host, username = host.user) {
  const candidates = [
    host.group,
    host.role,
    host.assetType,
    host.iconOverride,
    deviceTypeFromHost(host),
    ...(host.tags || []),
  ];
  const tags = new Set<string>();
  for (const candidate of candidates) {
    const tag = candidate?.trim();
    if (!tag || tag === "auto") continue;
    tags.add(tag);
  }
  for (const marker of hostCredentialMarkers(host, username)) {
    tags.add(marker);
  }
  return Array.from(tags);
}

export function mergeHostCredentialTags(current: string[] | undefined, host: Host, username = host.user) {
  const tags = new Set(current || []);
  for (const marker of hostCredentialTags(host, username)) {
    tags.add(marker);
  }
  return Array.from(tags);
}

function credentialMatchScore(host: Host, credential: Credential) {
  const username = normalized(credential.user);
  const hostUser = normalized(host.user);
  if (!username) return 0;
  if (!credential.hasPassword && !credential.identityFile) return 0;

  const tags = new Set((credential.tags || []).map(normalized));
  const hostName = normalized(host.hostname);
  const alias = normalized(host.alias);
  const aliases = (host.aliases || []).map(normalized).filter(Boolean);
  const port = host.port || 22;
  const credentialDirectMarker = hostName ? `target:${username}@${hostName}:${port}` : "";
  if (credentialDirectMarker && tags.has(credentialDirectMarker)) return 100;

  const hostDirectMarker = hostUser && hostName ? `target:${hostUser}@${hostName}:${port}` : "";
  if (hostDirectMarker && tags.has(hostDirectMarker)) return 100;

  const tagHasTargetHost = hostName && tags.has(`target-host:${hostName}`);
  const tagHasTargetAlias = [alias, ...aliases].some((value) => value && tags.has(`target-alias:${value}`));
  const targetPortTags = Array.from(tags).filter((tag) => tag.startsWith("target-port:"));
  const hasConflictingPort = targetPortTags.length > 0 && !tags.has(`target-port:${port}`);
  if ((tagHasTargetHost || tagHasTargetAlias) && !hasConflictingPort) {
    return username === hostUser ? 92 : 90;
  }

  if (!hostUser || username !== hostUser) return 0;

  const credentialName = normalized(credential.name);
  const notes = normalized(credential.notes);
  const values = new Set([hostName, alias, ...aliases].filter(Boolean));

  if (hostName && notes === hostName) return 80;
  if (hostName && credentialName === hostName) return 76;
  if (alias && credentialName === alias && (!notes || notes === hostName)) return 72;
  if (Array.from(values).some((value) => tags.has(value))) return 64;
  if (aliases.some((value) => credentialName === value) && (!notes || notes === hostName)) return 58;
  const reusableScore = reusableCredentialScore(host, credential, tags);
  if (reusableScore > 0) return reusableScore;
  return 0;
}

function reusableCredentialScore(host: Host, credential: Credential, credentialTags: Set<string>) {
  const hostTags = reusableHostTags(host, true);
  const strongHostTags = reusableHostTags(host, false);
  const credentialGroup = normalized(credential.group);
  const matches = new Set<string>();

  for (const tag of hostTags) {
    if (credentialTags.has(tag)) matches.add(tag);
  }
  if (credentialGroup && hostTags.has(credentialGroup)) {
    matches.add(credentialGroup);
  }

  if (matches.size === 0) return 0;
  if (!Array.from(matches).some((tag) => strongHostTags.has(tag))) return 0;
  return 44 + Math.min(12, matches.size * 4);
}

function reusableHostTags(host: Host, includeGroup: boolean) {
  const values = [
    includeGroup ? host.group : "",
    host.role,
    host.assetType,
    host.iconOverride,
    deviceTypeFromHost(host),
    ...(host.tags || []),
  ];
  return new Set(values.map(normalized).filter(isReusableCredentialTag));
}

function isReusableCredentialTag(value: string) {
  if (!value || value === "auto") return false;
  if (value.startsWith("target:") || value.startsWith("target-")) return false;
  return !["ssh", "root", "admin", "local", "cloud", "prod", "stage", "dev", "unassigned"].includes(value);
}

function hostCredentialMarkers(host: Host, username: string) {
  const user = normalized(username);
  const hostname = normalized(host.hostname);
  const port = host.port || 22;
  const aliases = [host.alias, ...(host.aliases || [])]
    .map(normalized)
    .filter(Boolean);
  return [
    user && hostname ? `target:${user}@${hostname}:${port}` : "",
    hostname ? `target-host:${hostname}` : "",
    user ? `target-user:${user}` : "",
    `target-port:${port}`,
    ...aliases.map((alias) => `target-alias:${alias}`),
  ].filter(Boolean);
}

function normalized(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}
