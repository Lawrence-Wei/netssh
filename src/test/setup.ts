/**
 * 全局测试 setup — 注册所有 Tauri API 和浏览器 API 的 mock。
 * 每次测试运行前自动执行，确保组件可以在 Node.js 环境中渲染。
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

Object.assign(globalThis, {
  __netsshEmitTauriEvent: tauriEventMock.emitEvent,
  __netsshClearTauriEvents: tauriEventMock.clear,
});

// ============================================================
// Mock Tauri window API
// ============================================================
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(() => Promise.resolve()),
    maximize: vi.fn(() => Promise.resolve()),
    unmaximize: vi.fn(() => Promise.resolve()),
    toggleMaximize: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    isMaximized: vi.fn(() => Promise.resolve(false)),
    setTitle: vi.fn(() => Promise.resolve()),
    center: vi.fn(() => Promise.resolve()),
    onCloseRequested: vi.fn(() => Promise.resolve()),
  }),
  getAllWindows: () => [],
}));

// ============================================================
// Mock Tauri core invoke
// ============================================================
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    /** 根据命令名返回合理的默认值，使组件正常渲染 */
    switch (cmd) {
      case "config_parse":
        return Promise.resolve([]);
      case "shells_detect":
        return Promise.resolve([]);
      case "keys_list":
        return Promise.resolve([]);
      case "i18n_detect_system":
        return Promise.resolve("en");
      case "ssh_open":
        return Promise.resolve("mock-ssh-id");
      case "pty_open":
        return Promise.resolve("mock-pty-id");
      case "ssh_host_key_decide":
      case "ssh_send":
      case "ssh_resize":
      case "ssh_close":
      case "pty_send":
      case "pty_resize":
      case "pty_close":
        return Promise.resolve();
      case "host_ping":
        return Promise.resolve({ ok: false, latency_ms: null });
      case "app_state_get":
        return Promise.resolve(null);
      case "app_state_put":
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
// Mock Tauri services — 防止 reachability / pty / ssh 等后端调用崩溃
// ============================================================
vi.mock("../services/tauri", () => ({
  /** TCP ping 返回 "未检测" 状态，让 Sidebar 正常渲染 */
  hostPing: vi.fn(() => Promise.resolve({ ok: false, latency_ms: null })),
  parseSshConfig: vi.fn(() => Promise.resolve([])),
  detectShells: vi.fn(() => Promise.resolve([])),
  listKeys: vi.fn(() => Promise.resolve([])),
  detectSystemLanguage: vi.fn(() => Promise.resolve("en")),
  /** SSH / PTY 连接函数 — 返回一个模拟的 session ID */
  sshOpen: vi.fn(() => Promise.resolve("mock-ssh-id")),
  sshClose: vi.fn(() => Promise.resolve()),
  sshSend: vi.fn(() => Promise.resolve()),
  sshResize: vi.fn(() => Promise.resolve()),
  onSshData: vi.fn(() => Promise.resolve(() => {})),
  onSshExit: vi.fn(() => Promise.resolve(() => {})),
  ptyOpen: vi.fn(() => Promise.resolve("mock-pty-id")),
  ptyClose: vi.fn(() => Promise.resolve()),
  ptySend: vi.fn(() => Promise.resolve()),
  ptyResize: vi.fn(() => Promise.resolve()),
  onPtyData: vi.fn(() => Promise.resolve(() => {})),
  onPtyExit: vi.fn(() => Promise.resolve(() => {})),
  configParse: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@tauri-apps/plugin-os", () => ({
  platform: () => "win32",
  arch: () => "x86_64",
  version: () => "10.0.22621",
  type: () => "Windows_NT",
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(() => Promise.resolve("")),
  writeTextFile: vi.fn(() => Promise.resolve()),
  exists: vi.fn(() => Promise.resolve(false)),
  createDir: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(() => Promise.resolve()),
  Command: vi.fn(),
}));

// ============================================================
// Mock xterm.js — 避免在测试中加载真实的 WebGL 终端
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

vi.mock("@xterm/addon-search", () => ({
  SearchAddon: vi.fn(),
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
// Mock CSS 自定义属性 — 组件从 getComputedStyle 读取
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
// 抑制 console 噪音（测试失败时 vi.fn() mock 的警告）
// ============================================================
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = String(args[0]);
  /** 过滤掉 React 测试中的已知无害警告 */
  if (msg.includes("ReactDOMTestUtils.act")) return;
  if (msg.includes("Not implemented: HTMLCanvasElement")) return;
  originalWarn.call(console, ...args);
};
