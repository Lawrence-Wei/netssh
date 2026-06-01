import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import {
  onPtyData,
  onPtyExit,
  onSshData,
  onSshExit,
  ptyClose,
  ptyOpen,
  ptyResize,
  ptySend,
  sshClose,
  sshOpen,
  sshResize,
  sshSend,
} from "../api/tauri";
import { t } from "../utils/i18n";


import type { Host, Lang } from "../config/types";
import { Icon } from "../components/Icons";
import { createDemoShell } from "../utils/demoShell";
import { brandIcon } from "../components/BrandIcons";

export interface QueuedCommand {
  cmd: string;
  name?: string;
}

interface TerminalPaneProps {
  lang: Lang;
  host?: Host;
  shellId?: string;
  shellTitle?: string;
  onClose?: () => void;
  onRetry?: () => void;
  onEditHost?: () => void;
  runQueue?: QueuedCommand[];
}

type LiveMode = "ssh" | "pty" | "demo" | "error";

export function TerminalPane({ lang, host, shellId, shellTitle, onClose, onRetry, onEditHost, runQueue }: TerminalPaneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const modeRef = useRef<LiveMode>("demo");
  const sessionIdRef = useRef<string | null>(null);
  const demoRef = useRef<ReturnType<typeof createDemoShell> | null>(null);
  const lastRunLengthRef = useRef(0);
  const [liveMode, setLiveMode] = useState<LiveMode>(host ? "ssh" : shellId ? "pty" : "demo");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    mount.replaceChildren();
    const term = new XTerm({
      fontFamily: getCSS("--terminal-font-family", '"JetBrains Mono", ui-monospace, monospace'),
      fontSize: Number.parseInt(getCSS("--terminal-font-size", "13"), 10) || 13,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
      theme: terminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL can be disabled on some Windows machines; canvas rendering is fine.
    }
    term.open(mount);
    safeFit(fit);
    termRef.current = term;
    fitRef.current = fit;

    let dataSub: IDisposable | null = null;
    let unlistenData: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;
    let disposed = false;
    let focusTimer = 0;

    const resizeRemote = () => {
      safeFit(fit);
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      if (modeRef.current === "ssh") void sshResize(sessionId, term.cols, term.rows);
      if (modeRef.current === "pty") void ptyResize(sessionId, term.cols, term.rows);
    };
    let resizeFrame = 0;
    const queueResize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(resizeRemote);
    };
    const ro = new ResizeObserver(queueResize);
    ro.observe(mount);
    window.addEventListener("resize", queueResize);

    dataSub = term.onData((data) => {
      const sessionId = sessionIdRef.current;
      if (sessionId && modeRef.current === "ssh") {
        void sshSend(sessionId, new TextEncoder().encode(data));
        return;
      }
      if (sessionId && modeRef.current === "pty") {
        void ptySend(sessionId, new TextEncoder().encode(data));
        return;
      }
      demoRef.current?.handle(data);
    });

    setConnectionError(null);

    const startDemo = (reason?: unknown) => {
      if (disposed) return;
      if (host) {
        modeRef.current = "error";
        setLiveMode("error");
        setConnectionError(errorMessage(reason));
        return;
      }
      modeRef.current = "demo";
      setLiveMode("demo");
      const demo = createDemoShell(term, host, shellTitle || shellId || "local", () => onCloseRef.current?.());
      demoRef.current = demo;
      demo.start();
    };

    (async () => {
      try {
        if (shellId) {
          modeRef.current = "pty";
          setLiveMode("pty");
          const id = await ptyOpen(shellId);
          if (disposed) {
            await ptyClose(id);
            return;
          }
          sessionIdRef.current = id;
          unlistenData = await onPtyData(id, (b64) => term.write(base64Bytes(b64)));
          unlistenExit = await onPtyExit(id, () => onCloseRef.current?.());
          queueResize();
          return;
        }

        if (host) {
          modeRef.current = "ssh";
          setLiveMode("ssh");
          const id = await sshOpen({
            alias: host.alias,
            host: host.hostname,
            user: host.user,
            port: host.port,
            identityFile: host.identityFile,
            password: host.ephemeralPassword,
          });
          if (disposed) {
            await sshClose(id);
            return;
          }
          sessionIdRef.current = id;
          unlistenData = await onSshData(id, (b64) => term.write(base64Bytes(b64)));
          unlistenExit = await onSshExit(id, () => onCloseRef.current?.());
          queueResize();
          return;
        }

        startDemo();
      } catch (error) {
        startDemo(error);
      }
    })();

    focusTimer = window.setTimeout(() => {
      if (!disposed) term.focus();
    }, 50);

    return () => {
      disposed = true;
      onCloseRef.current = undefined;
      window.cancelAnimationFrame(resizeFrame);
      window.clearTimeout(focusTimer);
      window.removeEventListener("resize", queueResize);
      dataSub?.dispose();
      ro.disconnect();
      unlistenData?.();
      unlistenExit?.();
      const id = sessionIdRef.current;
      if (id && modeRef.current === "ssh") void sshClose(id);
      if (id && modeRef.current === "pty") void ptyClose(id);
      sessionIdRef.current = null;
      demoRef.current = null;
      term.dispose();
    };
  }, [host?.id, shellId, shellTitle, retryNonce]);

  useEffect(() => {
    if (!runQueue || runQueue.length === 0 || runQueue.length === lastRunLengthRef.current) return;
    lastRunLengthRef.current = runQueue.length;
    const command = runQueue[runQueue.length - 1];
    const id = sessionIdRef.current;
    if (id && modeRef.current === "ssh") {
      void sshSend(id, new TextEncoder().encode(`${command.cmd}\r`));
      return;
    }
    if (id && modeRef.current === "pty") {
      void ptySend(id, new TextEncoder().encode(`${command.cmd}\r`));
      return;
    }
    demoRef.current?.runCommand(command.cmd);
  }, [runQueue]);

  const hueRgba = (color: string, alpha: number) => hexToRgba(color, alpha);
  const title = host ? `${host.user}@${host.alias}` : shellTitle || shellId || "Local shell";
  const subtitle = host ? `${host.hostname}${host.port !== 22 ? `:${host.port}` : ""}` : t("rail.add", lang);
  const isDemo = liveMode === "demo";
  const hasError = liveMode === "error" && !!connectionError;
  const handleRetry = () => {
    setConnectionError(null);
    setLiveMode(host ? "ssh" : shellId ? "pty" : "demo");
    setRetryNonce((n) => n + 1);
    onRetry?.();
  };

  return (
    <>
      <div className="conn-bar">
        <div className="crumbs">
          {host && <span className="conn-icon" style={{ color: host.hue }}>{brandIcon(host)}</span>}
          <strong>{title}</strong>
          <span className="sep">.</span>
          <span>{subtitle}</span>
          {host?.role && <><span className="sep">.</span><span>{host.role}</span></>}
        </div>
        <span className={"status " + (hasError ? "bad" : isDemo ? "warn" : "")}>
          <span className={"latency " + (hasError ? "bad" : isDemo ? "warn" : "ok")} style={{ background: "currentColor" }} />
          <span>{hasError ? t("conn.status.failed", lang) : t(isDemo ? "conn.status.localDemo" : "conn.status.connected", lang)}</span>
        </span>
        <div className="spacer" />
        <div className="conn-actions">
          <button className="icon-btn" title={t("conn.action.reconnect", lang)} onClick={handleRetry}>{Icon.refresh}</button>
          <button className="icon-btn danger" title={t("conn.action.disconnect", lang)} onClick={onClose}>{Icon.power}</button>
        </div>
      </div>

      <div className="terminal-pane">
        <div
          className="terminal-host"
          style={{
            "--host-aurora-1": hueRgba("#7c3aed", 0.32),
            "--host-aurora-2": hueRgba("#60a5fa", 0.22),
          } as CSSProperties}
        >
          <div ref={mountRef} className="xterm-mount" />
          {hasError && host && (
            <div className="connection-error">
              <span className="eyebrow">{t("conn.error.eyebrow", lang)}</span>
              <h2>{t("conn.error.title", lang)}</h2>
              <p>{connectionError}</p>
              <div className="connection-error__target">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text)" }}>
                  {host.user}@{host.hostname}:{host.port}
                </span>
              </div>
              {host.identityFile && (
                <div className="connection-error__target" style={{ fontSize: 11 }}>
                  <span className="k" style={{ color: "var(--text-mute)" }}>{t("host.eyebrow.key", lang)}: </span>
                  <span>{host.identityFile}</span>
                </div>
              )}
              <div className="connection-error__actions">
                <button className="btn" onClick={handleRetry}>
                  {Icon.power}
                  <span>{t("common.retry", lang)}</span>
                </button>
                <button className="btn ghost" onClick={onEditHost}>
                  {Icon.edit}
                  <span>{t("host.action.edit", lang)}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="status-strip">
        <span className="item"><span className="key">{t("status.session", lang)}</span><span style={{ color: "var(--text)" }}>{host?.alias || shellTitle || shellId || "local"}</span></span>
        <span className="item accent"><span className="key">{t("status.latency", lang)}</span><span>{host?.latency ?? "-"} ms</span></span>
        <span className="item"><span className="key">{t("status.cipher", lang)}</span><span>{host ? t("status.cipher.ssh2", lang) : t("status.cipher.conpty", lang)}</span></span>
        <span className="item"><span className="key">{t("status.encoding", lang)}</span><span>UTF-8</span></span>
        <span className="item"><span className="key">{t("status.shell", lang)}</span><span>{hasError ? t("conn.status.failed", lang) : isDemo ? t("status.shell.local", lang) : host ? t("status.shell.remote", lang) : t("status.shell.local", lang)}</span></span>
        <span style={{ flex: 1 }} />
        <span className="item" style={{ color: "var(--text-mute)" }}>
          <span>{host ? `${t("status.protocol.tcp", lang)}/${host.port}` : t("status.shell.local", lang)} . </span>
          <span>{clock.toLocaleTimeString()}</span>
        </span>
      </div>
    </>
  );
}

function safeFit(fit: FitAddon) {
  try {
    fit.fit();
  } catch {
    // xterm may briefly have zero-sized cells during first paint.
  }
}

function base64Bytes(b64: string) {
  const text = atob(b64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function terminalTheme() {
  return {
    background: "rgba(0,0,0,0)",
    foreground: getCSS("--term-fg"),
    cursor: getCSS("--term-cursor"),
    cursorAccent: "#0a0617",
    selectionBackground: getCSS("--term-selection"),
    black: "#1a0a2e",
    red: "#f87171",
    green: "#4ade80",
    yellow: "#fbbf24",
    blue: "#60a5fa",
    magenta: "#f0abfc",
    cyan: "#67e8f9",
    white: "#eee6ff",
    brightBlack: "#6f6391",
    brightRed: "#fca5a5",
    brightGreen: "#86efac",
    brightYellow: "#fcd34d",
    brightBlue: "#93c5fd",
    brightMagenta: "#f9a8d4",
    brightCyan: "#a5f3fc",
    brightWhite: "#fefcff",
  };
}

function getCSS(name: string, fallback = "#fff") {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function hexToRgba(hex: string, alpha: number) {
  if (!hex.startsWith("#")) return `rgba(167,139,250,${alpha})`;
  const h = hex.slice(1);
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function errorMessage(error: unknown) {
  const raw = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  if (!raw) return "Live session could not be opened.";

  // Categorize common SSH errors
  if (/dns|resolve|host.?name|getaddrinfo|name or service not known|no address associated/i.test(raw)) {
    return `DNS resolution failed — cannot resolve hostname. Check the hostname/IP is correct.`;
  }
  if (/connection refused|refused/i.test(raw)) {
    return `Connection refused — target rejected the connection. Check that SSH service is running and the port is correct.`;
  }
  if (/timeout|timed out|no response/i.test(raw)) {
    return `Connection timed out — no response from target. Check IP address, routing, firewall, or VPN.`;
  }
  if (/no_credentials/i.test(raw)) {
    return `No credentials provided — edit this host to set a password or SSH identity file, then reconnect.`;
  }
  if (/username_invalid/i.test(raw)) {
    return `Invalid username — username contains whitespace or special characters (: or @).`;
  }
  if (/key_passphrase_needed/i.test(raw)) {
    return `SSH key is protected by a passphrase — add the passphrase in host settings.`;
  }
  if (/auth|permission denied|password|publickey|no supported auth/i.test(raw)) {
    return `Authentication failed — check username, key, or password. The server rejected the credentials.`;
  }
  if (/no route|network|unreachable|host unreachable/i.test(raw)) {
    return `Network unreachable — no route to the target. Check VPN, network connectivity, or firewall.`;
  }
  if (/reset|broken pipe|connection reset|disconnect/i.test(raw)) {
    return `Connection reset — the session was unexpectedly closed. Server may have dropped the connection.`;
  }

  return raw || "Live session could not be opened.";
}
