/**
 * Global test setup for Tauri and browser API mocks.
 * Runs before each test file so components render in Node.js.
 */
import { vi } from "vitest";

type TauriEventCallback = (event: { payload: unknown }) => void;

const tauriEventMock = vi.hoisted(() => {
  const listeners = new Map<string, Set<TauriEventCallback>>();
  return {
    listen: vi.fn((event: string, callback: TauriEventCallback) => {
      const current = listeners.get(event) || new Set<TauriEventCallback>();
      current.add(callback);
      listeners.set(event, current);
      return Promise.resolve(() => {
        current.delete(callback);
      });
    }),
    emitEvent(event: string, payload: unknown) {
      for (const callback of listeners.get(event) || []) {
        callback({ payload });
      }
    },
    clear() {
      listeners.clear();
    },
  };
});

const tauriWindowMock = vi.hoisted(() => ({
  current: {
    minimize: vi.fn(() => Promise.resolve()),
    maximize: vi.fn(() => Promise.resolve()),
    unmaximize: vi.fn(() => Promise.resolve()),
    toggleMaximize: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    isMaximized: vi.fn(() => Promise.resolve(false)),
    setTitle: vi.fn(() => Promise.resolve()),
    center: vi.fn(() => Promise.resolve()),
    onCloseRequested: vi.fn(() => Promise.resolve()),
  },
}));

const credentialSecretsMock = vi.hoisted(() => {
  const secrets = new Map<string, string>();
  return {
    store(account: string, secret: string) {
      secrets.set(account, secret);
    },
    load(account: string) {
      return secrets.get(account) || "";
    },
    delete(account: string) {
      secrets.delete(account);
    },
    clear() {
      secrets.clear();
    },
  };
});

Object.assign(globalThis, {
  __netsshEmitTauriEvent: tauriEventMock.emitEvent,
  __netsshClearTauriEvents: tauriEventMock.clear,
  __netsshClearTestCredentials: credentialSecretsMock.clear,
});

// ============================================================
// Mock Tauri window API
// ============================================================
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => tauriWindowMock.current,
  getAllWindows: () => [],
}));

// ============================================================
// Mock Tauri core invoke
// ============================================================
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: Record<string, unknown>) => {
    /** Return practical defaults by command name so components can render. */
    switch (cmd) {
      case "config_parse":
        return Promise.resolve([]);
      case "shells_detect":
        return Promise.resolve([]);
      case "keys_list":
        return Promise.resolve([]);
      case "cred_store":
        credentialSecretsMock.store(String(args?.account), String(args?.secret));
        return Promise.resolve();
      case "cred_load":
        return Promise.resolve(credentialSecretsMock.load(String(args?.account)));
      case "cred_delete":
        credentialSecretsMock.delete(String(args?.account));
        return Promise.resolve();
      case "i18n_detect_system":
        return Promise.resolve("en");
      case "autostart_status":
        return Promise.resolve({ enabled: false });
      case "autostart_set_enabled":
        return Promise.resolve({ enabled: Boolean(args?.enabled) });
      case "ssh_open":
        return Promise.resolve("mock-ssh-id");
      case "pty_open":
        return Promise.resolve("mock-pty-id");
      case "serial_list_ports":
        return Promise.resolve([]);
      case "serial_open":
        return Promise.resolve("mock-serial-id");
      case "ssh_host_key_decide":
      case "ssh_forget_trusted_host_key":
      case "ssh_send":
      case "ssh_resize":
      case "ssh_close":
      case "pty_send":
      case "pty_resize":
      case "pty_close":
      case "serial_send":
      case "serial_resize":
      case "serial_close":
        return Promise.resolve();
      case "host_ping":
        return Promise.resolve({ ok: false, latency_ms: null });
      case "connection_log_open":
        return Promise.resolve(`log-${Date.now()}`);
      case "readonly_check_run":
        return Promise.resolve({
          check_id: args?.args && typeof args.args === "object" ? (args.args as Record<string, unknown>).check_id : "reachability",
          status: "ok",
          output: "mock readonly check",
          bytes: 19,
          duration_ms: 1,
        });
      case "config_backup_run":
        return Promise.resolve({
          record: {
            id: `backup-${Date.now()}`,
            host_alias: "mock",
            path: "C:\\Users\\lawrence\\AppData\\Local\\Netssh\\backups\\mock\\mock.txt",
            bytes: 19,
            profile: "linux",
            status: "ok",
            created_at: Math.floor(Date.now() / 1000),
          },
        });
      case "config_backup_list":
        return Promise.resolve([]);
      case "app_state_get":
        return Promise.resolve(null);
      case "app_state_put":
        return Promise.resolve();
      case "app_state_delete":
        return Promise.resolve();
      case "connection_log_close":
        return Promise.resolve();
      default:
        return Promise.resolve(null);
    }
  }),
  convertFileSrc: (path: string) => path,
}));

// ============================================================
// Mock Tauri event system
// ============================================================
vi.mock("@tauri-apps/api/event", () => ({
  listen: tauriEventMock.listen,
  once: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

// ============================================================
// Mock Tauri services so reachability / pty / ssh calls do not crash tests.
// ============================================================
vi.mock("../services/tauri", () => ({
  /** TCP ping returns an unchecked state so Sidebar can render. */
  hostPing: vi.fn(() => Promise.resolve({ ok: false, latency_ms: null })),
  parseSshConfig: vi.fn(() => Promise.resolve([])),
  connectionLogOpen: vi.fn(() => Promise.resolve(`log-${Date.now()}`)),
  connectionLogClose: vi.fn(() => Promise.resolve()),
  detectShells: vi.fn(() => Promise.resolve([])),
  listKeys: vi.fn(() => Promise.resolve([])),
  detectSystemLanguage: vi.fn(() => Promise.resolve("en")),
  /** SSH / PTY connection functions return a mock session ID. */
  sshOpen: vi.fn(() => Promise.resolve("mock-ssh-id")),
  sshClose: vi.fn(() => Promise.resolve()),
  sshSend: vi.fn(() => Promise.resolve()),
  sshResize: vi.fn(() => Promise.resolve()),
  serialOpen: vi.fn(() => Promise.resolve("mock-serial-id")),
  serialClose: vi.fn(() => Promise.resolve()),
  serialSend: vi.fn(() => Promise.resolve()),
  serialResize: vi.fn(() => Promise.resolve()),
  listSerialPorts: vi.fn(() => Promise.resolve([])),
  onSshData: vi.fn(() => Promise.resolve(() => {})),
  onSshExit: vi.fn(() => Promise.resolve(() => {})),
  ptyOpen: vi.fn(() => Promise.resolve("mock-pty-id")),
  ptyClose: vi.fn(() => Promise.resolve()),
  ptySend: vi.fn(() => Promise.resolve()),
  ptyResize: vi.fn(() => Promise.resolve()),
  onPtyData: vi.fn(() => Promise.resolve(() => {})),
  onPtyExit: vi.fn(() => Promise.resolve(() => {})),
  onSerialData: vi.fn(() => Promise.resolve(() => {})),
  onSerialExit: vi.fn(() => Promise.resolve(() => {})),
  configParse: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(() => Promise.resolve("")),
  writeTextFile: vi.fn(() => Promise.resolve()),
  exists: vi.fn(() => Promise.resolve(false)),
  createDir: vi.fn(() => Promise.resolve()),
}));

// ============================================================
// Mock xterm.js to avoid loading the real WebGL terminal in tests.
// ============================================================
vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    dispose: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
    loadAddon: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onSelectionChange: vi.fn(() => ({ dispose: vi.fn() })),
    getSelection: vi.fn(() => ""),
    onResize: vi.fn(() => ({ dispose: vi.fn() })),
    onTitleChange: vi.fn(() => ({ dispose: vi.fn() })),
    resize: vi.fn(),
    clear: vi.fn(),
    reset: vi.fn(),
    cols: 80,
    rows: 24,
    options: {},
    element: document.createElement("div"),
  })),
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    activate: vi.fn(),
    dispose: vi.fn(),
    fit: vi.fn(),
    proposeDimensions: vi.fn(() => ({ cols: 80, rows: 24 })),
  })),
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({
    activate: vi.fn(),
    dispose: vi.fn(),
  })),
}));

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: vi.fn().mockImplementation(() => ({
    activate: vi.fn(),
    dispose: vi.fn(),
  })),
}));

// ============================================================
// Mock Web API: matchMedia / ResizeObserver
// ============================================================
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

window.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// ============================================================
// Mock CSS custom properties read through getComputedStyle.
// ============================================================
const cssVars: Record<string, string> = {
  "--terminal-font-family": '"JetBrains Mono", monospace',
  "--terminal-font-size": "13",
  "--term-fg": "#e8e0ff",
  "--term-cursor": "#a78bfa",
  "--term-selection": "rgba(167, 139, 250, 0.30)",
  "--font-display": '"Space Grotesk", sans-serif',
  "--font-body": '"Space Grotesk", sans-serif',
  "--font-mono": '"JetBrains Mono", monospace',
  "--accent": "#a78bfa",
  "--accent-strong": "#8b5cf6",
  "--accent-2": "#60a5fa",
  "--accent-soft": "rgba(167, 139, 250, 0.14)",
  "--accent-glow": "rgba(139, 92, 246, 0.45)",
  "--text": "#eee6ff",
  "--text-dim": "#a195c7",
  "--text-mute": "#6f6391",
  "--text-eyebrow": "#8775ba",
  "--bg-base": "#0a0617",
  "--bg-elev-1": "#110a23",
  "--bg-elev-2": "#170d2e",
  "--bg-elev-3": "#1d1338",
  "--bg-void": "#050310",
  "--glass": "rgba(255, 255, 255, 0.035)",
  "--glass-strong": "rgba(255, 255, 255, 0.06)",
  "--glass-stroke": "rgba(255, 255, 255, 0.07)",
  "--glass-stroke-strong": "rgba(255, 255, 255, 0.12)",
  "--ok": "#4ade80",
  "--warn": "#fbbf24",
  "--danger": "#f87171",
  "--accent-r": "167", "--accent-g": "139", "--accent-b": "250",
  "--accent-strong-r": "139", "--accent-strong-g": "92", "--accent-strong-b": "246",
  "--accent-2-r": "96", "--accent-2-g": "165", "--accent-2-b": "250",
  "--aurora-1": "rgba(124, 58, 237, 0.45)",
  "--aurora-2": "rgba(59, 130, 246, 0.30)",
  "--aurora-3": "rgba(192, 38, 211, 0.22)",
  "--term-bg": "rgba(8, 4, 22, 0.55)",
};

const origGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = (elt: Element, pseudoElt?: string | null) => {
  const base = origGetComputedStyle(elt, pseudoElt);
  return new Proxy(base, {
    get(target, prop: string) {
      if (prop === "getPropertyValue") {
        return (name: string) => cssVars[name] || target.getPropertyValue(name);
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
};

// ============================================================
// Suppress known console noise from test mocks.
// ============================================================
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = String(args[0]);
  /** Filter known harmless React test warnings. */
  if (msg.includes("ReactDOMTestUtils.act")) return;
  if (msg.includes("Not implemented: HTMLCanvasElement")) return;
  originalWarn.call(console, ...args);
};
