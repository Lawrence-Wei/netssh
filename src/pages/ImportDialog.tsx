// Host importer. Accepts .xlsx / .json / .csv files and optionally reads
// ~/.ssh/{config,known_hosts} via the Rust side. The user picks the file via
// a hidden <input type="file">, we parse client-side and call onImport().

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { t } from "../utils/i18n";
import { parseSshConfig } from "../api/tauri";
import type { Host, Lang } from "../config/types";

interface ImportDialogProps {
  lang: Lang;
  onClose: () => void;
  onImport: (hosts: Omit<Host, "id">[]) => void;
}

type ImportSource = "xlsx" | "json" | "csv" | "ssh";

export function ImportDialog({ lang, onClose, onImport }: ImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      finish(hosts);
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
        hostname: entry.hostname,
        user: entry.user || "root",
        port: entry.port || 22,
        identityFile: entry.identityFile,
        group: "unassigned",
        status: "off",
        latency: null,
      }));
      finish(hosts);
    } catch (err) {
      setStatus(
        t("import.failed", lang, { error: err instanceof Error ? err.message : String(err) })
      );
    } finally {
      setBusy(false);
    }
  };

  const finish = (hosts: Omit<Host, "id">[]) => {
    if (hosts.length === 0) {
      setStatus(t("import.empty", lang));
      return;
    }
    onImport(hosts);
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
        {status && <div className="import-status">{status}</div>}
        <div className="confirm-card__actions">
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
    return normalizeRows(Array.isArray(data) ? data : data.hosts || []);
  }
  if (kind === "csv") {
    const text = await file.text();
    return normalizeRows(parseCsv(text));
  }
  // xlsx (or .xls)
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return normalizeRows(rows);
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

function normalizeRows(rows: unknown[]): Omit<Host, "id">[] {
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
