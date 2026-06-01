// Typed wrappers around Tauri's invoke() and event listeners.
// The frontend ONLY talks to Rust through this module.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Host, ShellInfo, SshKey } from "../types";

// ─── ssh_config ────────────────────────────────────────────────────────────

interface HostEntry {
  alias: string;
  hostname?: string;
  user?: string;
  port?: number;
  identity_file?: string;
  raw: string;
}

export async function parseSshConfig(path?: string): Promise<Host[]> {
  const entries = await invoke<HostEntry[]>("config_parse", { path });
  return entries.map((e) => ({
    id: `cfg-${e.alias}`,
    alias: e.alias,
    hostname: e.hostname ?? e.alias,
    user: e.user ?? "root",
    port: e.port ?? 22,
    identityFile: e.identity_file,
    group: "homelab",
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

// ─── local PTYs ────────────────────────────────────────────────────────────

export async function ptyOpen(shellId: string): Promise<string> {
  return invoke<string>("pty_open", { shellId });
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

// ─── host key TOFU events ────────────────────────────────────────────────

export interface HostKeyEvent {
  session_id: string;
  host: string;
  port: number;
  key_type: string;
  fingerprint: string;
  status: "unknown" | "mismatch";
}

export type HostKeyEventHandler = (event: HostKeyEvent) => void;

export async function onHostKeyUnknown(fn: HostKeyEventHandler): Promise<UnlistenFn> {
  return listen<HostKeyEvent>("ssh:host-key-unknown", (e) => fn(e.payload));
}
export async function onHostKeyMismatch(fn: HostKeyEventHandler): Promise<UnlistenFn> {
  return listen<HostKeyEvent>("ssh:host-key-mismatch", (e) => fn(e.payload));
}
