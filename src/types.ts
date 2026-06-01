// Shared types between Rust commands and the React app.
// Keep these in sync with the structs in `src-tauri/src/commands.rs`.

export type GroupId = "shanghai" | "pr-office" | "wuxi" | "cloud" | string;
export type EnvTag = "prod" | "stage" | "dev" | string;
export type HostStatus = "ok" | "warn" | "off";
export type DeployScope = "local" | "cloud" | "hybrid" | "unknown";
export type CloudProvider = "aws" | "azure" | "gcp" | "aliyun" | "tencent" | "cloudflare" | "other";

export interface Host {
  id: string;
  alias: string;
  hostname: string;
  user: string;
  port: number;
  identityFile?: string;
  group: GroupId;
  role?: string;
  env?: EnvTag;
  tags?: string[];
  notes?: string;
  pinned?: boolean;
  hue?: string;
  latency?: number | null;
  status?: HostStatus;
  deployScope?: DeployScope;
  cloudProvider?: CloudProvider;
  region?: string;
  iconOverride?: string;
  /** Ephemeral one-shot password used by the manual-connect card. Never persisted. */
  ephemeralPassword?: string;
}

export interface Group {
  id: GroupId;
  name: string;
  color: string;
  subnet?: string;
}

export interface Snippet {
  id: string;
  category: string;
  name: string;
  desc: string;
  cmd: string;
  tags: string[];
  shells: string[];
}

export interface Tab {
  id: string;
  kind: "host" | "local" | "settings" | "snippets" | "home";
  hostId?: string;
  shellId?: string;
  title: string;
  hue?: string;
  connected?: boolean;
  /** Home tabs are pinned — they cannot be closed */
  pinned?: boolean;
}

export interface ShellInfo {
  id: string;
  name: string;
  path: string;
  is_default: boolean;
}

export interface Identity {
  id: string;
  name: string;
  user: string;
  identityFile?: string;
  notes?: string;
  createdAt: number;
}

export interface SshKey {
  id: string;
  name: string;
  key_type: string;
  fingerprint: string;
  path: string;
}

export type Lang = "en" | "zh";
export type Theme = "purple" | "blue" | "mica";
