// Host importer. Accepts .xlsx / .json / .csv files and optionally reads
// ~/.ssh/{config,known_hosts} via the Rust side. The user picks the file via
// a hidden <input type="file">, we parse client-side and call onImport().

import { useRef, useState } from "react";
import { exists } from "@tauri-apps/plugin-fs";
import * as XLSX from "xlsx";
import { t } from "../utils/i18n";
import { parseSshConfig } from "../api/tauri";
import type { Host, Lang } from "../config/types";

interface ImportDialogProps {
  lang: Lang;
  existingHosts: Host[];
  onClose: () => void;
  onImport: (hosts: Omit<Host, "id">[]) => void;
}

type ImportSource = "xlsx" | "json" | "csv" | "ssh";
type ImportDiagnosticLevel = "info" | "warn";

interface ImportDiagnostic {
  level: ImportDiagnosticLevel;
  message: string;
}

export function ImportDialog({ lang, existingHosts, onClose, onImport }: ImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewHosts, setPreviewHosts] = useState<Omit<Host, "id">[]>([]);
  const [diagnostics, setDiagnostics] = useState<ImportDiagnostic[]>([]);

  const pickFile = (kind: ImportSource) => {
    if (!fileRef.current) return;
    fileRef.current.accept =
      kind === "xlsx" ? ".xlsx,.xls" : kind === "json" ? ".json" : ".csv";
    fileRef.current.dataset.kind = kind;
    fileRef.current.click();
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const kind = (event.target.dataset.kind as ImportSource) || "json";
    try {
      setBusy(true);
      setStatus(t("import.parsing", lang));
      const hosts = await parseFile(file, kind);
      await finish(hosts, kind);
    } catch (err) {
      setStatus(
        t("import.failed", lang, { error: err instanceof Error ? err.message : String(err) })
      );
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };

  const fromSshDir = async () => {
    try {
      setBusy(true);
      setStatus(t("import.reading.ssh", lang));
      const entries = await parseSshConfig();
      const hosts: Omit<Host, "id">[] = entries.map((entry) => ({
        alias: entry.alias,
        aliases: entry.aliases,
        hostname: entry.hostname,
        user: entry.user || "root",
        port: entry.port || 22,
        identityFile: entry.identityFile,
        group: entry.group || "unassigned",
        connectionType: "ssh",
        source: entry.source || "ssh-config",
        status: "off",
        latency: null,
      }));
      await finish(hosts, "ssh");
    } catch (err) {
      setStatus(
        t("import.failed", lang, { error: err instanceof Error ? err.message : String(err) })
      );
    } finally {
      setBusy(false);
    }
  };

  const finish = async (hosts: Omit<Host, "id">[], source: ImportSource) => {
    if (hosts.length === 0) {
      setStatus(t("import.empty", lang));
      return;
    }
    const normalized = hosts.map((host) => ({
      ...host,
      connectionType: host.connectionType || "ssh",
      source: host.source || importSourceToHostSource(source),
    }));
    setPreviewHosts(normalized);
    setDiagnostics(await buildDiagnostics(normalized, existingHosts, lang));
    setStatus(null);
  };

  const confirmImport = () => {
    if (previewHosts.length === 0) return;
    onImport(previewHosts);
    onClose();
  };

  return (
    <div className="confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="confirm-card import-card" role="dialog" aria-modal="true">
        <div className="confirm-card__title">{t("import.title", lang)}</div>
        <div className="confirm-card__message">{t("import.lead", lang)}</div>
        <div className="import-grid">
          <button className="import-tile" disabled={busy} onClick={() => pickFile("xlsx")}>
            <span className="import-tile__glyph">XLS</span>
            <span className="import-tile__label">{t("import.source.xlsx", lang)}</span>
          </button>
          <button className="import-tile" disabled={busy} onClick={() => pickFile("json")}>
            <span className="import-tile__glyph">JSON</span>
            <span className="import-tile__label">{t("import.source.json", lang)}</span>
          </button>
          <button className="import-tile" disabled={busy} onClick={() => pickFile("csv")}>
            <span className="import-tile__glyph">CSV</span>
            <span className="import-tile__label">{t("import.source.csv", lang)}</span>
          </button>
          <button className="import-tile" disabled={busy} onClick={fromSshDir}>
            <span className="import-tile__glyph">.ssh</span>
            <span className="import-tile__label">{t("import.source.ssh", lang)}</span>
          </button>
        </div>
        {previewHosts.length > 0 && (
          <div className="import-preview">
            <div className="confirm-card__title" style={{ fontSize: 14 }}>
              {lang === "zh" ? "导入预览" : "Import preview"}
            </div>
            <div className="import-status">
              {lang === "zh"
                ? `准备导入 ${previewHosts.length} 个资产。`
                : `${previewHosts.length} asset(s) ready to import.`}
            </div>
            {diagnostics.length > 0 && (
              <div className="import-diagnostics">
                {diagnostics.map((item, index) => (
                  <div key={`${item.level}-${index}`} className={`import-diagnostic import-diagnostic--${item.level}`}>
                    {item.message}
                  </div>
                ))}
              </div>
            )}
            <div className="import-preview-list">
              {previewHosts.slice(0, 8).map((host) => (
                <div key={`${host.alias}-${host.hostname}`} className="import-preview-row">
                  <span>{host.alias}</span>
                  <span>{host.user}@{host.hostname}:{host.port || 22}</span>
                  <span>{host.group}</span>
                </div>
              ))}
              {previewHosts.length > 8 && (
                <div className="import-status">
                  {lang === "zh" ? `另有 ${previewHosts.length - 8} 个资产未显示。` : `${previewHosts.length - 8} more asset(s) hidden.`}
                </div>
              )}
            </div>
          </div>
        )}
        {status && <div className="import-status">{status}</div>}
        <div className="confirm-card__actions">
          {previewHosts.length > 0 && (
            <button className="btn" onClick={confirmImport} disabled={busy}>
              {lang === "zh" ? "确认导入" : "Import"}
            </button>
          )}
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel", lang)}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          style={{ display: "none" }}
          onChange={onFile}
        />
      </div>
    </div>
  );
}

async function parseFile(file: File, kind: ImportSource): Promise<Omit<Host, "id">[]> {
  if (kind === "json") {
    const text = await file.text();
    const data = JSON.parse(text);
    return normalizeRows(Array.isArray(data) ? data : data.hosts || [], "json");
  }
  if (kind === "csv") {
    const text = await file.text();
    return normalizeRows(parseCsv(text), "csv");
  }
  // xlsx (or .xls)
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return normalizeRows(rows, "xlsx");
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map((cell) => cell.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((key, idx) => {
      row[key] = (cells[idx] || "").trim();
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function importSourceToHostSource(source: ImportSource): Host["source"] {
  if (source === "ssh") return "ssh-config";
  return source;
}

function normalizeRows(rows: unknown[], source: ImportSource): Omit<Host, "id">[] {
  const out: Omit<Host, "id">[] = [];
  rows.forEach((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    const record = row as Record<string, unknown>;
    const pick = (...names: string[]) => {
      for (const n of names) {
        const lower = n.toLowerCase();
        for (const key of Object.keys(record)) {
          if (key.toLowerCase() === lower) {
            const value = record[key];
            if (value !== undefined && value !== null && value !== "") return String(value);
          }
        }
      }
      return undefined;
    };
    const alias = pick("alias", "name", "别名", "主机名");
    const hostname = pick("hostname", "host", "ip", "dns", "address", "地址");
    if (!alias && !hostname) return;
    const user = pick("user", "username", "用户名", "用户") || "root";
    const portRaw = pick("port", "端口");
    const port = portRaw ? Number(portRaw) || 22 : 22;
    const os = pick("os", "system", "operating system", "系统");
    const role = pick("role", "type", "角色") || os;
    const group = pick("group", "site", "分组", "站点") || "unassigned";
    const env = pick("env", "environment", "环境");
    const notes = pick("notes", "remark", "备注");
    const identity = pick("identityfile", "key", "密钥");
    const tags = pick("tags", "tag", "标签");
    out.push({
      alias: alias || hostname!,
      hostname: hostname || alias!,
      user,
      port,
      identityFile: identity,
      group,
      connectionType: "ssh",
      source: importSourceToHostSource(source),
      role,
      env,
      tags: tags
        ? tags.split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean)
        : os
        ? [os.toLowerCase()]
        : undefined,
      notes,
      status: "off",
      latency: null,
    });
  });
  return out;
}

async function buildDiagnostics(
  hosts: Omit<Host, "id">[],
  existingHosts: Host[],
  lang: Lang
): Promise<ImportDiagnostic[]> {
  const diagnostics: ImportDiagnostic[] = [];
  const aliases = new Map<string, string[]>();
  const hostnames = new Map<string, string[]>();
  const existingAliases = new Set(existingHosts.map((host) => host.alias.toLowerCase()));
  const identityChecks: Promise<void>[] = [];

  hosts.forEach((host) => {
    const allAliases = host.aliases && host.aliases.length > 0 ? host.aliases : [host.alias];
    allAliases.forEach((alias) => {
      const key = alias.toLowerCase();
      aliases.set(key, [...(aliases.get(key) || []), host.alias]);
      if (existingAliases.has(key)) {
        diagnostics.push({
          level: "warn",
          message: lang === "zh"
            ? `已存在同名资产：${alias}，导入时会跳过。`
            : `Existing asset alias "${alias}" will be skipped during import.`,
        });
      }
    });

    const hostnameKey = `${host.hostname}:${host.port || 22}`.toLowerCase();
    hostnames.set(hostnameKey, [...(hostnames.get(hostnameKey) || []), host.alias]);

    if (!host.identityFile) {
      diagnostics.push({
        level: "info",
        message: lang === "zh"
          ? `${host.alias} 未指定 IdentityFile，将使用密码或 ssh-agent。`
          : `${host.alias} has no IdentityFile and will rely on password or ssh-agent.`,
      });
    } else {
      identityChecks.push(
        checkIdentityFile(host.identityFile).then((result) => {
          if (result === "present") return;
          diagnostics.push({
            level: "warn",
            message: identityFileDiagnosticMessage(host.alias, host.identityFile!, result, lang),
          });
        })
      );
    }

    if (host.port && host.port !== 22) {
      diagnostics.push({
        level: "info",
        message: lang === "zh"
          ? `${host.alias} 使用非标准 SSH 端口 ${host.port}。`
          : `${host.alias} uses non-standard SSH port ${host.port}.`,
      });
    }
  });

  aliases.forEach((owners, alias) => {
    if (owners.length > 1) {
      diagnostics.push({
        level: "warn",
        message: lang === "zh"
          ? `导入内容里重复出现 Host alias：${alias}。`
          : `Duplicate Host alias in import: ${alias}.`,
      });
    }
  });

  hostnames.forEach((owners, target) => {
    if (owners.length > 1) {
      diagnostics.push({
        level: "warn",
        message: lang === "zh"
          ? `多个资产指向同一目标 ${target}：${owners.join(", ")}。`
          : `Multiple assets point to ${target}: ${owners.join(", ")}.`,
      });
    }
  });

  await Promise.all(identityChecks);

  if (diagnostics.length === 0) {
    diagnostics.push({
      level: "info",
      message: lang === "zh" ? "未发现明显冲突。" : "No obvious conflicts found.",
    });
  }

  return diagnostics;
}

async function checkIdentityFile(path: string): Promise<"present" | "missing" | "unknown"> {
  try {
    return (await exists(path)) ? "present" : "missing";
  } catch {
    return "unknown";
  }
}

function identityFileDiagnosticMessage(
  alias: string,
  path: string,
  result: "missing" | "unknown",
  lang: Lang
): string {
  if (result === "unknown") {
    return lang === "zh"
      ? `${alias} 指定的 IdentityFile 无法检查：${path}。`
      : `${alias} references an IdentityFile that could not be checked: ${path}.`;
  }
  return lang === "zh"
    ? `${alias} 指定的 IdentityFile 不存在：${path}。`
    : `${alias} references a missing IdentityFile: ${path}.`;
}
