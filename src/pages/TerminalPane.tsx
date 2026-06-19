import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import {
  onPtyData,
  onPtyExit,
  onHostKeyChallenge,
  onSshData,
  onSshExit,
  onSerialData,
  onSerialExit,
  connectionLogClose,
  connectionLogOpen,
  ptyClose,
  ptyOpen,
  ptyResize,
  ptySend,
  sshClose,
  sshDetach,
  sshReattach,
  sshForgetTrustedHostKey,
  sshHostKeyDecide,
  sshOpen,
  sshResize,
  sshSend,
  serialClose,
  serialOpen,
  serialResize,
  serialSend,
} from "../api/tauri";
import { t } from "../utils/i18n";
import { SERIAL_PRESETS } from "../config/defaults";
import { useCredentials } from "../store/credentials";
import { useSettings } from "../store/settings";
import { registerLiveSession, getLiveSession, removeLiveSession } from "../utils/liveSessions";

import type { Host, Lang, SerialProfile, TerminalLocale, TerminalTimezone } from "../config/types";
import { Icon } from "../components/Icons";
import { createDemoShell } from "../utils/demoShell";
import { brandIcon } from "../components/BrandIcons";
import type { HostKeyChallenge, HostKeyDecision } from "../api/tauri";
import { deviceTypeFromHost } from "../utils/deployScope";

export interface QueuedCommand {
  cmd: string;
  name?: string;
}

interface TerminalPaneProps {
  lang: Lang;
  host?: Host;
  shellId?: string;
  shellPath?: string;
  shellTitle?: string;
  /** If set, reattach to an existing live SSH session instead of opening a new one. */
  reattachSessionId?: string;
  onClose?: () => void;
  onRetry?: () => void;
  onEditHost?: () => void;
  runQueue?: QueuedCommand[];
}

type LiveMode = "ssh" | "serial" | "pty" | "demo" | "error";
type ConnectionPhase = "idle" | "opening" | "connected" | "error";

interface HostKeyChallengeState {
  event: HostKeyChallenge;
  submitting: boolean;
  error?: string;
}

interface PendingHostKeyDecision {
  host: string;
  port: number;
  fingerprint: string;
  decision: HostKeyDecision;
}

export function TerminalPane({ lang, host, shellId, shellPath, shellTitle, reattachSessionId, onClose, onRetry, onEditHost, runQueue }: TerminalPaneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const modeRef = useRef<LiveMode>("demo");
  const sessionIdRef = useRef<string | null>(null);
  const demoRef = useRef<ReturnType<typeof createDemoShell> | null>(null);
  const lastRunLengthRef = useRef(0);
  const [liveMode, setLiveMode] = useState<LiveMode>(host ? (host.connectionType === "serial" ? "serial" : "ssh") : shellId ? "pty" : "demo");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [hostKeyChallenge, setHostKeyChallenge] = useState<HostKeyChallengeState | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [skipOpenSshKnownHosts, setSkipOpenSshKnownHosts] = useState(false);
  const [sessionPassword, setSessionPassword] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>(() => (host || shellId ? "opening" : "idle"));
  const [clock, setClock] = useState(() => new Date());
  const isLogClosedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const bytesInRef = useRef(0);
  const bytesOutRef = useRef(0);
  const connectionLogIdRef = useRef<string | null>(null);
  const pendingHostKeyDecisionRef = useRef<PendingHostKeyDecision | null>(null);
  const {
    terminalCursorStyle,
    terminalCursorBlink,
    terminalScrollback,
    terminalCopyOnSelect,
    terminalRightClickPaste,
    terminalLocale,
    terminalTimezone,
    hardwareAcceleration,
  } = useSettings((s) => ({
    terminalCursorStyle: s.terminalCursorStyle,
    terminalCursorBlink: s.terminalCursorBlink,
    terminalScrollback: s.terminalScrollback,
    terminalCopyOnSelect: s.terminalCopyOnSelect,
    terminalRightClickPaste: s.terminalRightClickPaste,
    terminalLocale: s.terminalLocale,
    terminalTimezone: s.terminalTimezone,
    hardwareAcceleration: s.hardwareAcceleration,
  }));

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setSessionPassword("");
    setPasswordDraft("");
  }, [host?.id]);

  const closeConnectionLog = async (error?: string, exitStatus: number | null = null) => {
    const logId = connectionLogIdRef.current;
    if (!logId || isLogClosedRef.current) return;
    isLogClosedRef.current = true;
    try {
      await connectionLogClose({
        logId,
        bytesIn: bytesInRef.current,
        bytesOut: bytesOutRef.current,
        exitStatus,
        error,
      });
    } catch {
      // Ignore failures for local telemetry logs.
    } finally {
      connectionLogIdRef.current = null;
    }
  };

  const writeBytes = (bytes: Uint8Array) => {
    bytesInRef.current += bytes.length;
    return bytes;
  };

  const sendBytes = (data: Uint8Array) => {
    bytesOutRef.current += data.length;
    return data;
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    mount.replaceChildren();
    const term = new XTerm({
      fontFamily: getCSS("--terminal-font-family", '"JetBrains Mono", ui-monospace, monospace'),
      fontSize: Number.parseInt(getCSS("--terminal-font-size", "13"), 10) || 13,
      lineHeight: 1.35,
      cursorBlink: terminalCursorBlink,
      cursorStyle: terminalCursorStyle,
      scrollback: terminalScrollback,
      allowProposedApi: true,
      theme: terminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(mount);
    if (shouldLoadWebglAddon(hardwareAcceleration)) {
      try {
        term.loadAddon(new WebglAddon());
      } catch {
        // WebGL can be disabled on some Windows machines; canvas rendering is fine.
      }
    }
    termRef.current = term;
    fitRef.current = fit;

    let dataSub: IDisposable | null = null;
    let selectionSub: IDisposable | null = null;
    let unlistenHostKeyChallenge: (() => void) | null = null;
    let unlistenData: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;
    let disposed = false;
    let focusTimer = 0;
    const resetMetrics = () => {
      bytesInRef.current = 0;
      bytesOutRef.current = 0;
      isLogClosedRef.current = false;
    };

    let resizeFrame = 0;
    let initialResizeTimer = 0;
    const resizeRemote = () => {
      const fitted = safeFit(fit);
      if (!fitted) return;
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      if (modeRef.current === "ssh") void sshResize(sessionId, term.cols, term.rows);
      if (modeRef.current === "serial") void serialResize(sessionId, term.cols, term.rows);
      if (modeRef.current === "pty") void ptyResize(sessionId, term.cols, term.rows);
    };
    const queueResize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(resizeRemote);
    };
    const ro = new ResizeObserver(queueResize);
    ro.observe(mount);
    window.addEventListener("resize", queueResize);
    queueResize();
    initialResizeTimer = window.setTimeout(queueResize, 100);

    const sendInput = (data: string) => {
      const sessionId = sessionIdRef.current;
      if (sessionId && modeRef.current === "ssh") {
        const outgoing = sendBytes(new TextEncoder().encode(data));
        void sshSend(sessionId, outgoing);
        return;
      }
      if (sessionId && modeRef.current === "serial") {
        const outgoing = sendBytes(new TextEncoder().encode(data));
        void serialSend(sessionId, outgoing);
        return;
      }
      if (sessionId && modeRef.current === "pty") {
        const outgoing = sendBytes(new TextEncoder().encode(data));
        void ptySend(sessionId, outgoing);
        return;
      }
      demoRef.current?.handle(data);
    };

    dataSub = term.onData(sendInput);

    if (terminalCopyOnSelect) {
      selectionSub = term.onSelectionChange(() => {
        const selected = term.getSelection();
        if (selected) void navigator.clipboard?.writeText(selected);
      });
    }

    const onContextMenu = (event: MouseEvent) => {
      if (!terminalRightClickPaste) return;
      event.preventDefault();
      void navigator.clipboard?.readText().then((text) => {
        if (text) sendInput(text);
      });
    };
    mount.addEventListener("contextmenu", onContextMenu);

    setConnectionError(null);
    setHostKeyChallenge(null);

    const startDemo = (reason?: unknown) => {
      if (disposed) return;
      if (host) {
        modeRef.current = "error";
        setLiveMode("error");
        setConnectionPhase("error");
        setConnectionError(rawErrorMessage(reason));
        return;
      }
      modeRef.current = "demo";
      setLiveMode("demo");
      setConnectionPhase("connected");
      const demo = createDemoShell(term, host, shellTitle || shellId || "local", () => onCloseRef.current?.());
      demoRef.current = demo;
      demo.start();
    };

    (async () => {
      try {
        if (shellId) {
          modeRef.current = "pty";
          setLiveMode("pty");
          const id = await ptyOpen(shellId, shellPath, resolveTerminalEnv(terminalLocale, terminalTimezone));
          if (disposed) {
            await ptyClose(id);
            return;
          }
          sessionIdRef.current = id;
          resetMetrics();
          unlistenData = await onPtyData(id, (b64) => {
            const bytes = base64Bytes(b64);
            term.write(writeBytes(bytes));
          });
          unlistenExit = await onPtyExit(id, () => onCloseRef.current?.());
          setConnectionPhase("connected");
          queueResize();
          return;
        }

        if (host) {
          if (host.connectionType === "serial") {
            modeRef.current = "serial";
            setLiveMode("serial");
            const serialProfile = resolveSerialProfile(host.serialProfile);
            const id = await serialOpen({
              portName: serialProfile.portName || host.hostname,
              baudRate: serialProfile.baudRate,
              dataBits: serialProfile.dataBits,
              parity: serialProfile.parity,
              stopBits: serialProfile.stopBits,
              flowControl: serialProfile.flowControl,
              lineEnding: serialProfile.lineEnding,
            });
            if (disposed) {
              await serialClose(id);
              return;
            }
            sessionIdRef.current = id;
            resetMetrics();
            unlistenData = await onSerialData(id, (b64) => {
              const bytes = base64Bytes(b64);
              term.write(writeBytes(bytes));
            });
            unlistenExit = await onSerialExit(id, () => onCloseRef.current?.());
            setConnectionPhase("connected");
            queueResize();
            return;
          }

          modeRef.current = "ssh";
          setLiveMode("ssh");
          unlistenHostKeyChallenge = await onHostKeyChallenge((event) => {
            if (event.host !== host.hostname || event.port !== host.port) return;
            const pendingDecision = pendingHostKeyDecisionRef.current;
            if (
              pendingDecision &&
              pendingDecision.host === event.host &&
              pendingDecision.port === event.port &&
              pendingDecision.fingerprint === event.fingerprint
            ) {
              pendingHostKeyDecisionRef.current = null;
              setHostKeyChallenge({ event, submitting: true });
              void sshHostKeyDecide(event.challenge_id, pendingDecision.decision)
                .then(() => setHostKeyChallenge(null))
                .catch((error) => {
                  setHostKeyChallenge({
                    event,
                    submitting: false,
                    error: error instanceof Error ? error.message : String(error),
                  });
                });
              return;
            }
            setHostKeyChallenge({ event, submitting: false });
          });
          resetMetrics();
          const credentials = useCredentials.getState().credentials;
          const loadPassword = useCredentials.getState().loadPassword;
          const credentialProfile = host.credentialProfileId
            ? credentials.find((item) => item.id === host.credentialProfileId)
            : undefined;
          const username = credentialProfile?.user || host.user;
          const identityFile = credentialProfile?.identityFile || host.identityFile;
          let password: string | undefined = sessionPassword || host.ephemeralPassword || undefined;
          if (!password && credentialProfile) {
            password = (await loadPassword(credentialProfile.id).catch(() => undefined)) ?? undefined;
          }
          if (!password && !identityFile) {
            startDemo(`password_required: password is required for ${username}@${host.hostname}`);
            return;
          }
          try {
            const connectionLogId = await connectionLogOpen(host.alias);
            connectionLogIdRef.current = connectionLogId;
          } catch {
            // Ignore logging failures, still attempt the SSH connection.
            connectionLogIdRef.current = null;
          }
          let id: string;
          const liveSession = getLiveSession(host.id);
          if (liveSession) {
            // Reattach to the existing background session.
            await sshReattach(liveSession);
            id = liveSession;
          } else {
            id = await sshOpen({
              alias: host.alias,
              host: host.hostname,
              user: username,
              port: host.port,
              identityFile,
              password,
              skipOpenSshKnownHosts,
              deviceHint: host.iconOverride || deviceTypeFromHost(host),
              ...resolveTerminalEnv(terminalLocale, terminalTimezone),
            });
            registerLiveSession(host.id, id);
          }
          if (disposed) {
            if (!liveSession) {
              await sshClose(id);
              removeLiveSession(host.id);
            }
            await closeConnectionLog("disposed before first paint", null);
            return;
          }
          sessionIdRef.current = id;
          unlistenData = await onSshData(id, (b64) => {
            const bytes = base64Bytes(b64);
            term.write(writeBytes(bytes));
          });
          unlistenExit = await onSshExit(id, () => {
            void closeConnectionLog();
            onCloseRef.current?.();
          });
          setConnectionPhase("connected");
          queueResize();
          return;
        }

        startDemo();
        } catch (error) {
          if (connectionLogIdRef.current) {
            await closeConnectionLog(error instanceof Error ? error.message : String(error));
          }
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
      window.clearTimeout(initialResizeTimer);
      window.clearTimeout(focusTimer);
      window.removeEventListener("resize", queueResize);
      mount.removeEventListener("contextmenu", onContextMenu);
      dataSub?.dispose();
      selectionSub?.dispose();
      ro.disconnect();
      unlistenHostKeyChallenge?.();
      unlistenData?.();
      unlistenExit?.();
      const id = sessionIdRef.current;
      if (id && modeRef.current === "ssh") {
        void sshDetach(id);
        void closeConnectionLog();
      }
      if (id && modeRef.current === "serial") void serialClose(id);
      if (id && modeRef.current === "pty") void ptyClose(id);
      sessionIdRef.current = null;
      demoRef.current = null;
      term.dispose();
    };
  }, [
    host?.id,
    shellId,
    shellPath,
    shellTitle,
    reattachSessionId,
    retryNonce,
    skipOpenSshKnownHosts,
    sessionPassword,
    terminalCursorStyle,
    terminalCursorBlink,
    terminalScrollback,
    terminalCopyOnSelect,
    terminalRightClickPaste,
    terminalLocale,
    terminalTimezone,
    hardwareAcceleration,
  ]);

  useEffect(() => {
    if (!runQueue || runQueue.length === 0 || runQueue.length === lastRunLengthRef.current) return;
    lastRunLengthRef.current = runQueue.length;
    const command = runQueue[runQueue.length - 1];
    const id = sessionIdRef.current;
    if (id && modeRef.current === "ssh") {
      const outgoing = sendBytes(new TextEncoder().encode(`${command.cmd}\r`));
      void sshSend(id, outgoing);
      return;
    }
    if (id && modeRef.current === "serial") {
      const outgoing = sendBytes(new TextEncoder().encode(`${command.cmd}\r`));
      void serialSend(id, outgoing);
      return;
    }
    if (id && modeRef.current === "pty") {
      const outgoing = sendBytes(new TextEncoder().encode(`${command.cmd}\r`));
      void ptySend(id, outgoing);
      return;
    }
    demoRef.current?.runCommand(command.cmd);
  }, [runQueue]);

  const hueRgba = (color: string, alpha: number) => hexToRgba(color, alpha);
  const title = host ? (host.connectionType === "serial" ? host.alias : `${host.user}@${host.alias}`) : shellTitle || shellId || "Local shell";
  const serialSubtitle = host?.serialProfile?.portName || host?.hostname || host?.alias || "";
  const subtitle = host
    ? host.connectionType === "serial"
      ? serialSubtitle
      : `${host.hostname}${host.port !== 22 ? `:${host.port}` : ""}`
    : t("rail.add", lang);
  const isDemo = liveMode === "demo";
  const hasError = liveMode === "error" && !!connectionError;
  const hostKeyStatus = hostKeyChallenge
    ? hostKeyChallenge.event.status === "mismatch"
      ? "blocked"
      : "pending"
    : null;
  const hasHostKeyBlocked = hostKeyStatus === "blocked";
  const hasHostKeyPending = hostKeyStatus === "pending";
  const isOpening = connectionPhase === "opening";
  const connectionStatusClass = hasError || hasHostKeyBlocked ? "bad" : isDemo || hasHostKeyPending || isOpening ? "warn" : "";
  const connectionStatusLabel = hasError
    ? t("conn.status.failed", lang)
    : hasHostKeyBlocked
      ? t("conn.status.hostKeyBlocked", lang)
      : hasHostKeyPending
        ? t("conn.status.hostKeyPending", lang)
        : isOpening
          ? t("conn.status.connecting", lang)
          : t(isDemo ? "conn.status.localDemo" : "conn.status.connected", lang);
  const shellStatusLabel = hasError
    ? t("conn.status.failed", lang)
    : hasHostKeyBlocked
      ? t("conn.status.hostKeyBlocked", lang)
      : hasHostKeyPending
        ? t("conn.status.hostKeyPending", lang)
        : isOpening
          ? t("conn.status.connecting", lang)
          : isDemo
            ? t("status.shell.local", lang)
            : host
              ? (host.connectionType === "serial" ? t("status.shell.serial", lang) : t("status.shell.remote", lang))
              : t("status.shell.local", lang);
  const handleRetry = (options?: { skipOpenSshKnownHosts?: boolean }) => {
    setSkipOpenSshKnownHosts(Boolean(options?.skipOpenSshKnownHosts));
    setConnectionError(null);
    setHostKeyChallenge(null);
    setConnectionPhase(host || shellId ? "opening" : "idle");
    setLiveMode(host ? (host.connectionType === "serial" ? "serial" : "ssh") : shellId ? "pty" : "demo");
    setRetryNonce((n) => n + 1);
    onRetry?.();
  };
  const submitPasswordRetry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPassword = passwordDraft;
    if (!nextPassword) return;
    setSessionPassword(nextPassword);
    setPasswordDraft("");
    handleRetry();
  };
  const decideHostKey = async (decision: HostKeyDecision) => {
    if (!hostKeyChallenge || hostKeyChallenge.submitting) return;
    const current = hostKeyChallenge;
    setHostKeyChallenge({ ...current, submitting: true, error: undefined });
    try {
      await sshHostKeyDecide(current.event.challenge_id, decision);
      setHostKeyChallenge(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/host_key_challenge_(not_found|closed)/i.test(message) && decision !== "reject") {
        pendingHostKeyDecisionRef.current = {
          host: current.event.host,
          port: current.event.port,
          fingerprint: current.event.fingerprint,
          decision,
        };
        setHostKeyChallenge(null);
        handleRetry({ skipOpenSshKnownHosts: true });
        return;
      }
      setHostKeyChallenge({
        ...current,
        submitting: false,
        error: message,
      });
    }
  };
  const forgetTrustedHostKeyAndRetry = async () => {
    if (!hostKeyChallenge || hostKeyChallenge.submitting) return;
    const current = hostKeyChallenge;
    setHostKeyChallenge({ ...current, submitting: true, error: undefined });
    try {
      await sshHostKeyDecide(current.event.challenge_id, "reject").catch(() => undefined);
      await sshForgetTrustedHostKey(current.event.host, current.event.port);
      setHostKeyChallenge(null);
      handleRetry({ skipOpenSshKnownHosts: true });
    } catch (error) {
      setHostKeyChallenge({
        ...current,
        submitting: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
        <span className={"status " + connectionStatusClass}>
          <span className={"latency " + (connectionStatusClass || "ok")} style={{ background: "currentColor" }} />
          <span>{connectionStatusLabel}</span>
        </span>
        <div className="spacer" />
        <div className="conn-actions">
          <button className="icon-btn" title={t("conn.action.reconnect", lang)} onClick={() => handleRetry()}>{Icon.refresh}</button>
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
          {hostKeyChallenge && (
            <HostKeyChallengeOverlay
              lang={lang}
              challenge={hostKeyChallenge.event}
              submitting={hostKeyChallenge.submitting}
              error={hostKeyChallenge.error}
              onDecide={decideHostKey}
              onForgetTrustedHostKey={forgetTrustedHostKeyAndRetry}
            />
          )}
          {hasError && host && (
            <div className="connection-error">
              <span className="eyebrow">{t("conn.error.eyebrow", lang)}</span>
              <h2>{t("conn.error.title", lang)}</h2>
              <p>{describeConnectionError(connectionError, lang)}</p>
              <div className="connection-error__target">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text)" }}>
                  {host.connectionType === "serial"
                    ? `${host.user}@${host.serialProfile?.portName || host.hostname || host.alias}`
                    : `${host.user}@${host.hostname}:${host.port}`}
                </span>
              </div>
              {host.identityFile && (
                <div className="connection-error__target" style={{ fontSize: 11 }}>
                  <span className="k" style={{ color: "var(--text-mute)" }}>{t("host.eyebrow.key", lang)}: </span>
                  <span>{host.identityFile}</span>
                </div>
              )}
              {host.connectionType !== "serial" && isPasswordRecoverableError(connectionError) && (
                <form className="connection-error__password" onSubmit={submitPasswordRetry}>
                  <label>
                    <span className="k">{t("manual.field.password", lang)}</span>
                    <input
                      type="password"
                      value={passwordDraft}
                      onChange={(event) => setPasswordDraft(event.target.value)}
                      placeholder={t("term.password.placeholder", lang)}
                      autoComplete="current-password"
                    />
                  </label>
                  <button className="btn" type="submit" disabled={!passwordDraft}>
                    {Icon.power}
                    <span>{t("term.password.retry", lang)}</span>
                  </button>
                </form>
              )}
              <div className="connection-error__actions">
                <button className="btn" onClick={() => handleRetry()}>
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
        <span className="item"><span className="key">{t("status.shell", lang)}</span><span>{shellStatusLabel}</span></span>
        <span style={{ flex: 1 }} />
        <span className="item" style={{ color: "var(--text-mute)" }}>
          <span>{host ? (host.connectionType === "serial" ? t("status.protocol.serial", lang) : `${t("status.protocol.tcp", lang)}/${host.port}`) : t("status.shell.local", lang)} . </span>
          <span>{clock.toLocaleTimeString()}</span>
        </span>
      </div>
    </>
  );
}

function HostKeyChallengeOverlay({
  lang,
  challenge,
  submitting,
  error,
  onDecide,
  onForgetTrustedHostKey,
}: {
  lang: Lang;
  challenge: HostKeyChallenge;
  submitting: boolean;
  error?: string;
  onDecide: (decision: HostKeyDecision) => void;
  onForgetTrustedHostKey: () => void;
}) {
  const isMismatch = challenge.status === "mismatch";
  return (
    <div className={"host-key-challenge" + (isMismatch ? " host-key-challenge--danger" : "")}>
      <span className="eyebrow">{t("hostkey.eyebrow", lang)}</span>
      <h2>{t(isMismatch ? "hostkey.mismatch.title" : "hostkey.unknown.title", lang)}</h2>
      <p>
        {t(isMismatch ? "hostkey.mismatch.body" : "hostkey.unknown.body", lang, {
          host: challenge.host,
          port: challenge.port,
        })}
      </p>
      <div className="host-key-challenge__grid">
        <span className="k">{t("hostkey.field.host", lang)}</span>
        <span className="v">{challenge.host}:{challenge.port}</span>
        <span className="k">{t("hostkey.field.type", lang)}</span>
        <span className="v">{challenge.key_type}</span>
        <span className="k">{t("hostkey.field.fingerprint", lang)}</span>
        <span className="v host-key-challenge__fingerprint">{challenge.fingerprint}</span>
        {challenge.known_fingerprints.length > 0 && (
          <>
            <span className="k">{t("hostkey.field.known", lang)}</span>
            <span className="v host-key-challenge__fingerprint">
              {challenge.known_fingerprints.join(", ")}
            </span>
          </>
        )}
      </div>
      {error && <div className="host-key-challenge__error">{error}</div>}
      <div className="host-key-challenge__actions">
        <button className="btn ghost" disabled={submitting} onClick={() => onDecide("reject")}>
          {t("hostkey.action.reject", lang)}
        </button>
        {!isMismatch && !challenge.can_remember && (
          <button className="btn ghost" disabled={submitting} onClick={() => onDecide("accept_once")}>
            {t("hostkey.action.acceptOnce", lang)}
          </button>
        )}
        {!isMismatch && challenge.can_remember && (
          <button className="btn" disabled={submitting} onClick={() => onDecide("accept_and_remember")}>
            {t("hostkey.action.trust", lang)}
          </button>
        )}
        {isMismatch && (
          <button className="btn danger" disabled={submitting} onClick={onForgetTrustedHostKey}>
            {t("hostkey.action.forgetAndRetry", lang)}
          </button>
        )}
      </div>
    </div>
  );
}

function safeFit(fit: FitAddon) {
  if (!isFitReady(fit)) return false;
  try {
    fit.fit();
    return true;
  } catch {
    // xterm may briefly have zero-sized cells during first paint.
    return false;
  }
}

function isFitReady(fit: FitAddon) {
  const candidate = fit as unknown as {
    _terminal?: {
      _core?: {
        _renderService?: {
          _renderer?: {
            value?: unknown;
          };
        };
      };
    };
  };
  return Boolean(candidate._terminal?._core?._renderService?._renderer?.value);
}

function shouldLoadWebglAddon(enabled: boolean) {
  if (!enabled) return false;
  const tauriWindow = window as Window & { __TAURI_INTERNALS__?: unknown };
  if (!tauriWindow.__TAURI_INTERNALS__) return false;
  if (/Headless/i.test(navigator.userAgent)) return false;
  const canvas = document.createElement("canvas");
  try {
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function resolveTerminalEnv(terminalLocale: TerminalLocale, terminalTimezone: TerminalTimezone) {
  return {
    terminalLocale: terminalLocale === "system" ? undefined : terminalLocale,
    terminalTimezone: terminalTimezone === "system" ? undefined : terminalTimezone,
  };
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

function rawErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

function resolveSerialProfile(profile?: SerialProfile): SerialProfile {
  const fallback = SERIAL_PRESETS.find((preset) => preset.id === "generic-9600-8n1")?.profile ?? SERIAL_PRESETS[0].profile;
  return {
    ...fallback,
    ...profile,
    presetId: profile?.presetId ?? fallback.presetId,
  };
}

export function describeConnectionError(error: unknown, lang: Lang = "en") {
  const raw = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  if (!raw) return t("conn.error.message.generic", lang);

  // Categorize common SSH errors
  if (/kex_no_common_algorithm/i.test(raw)) {
    return t("conn.error.message.kexNoCommonAlgorithm", lang);
  }
  if (/host_key_algo_no_common/i.test(raw)) {
    return t("conn.error.message.hostKeyAlgoNoCommon", lang);
  }
  if (/algo_no_common/i.test(raw)) {
    return t("conn.error.message.algoNoCommon", lang);
  }
  if (/host_key_mismatch/i.test(raw)) {
    return t("conn.error.message.hostKeyMismatch", lang);
  }
  if (/host_key_rejected/i.test(raw)) {
    return t("conn.error.message.hostKeyRejected", lang);
  }
  if (/host_key_timeout/i.test(raw)) {
    return t("conn.error.message.hostKeyTimeout", lang);
  }
  if (/host_key_store_failed/i.test(raw)) {
    return t("conn.error.message.hostKeyStoreFailed", lang);
  }
  if (/auth_timeout|authentication timed out|password authentication timed out|keyboard-interactive authentication timed out/i.test(raw)) {
    return t("conn.error.message.authTimeout", lang);
  }
  if (/dns|resolve|could not resolve|lookup|host.?name|getaddrinfo|name or service not known|no address associated|nodename nor servname/i.test(raw)) {
    return t("conn.error.message.dns", lang);
  }
  if (/no route|network is unreachable|network unreachable|host unreachable|enetunreach|ehostunreach/i.test(raw)) {
    return t("conn.error.message.route", lang);
  }
  if (/connection refused|actively refused|econnrefused|refused/i.test(raw)) {
    return t("conn.error.message.refused", lang);
  }
  if (/timeout|timed out|no response/i.test(raw)) {
    return t("conn.error.message.timeout", lang);
  }
  if (/password_required|no_credentials/i.test(raw)) {
    return t("conn.error.message.passwordRequired", lang);
  }
  if (/username_invalid/i.test(raw)) {
    return t("conn.error.message.username", lang);
  }
  if (/key_passphrase_needed|passphrase|encrypted private key|unable to decrypt|bad decrypt|invalid passphrase/i.test(raw)) {
    return t("conn.error.message.passphrase", lang);
  }
  if (/auth|permission denied|password|publickey|keyboard-interactive|no supported auth|all authentication methods failed/i.test(raw)) {
    return t("conn.error.message.auth", lang);
  }
  if (/reset|broken pipe|connection reset|disconnect/i.test(raw)) {
    return t("conn.error.message.reset", lang);
  }

  return raw || t("conn.error.message.generic", lang);
}

export function isPasswordRecoverableError(error: unknown) {
  const raw = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  return /password_required|no_credentials|password_incorrect|auth_timeout|authentication timed out|permission denied|publickey|keyboard-interactive|no supported auth|all authentication methods failed/i.test(raw);
}
