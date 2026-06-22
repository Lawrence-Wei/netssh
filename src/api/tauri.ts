// Typed wrappers around Tauri's invoke() and event listeners.
// The frontend ONLY talks to Rust through this module.

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ConfigBackupProfile, Host, ReadonlyCheckId, ShellInfo, SerialFlowControl, SerialLineEnding, SerialParity, SerialStopBits, SshKey } from "../config/types";

type InvokeArgs = Record<string, unknown> | undefined;
type TauriEvent<T> = { payload: T };

function isMissingTauriError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("reading 'invoke'") ||
    message.includes('reading "invoke"') ||
    message.includes("__TAURI_INTERNALS__") ||
    message.includes("transformCallback") ||
    message.includes("transformcallback") ||
    message.includes("Tauri API")
  );
}

function browserLanguage() {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function localStateGet(key?: unknown) {
  if (typeof window === "undefined" || typeof key !== "string") return null;
  return window.localStorage.getItem(key);
}

function localStatePut(key?: unknown, value?: unknown) {
  if (typeof window === "undefined" || typeof key !== "string" || typeof value !== "string") return;
  if (containsSensitiveAppState(key, value)) {
    throw new Error("app_state_sensitive_value_rejected");
  }
  window.localStorage.setItem(key, value);
}

function containsSensitiveAppState(key: string, value: string) {
  const haystack = `${key} ${value}`.toLowerCase();
  return [
    "password",
    "passphrase",
    "privatekey",
    "private_key",
    "ephemeralpassword",
    "ephemeral_password",
  ].some((needle) => haystack.includes(needle));
}

function browserInvokeFallback<T>(cmd: string, args?: InvokeArgs): T {
  switch (cmd) {
    case "config_parse":
    case "shells_detect":
    case "keys_list":
    case "serial_list_ports":
      return [] as T;
    case "i18n_detect_system":
      return browserLanguage() as T;
    case "host_ping":
      return { ok: false, latency_ms: null } as T;
    case "autostart_status":
      return { enabled: false } as T;
    case "autostart_set_enabled":
      return { enabled: Boolean(args?.enabled) } as T;
    case "app_state_get":
      return localStateGet(args?.key) as T;
    case "app_state_put":
      localStatePut(args?.key, args?.value);
      return undefined as T;
    case "app_state_delete":
      if (typeof window !== "undefined" && typeof args?.key === "string") {
        window.localStorage.removeItem(args.key);
      }
      return undefined as T;
    case "connection_log_open":
      return `browser-log-${Date.now()}` as T;
    case "readonly_check_run":
      return {
        check_id: args?.args && typeof args.args === "object" ? (args.args as Record<string, unknown>).check_id : "reachability",
        status: "ok",
        output: "Browser preview check placeholder",
        bytes: 33,
        duration_ms: 1,
      } as T;
    case "config_backup_run":
      return {
        record: {
          id: `browser-backup-${Date.now()}`,
          host_alias: "browser",
          path: "",
          bytes: 0,
          profile: "linux",
          status: "ok",
          created_at: Math.floor(Date.now() / 1000),
        },
      } as T;
    case "config_backup_list":
      return [] as T;
    case "cred_load":
      return "" as T;
    case "ssh_open":
    case "pty_open":
    case "serial_open":
      return `browser-session-${Date.now()}` as T;
    default:
      return undefined as T;
  }
}

async function invoke<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  try {
    return await tauriInvoke<T>(cmd, args);
  } catch (error) {
    if (isMissingTauriError(error)) {
      return browserInvokeFallback<T>(cmd, args);
    }
    throw error;
  }
}

async function listen<T>(event: string, handler: (event: TauriEvent<T>) => void): Promise<UnlistenFn> {
  try {
    return await tauriListen<T>(event, handler);
  } catch (error) {
    if (isMissingTauriError(error)) return () => {};
    throw error;
  }
}

// ─── ssh_config ────────────────────────────────────────────────────────────

interface HostEntry {
  alias: string;
  aliases?: string[];
  hostname?: string;
  user?: string;
  port?: number;
  identity_file?: string;
  group?: string;
  source?: string;
  raw: string;
}

export async function parseSshConfig(path?: string): Promise<Host[]> {
  const entries = await invoke<HostEntry[]>("config_parse", { path });
  return entries.map((e) => ({
    id: `cfg-${e.alias}`,
    alias: e.alias,
    aliases: e.aliases,
    hostname: e.hostname ?? e.alias,
    user: e.user ?? "root",
    port: e.port ?? 22,
    identityFile: e.identity_file,
    group: e.group ?? "unassigned",
    connectionType: "ssh",
    source: e.source === "known-hosts" ? "known-hosts" : "ssh-config",
  }));
}

// ─── remote SSH ────────────────────────────────────────────────────────────

export interface SshOpenArgs {
  alias: string;
  host: string;
  user: string;
  port: number;
  identityFile?: string;
  password?: string;
  passphrase?: string;
  skipOpenSshKnownHosts?: boolean;
  terminalLocale?: string;
  terminalTimezone?: string;
  deviceHint?: string;
  jump?: SshJumpArgs;
}

export interface SshJumpArgs {
  alias: string;
  host: string;
  user: string;
  port: number;
  identityFile?: string;
  password?: string;
  passphrase?: string;
  deviceHint?: string;
}

export async function sshOpen(args: SshOpenArgs): Promise<string> {
  return invoke<string>("ssh_open", {
    args: {
      alias: args.alias,
      host: args.host,
      user: args.user,
      port: args.port,
      identity_file: args.identityFile,
      password: args.password,
      passphrase: args.passphrase,
      skip_open_ssh_known_hosts: args.skipOpenSshKnownHosts,
      terminal_locale: args.terminalLocale,
      terminal_timezone: args.terminalTimezone,
      device_hint: args.deviceHint,
      jump: args.jump
        ? {
            alias: args.jump.alias,
            host: args.jump.host,
            user: args.jump.user,
            port: args.jump.port,
            identity_file: args.jump.identityFile,
            password: args.jump.password,
            passphrase: args.jump.passphrase,
            device_hint: args.jump.deviceHint,
          }
        : undefined,
    },
  });
}
export async function sshSend(id: string, data: Uint8Array): Promise<void> {
  return invoke("ssh_send", { id, data: Array.from(data) });
}
export async function sshResize(id: string, cols: number, rows: number): Promise<void> {
  return invoke("ssh_resize", { id, cols, rows });
}
export async function sshClose(id: string): Promise<void> {
  return invoke("ssh_close", { id });
}
export async function sshDetach(id: string): Promise<void> {
  return invoke("ssh_detach", { id });
}
export async function sshReattach(id: string): Promise<void> {
  return invoke("ssh_reattach", { id });
}

// ─── local PTYs ────────────────────────────────────────────────────────────

export async function ptyOpen(
  shellId: string | undefined,
  shellPath?: string,
  terminalEnv?: { terminalLocale?: string; terminalTimezone?: string }
): Promise<string> {
  return invoke<string>("pty_open", {
    shellId,
    shellPath,
    terminalLocale: terminalEnv?.terminalLocale,
    terminalTimezone: terminalEnv?.terminalTimezone,
  });
}
export async function ptySend(id: string, data: Uint8Array): Promise<void> {
  return invoke("pty_send", { id, data: Array.from(data) });
}
export async function ptyResize(id: string, cols: number, rows: number): Promise<void> {
  return invoke("pty_resize", { id, cols, rows });
}
export async function ptyClose(id: string): Promise<void> {
  return invoke("pty_close", { id });
}

// ─── serial ─────────────────────────────────────────────────────────────

export interface SerialPortInfo {
  port_name: string;
  transport: string;
  manufacturer?: string;
  product?: string;
  serial_number?: string;
  vendor_id?: number;
  product_id?: number;
}

export interface SerialOpenArgs {
  portName: string;
  baudRate?: number;
  dataBits?: number;
  parity?: SerialParity;
  stopBits?: SerialStopBits;
  flowControl?: SerialFlowControl;
  lineEnding?: SerialLineEnding;
}

export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  return invoke<SerialPortInfo[]>("serial_list_ports");
}

export async function serialOpen(args: SerialOpenArgs): Promise<string> {
  return invoke<string>("serial_open", {
    args: {
      port_name: args.portName,
      baud_rate: args.baudRate,
      data_bits: args.dataBits,
      parity: args.parity,
      stop_bits: args.stopBits,
      flow_control: args.flowControl,
      line_ending: args.lineEnding,
    },
  });
}
export async function serialSend(id: string, data: Uint8Array): Promise<void> {
  return invoke("serial_send", { id, data: Array.from(data) });
}
export async function serialResize(id: string, cols: number, rows: number): Promise<void> {
  return invoke("serial_resize", { id, cols, rows });
}
export async function serialClose(id: string): Promise<void> {
  return invoke("serial_close", { id });
}

// ─── shells, keys, credentials ─────────────────────────────────────────────

export async function detectShells(): Promise<ShellInfo[]> {
  return invoke("shells_detect");
}
export async function listKeys(): Promise<SshKey[]> {
  return invoke("keys_list");
}
export async function credStore(account: string, secret: string): Promise<void> {
  return invoke("cred_store", { account, secret });
}
export async function credLoad(account: string): Promise<string> {
  return invoke("cred_load", { account });
}
export async function credDelete(account: string): Promise<void> {
  return invoke("cred_delete", { account });
}

// ─── i18n ──────────────────────────────────────────────────────────────────

export async function detectSystemLanguage(): Promise<string> {
  return invoke<string>("i18n_detect_system");
}

// ─── app lifecycle ─────────────────────────────────────────────────────────

export interface AutostartStatus {
  enabled: boolean;
}

export async function getAutostartStatus(): Promise<AutostartStatus> {
  return invoke<AutostartStatus>("autostart_status");
}

export async function setAutostartEnabled(enabled: boolean): Promise<AutostartStatus> {
  return invoke<AutostartStatus>("autostart_set_enabled", { enabled });
}

// ─── reachability ──────────────────────────────────────────────────────────

export interface PingResult {
  ok: boolean;
  latency_ms: number | null;
}

export async function hostPing(host: string, port: number): Promise<PingResult> {
  return invoke<PingResult>("host_ping", { host, port });
}

// ─── local app state storage ──────────────────────────────────────────────

export async function appStateGet(key: string): Promise<string | null> {
  return invoke<string | null>("app_state_get", { key });
}

export async function appStatePut(key: string, value: string): Promise<void> {
  return invoke("app_state_put", { key, value });
}

export async function appStateDelete(key: string): Promise<void> {
  return invoke("app_state_delete", { key });
}

// ─── event subscriptions ───────────────────────────────────────────────────

export type DataEventHandler = (b64: string) => void;
export type ExitEventHandler = () => void;

export async function onSshData(id: string, fn: DataEventHandler): Promise<UnlistenFn> {
  return listen<string>(`ssh:${id}:data`, (e) => fn(e.payload));
}
export async function onSshExit(id: string, fn: ExitEventHandler): Promise<UnlistenFn> {
  return listen(`ssh:${id}:exit`, () => fn());
}
export async function onPtyData(id: string, fn: DataEventHandler): Promise<UnlistenFn> {
  return listen<string>(`pty:${id}:data`, (e) => fn(e.payload));
}
export async function onPtyExit(id: string, fn: ExitEventHandler): Promise<UnlistenFn> {
  return listen(`pty:${id}:exit`, () => fn());
}
export async function onSerialData(id: string, fn: DataEventHandler): Promise<UnlistenFn> {
  return listen<string>(`serial:${id}:data`, (e) => fn(e.payload));
}
export async function onSerialExit(id: string, fn: ExitEventHandler): Promise<UnlistenFn> {
  return listen(`serial:${id}:exit`, () => fn());
}

export interface SshHostMetadata {
  session_id: string;
  alias: string;
  host: string;
  port: number;
  remote_hostname?: string;
  os_id?: string;
  os_name?: string;
  os_pretty_name?: string;
  kernel?: string;
  model?: string;
  icon_override?: string;
  icon_confidence: number;
  role?: string;
  tags: string[];
}

export type SshHostMetadataHandler = (event: SshHostMetadata) => void;

export async function onSshHostMetadata(fn: SshHostMetadataHandler): Promise<UnlistenFn> {
  return listen<SshHostMetadata>("ssh:host-metadata", (e) => fn(e.payload));
}

// ─── connection logs ─────────────────────────────────────────────────────

export interface ConnectionLogCloseArgs {
  logId: string;
  bytesIn: number;
  bytesOut: number;
  exitStatus?: number | null;
  error?: string | null;
}

export async function connectionLogOpen(hostAlias: string): Promise<string> {
  return invoke("connection_log_open", { hostAlias });
}

export async function connectionLogClose(args: ConnectionLogCloseArgs): Promise<void> {
  return invoke("connection_log_close", { args });
}

// ─── host key TOFU challenge ─────────────────────────────────────────────

export type HostKeyDecision = "accept_once" | "accept_and_remember" | "reject";

export interface HostKeyChallenge {
  challenge_id: string;
  session_id: string;
  alias: string;
  host: string;
  port: number;
  key_type: string;
  fingerprint: string;
  status: "unknown" | "mismatch";
  known_fingerprints: string[];
  can_remember: boolean;
  path_role?: "direct" | "jump" | "target";
}

export type HostKeyChallengeHandler = (event: HostKeyChallenge) => void;

export async function onHostKeyChallenge(fn: HostKeyChallengeHandler): Promise<UnlistenFn> {
  return listen<HostKeyChallenge>("ssh:host-key-challenge", (e) => fn(e.payload));
}

export async function sshHostKeyDecide(
  challengeId: string,
  decision: HostKeyDecision
): Promise<void> {
  return invoke("ssh_host_key_decide", { challengeId, decision });
}

export async function sshForgetTrustedHostKey(host: string, port: number): Promise<void> {
  return invoke("ssh_forget_trusted_host_key", { host, port });
}

// ─── safe readonly checks + config backups ───────────────────────────────

export interface SshExecHostArgs {
  alias: string;
  host: string;
  user: string;
  port: number;
  identityFile?: string;
  password?: string;
  passphrase?: string;
  deviceHint?: string;
  jump?: SshJumpArgs;
}

export interface ReadonlyCheckRunArgs {
  checkId: ReadonlyCheckId;
  profile?: ConfigBackupProfile;
  host: SshExecHostArgs;
}

export interface ReadonlyCheckResult {
  check_id: ReadonlyCheckId;
  status: string;
  output: string;
  bytes: number;
  duration_ms: number;
}

export async function readonlyCheckRun(args: ReadonlyCheckRunArgs): Promise<ReadonlyCheckResult> {
  return invoke("readonly_check_run", {
    args: {
      check_id: args.checkId,
      profile: args.profile,
      host: execHostToTauri(args.host),
    },
  });
}

export interface ConfigBackupRecord {
  id: string;
  host_alias: string;
  path: string;
  bytes: number;
  profile: ConfigBackupProfile;
  status: string;
  created_at: number;
}

export interface ConfigBackupRunResult {
  record: ConfigBackupRecord;
}

export async function configBackupRun(
  profile: ConfigBackupProfile,
  host: SshExecHostArgs
): Promise<ConfigBackupRunResult> {
  return invoke("config_backup_run", {
    args: {
      profile,
      host: execHostToTauri(host),
    },
  });
}

export async function configBackupList(hostAlias?: string): Promise<ConfigBackupRecord[]> {
  return invoke("config_backup_list", { hostAlias });
}

function execHostToTauri(host: SshExecHostArgs) {
  return {
    alias: host.alias,
    host: host.host,
    user: host.user,
    port: host.port,
    identity_file: host.identityFile,
    password: host.password,
    passphrase: host.passphrase,
    device_hint: host.deviceHint,
    jump: host.jump
      ? {
          alias: host.jump.alias,
          host: host.jump.host,
          user: host.jump.user,
          port: host.jump.port,
          identity_file: host.jump.identityFile,
          password: host.jump.password,
          passphrase: host.jump.passphrase,
          device_hint: host.jump.deviceHint,
        }
      : undefined,
  };
}
