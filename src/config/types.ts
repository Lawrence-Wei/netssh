// Shared types between Rust commands and the React app.
// Keep these in sync with the structs in `src-tauri/src/commands.rs`.

export type GroupId = "shanghai" | "pr-office" | "wuxi" | "cloud" | string;
export type EnvTag = "prod" | "stage" | "dev" | string;
export type HostStatus = "ok" | "warn" | "off";
export type DeployScope = "local" | "cloud" | "hybrid" | "unknown";
export type CloudProvider = "aws" | "azure" | "gcp" | "aliyun" | "tencent" | "cloudflare" | "other";
export type ConnectionType = "ssh" | "serial";
export type SerialParity = "none" | "odd" | "even" | "mark" | "space";
export type SerialStopBits = 1 | 1.5 | 2;
export type SerialFlowControl = "none" | "software" | "hardware";
export type SerialLineEnding = "none" | "lf" | "cr" | "crlf";
export type TerminalCursorStyle = "block" | "underline" | "bar";
export type TerminalLocale = "system" | "C.UTF-8" | "en_US.UTF-8" | "zh_CN.UTF-8";
export type TerminalTimezone = "system" | "Asia/Shanghai" | "UTC";
export type AssetType =
  | "switch"
  | "router"
  | "firewall"
  | "gateway"
  | "nas"
  | "openwrt"
  | "linux-server"
  | "cloud-server"
  | "pve"
  | "pc"
  | "unknown";

export interface SerialProfile {
  portName?: string;
  baudRate: number;
  dataBits: 5 | 6 | 7 | 8;
  parity: SerialParity;
  stopBits: SerialStopBits;
  flowControl: SerialFlowControl;
  lineEnding: SerialLineEnding;
  presetId?: string;
}

export interface Host {
  id: string;
  alias: string;
  aliases?: string[];
  hostname: string;
  user: string;
  credentialProfileId?: string;
  port: number;
  identityFile?: string;
  group: GroupId;
  connectionType?: ConnectionType;
  serialProfile?: SerialProfile;
  assetType?: AssetType;
  source?: "manual" | "ssh-config" | "csv" | "xlsx" | "json" | "known-hosts";
  role?: string;
  env?: EnvTag;
  tags?: string[];
  notes?: string;
  favorite?: boolean;
  pinned?: boolean;
  lastConnectedAt?: number;
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
  shellPath?: string;
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
