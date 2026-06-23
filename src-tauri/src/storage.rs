// Local metadata storage. SQLite under %APPDATA%\Netssh\db.sqlite.
// E2E can set NETSSH_DATA_DIR to isolate test state from a user's real app data.
//
// What's stored:  hosts (extra metadata on top of ssh_config — tags, notes,
//                 pin state, hue, last_seen, latency snapshot)
//                 groups (id, name, color)
//                 snippets (id, category, name, cmd, tags)
//                 settings (key, value)  — single-row table for UI prefs
//                 host_quick_cmds  (host_id, name, cmd)
//                 connection_log   (session_id, host_alias, opened_at,
//                                   closed_at, bytes_in, bytes_out,
//                                   exit_status, error)
//
// What's NEVER stored: passwords, passphrases, private key contents,
// command bodies typed in a session.

use anyhow::Result;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn db_path() -> Result<PathBuf> {
    let dir = data_dir()?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("db.sqlite"))
}

pub fn data_dir() -> Result<PathBuf> {
    let dir = if let Ok(path) = std::env::var("NETSSH_DATA_DIR") {
        PathBuf::from(path)
    } else {
        dirs::data_dir()
            .ok_or_else(|| anyhow::anyhow!("no AppData dir"))?
            .join("Netssh")
    };
    Ok(dir)
}

pub fn open() -> Result<Connection> {
    let path = db_path()?;
    let conn = Connection::open(path)?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS host_meta (
          alias       TEXT PRIMARY KEY,
          group_id    TEXT,
          tags        TEXT,        -- JSON array
          notes       TEXT,
          pinned      INTEGER NOT NULL DEFAULT 0,
          hue         TEXT,
          last_seen   INTEGER
        );

        CREATE TABLE IF NOT EXISTS groups (
          id    TEXT PRIMARY KEY,
          name  TEXT NOT NULL,
          color TEXT
        );

        CREATE TABLE IF NOT EXISTS snippets (
          id        TEXT PRIMARY KEY,
          category  TEXT NOT NULL,
          name      TEXT NOT NULL,
          cmd       TEXT NOT NULL,
          tags      TEXT,         -- JSON array
          shells    TEXT          -- JSON array
        );

        CREATE TABLE IF NOT EXISTS host_quick_cmds (
          host_alias TEXT NOT NULL,
          name       TEXT NOT NULL,
          cmd        TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS connection_log (
          id          TEXT PRIMARY KEY,
          host_alias  TEXT NOT NULL,
          opened_at   INTEGER NOT NULL,
          closed_at   INTEGER,
          bytes_in    INTEGER NOT NULL DEFAULT 0,
          bytes_out   INTEGER NOT NULL DEFAULT 0,
          exit_status INTEGER,
          error       TEXT
        );

        CREATE TABLE IF NOT EXISTS trusted_host_keys (
          host        TEXT NOT NULL,
          port        INTEGER NOT NULL,
          key_type    TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          trusted_at  INTEGER NOT NULL,
          PRIMARY KEY (host, port, fingerprint)
        );

        CREATE TABLE IF NOT EXISTS config_backups (
          id         TEXT PRIMARY KEY,
          host_alias TEXT NOT NULL,
          path       TEXT NOT NULL,
          bytes      INTEGER NOT NULL,
          profile    TEXT NOT NULL,
          status     TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        ",
    )?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct ConfigBackupRecord {
    pub id: String,
    pub host_alias: String,
    pub path: String,
    pub bytes: i64,
    pub profile: String,
    pub status: String,
    pub created_at: i64,
}

pub fn backup_root() -> Result<PathBuf> {
    let root = data_dir()?.join("backups");
    std::fs::create_dir_all(&root)?;
    Ok(root)
}

pub fn config_backup_path(host_alias: &str, profile: &str, created_at: i64) -> Result<PathBuf> {
    let host_segment = sanitize_backup_segment(host_alias);
    let profile_segment = sanitize_backup_segment(profile);
    let dir = backup_root()?.join(host_segment);
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(format!("{created_at}-{profile_segment}.txt")))
}

pub fn sanitize_backup_segment(value: &str) -> String {
    let mut out = String::new();
    for ch in value.trim().chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
            out.push(ch);
        } else if ch.is_whitespace()
            || matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        {
            out.push('_');
        }
    }
    let trimmed = out.trim_matches(['.', '_', '-']).to_string();
    if trimmed.is_empty() {
        "host".into()
    } else {
        trimmed.chars().take(80).collect()
    }
}

pub fn now_epoch_seconds() -> Result<i64> {
    Ok(SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64)
}

pub fn record_config_backup(
    conn: &Connection,
    host_alias: &str,
    path: &str,
    bytes: i64,
    profile: &str,
    status: &str,
    created_at: i64,
) -> Result<ConfigBackupRecord> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO config_backups (id, host_alias, path, bytes, profile, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, host_alias, path, bytes, profile, status, created_at],
    )?;
    Ok(ConfigBackupRecord {
        id,
        host_alias: host_alias.into(),
        path: path.into(),
        bytes,
        profile: profile.into(),
        status: status.into(),
        created_at,
    })
}

pub fn list_config_backups(
    conn: &Connection,
    host_alias: Option<&str>,
) -> Result<Vec<ConfigBackupRecord>> {
    let sql = if host_alias.is_some() {
        "SELECT id, host_alias, path, bytes, profile, status, created_at
         FROM config_backups WHERE host_alias = ?1 ORDER BY created_at DESC"
    } else {
        "SELECT id, host_alias, path, bytes, profile, status, created_at
         FROM config_backups ORDER BY created_at DESC"
    };
    let mut stmt = conn.prepare(sql)?;
    let mut records = Vec::new();
    if let Some(alias) = host_alias {
        let rows = stmt.query_map(params![alias], config_backup_record_from_row)?;
        for row in rows {
            records.push(row?);
        }
    } else {
        let rows = stmt.query_map([], config_backup_record_from_row)?;
        for row in rows {
            records.push(row?);
        }
    }
    Ok(records)
}

fn config_backup_record_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ConfigBackupRecord> {
    Ok(ConfigBackupRecord {
        id: row.get(0)?,
        host_alias: row.get(1)?,
        path: row.get(2)?,
        bytes: row.get(3)?,
        profile: row.get(4)?,
        status: row.get(5)?,
        created_at: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_path_segment_removes_path_separators_and_reserved_chars() {
        assert_eq!(sanitize_backup_segment("../core sw:1"), "core_sw_1");
        assert_eq!(sanitize_backup_segment(""), "host");
        assert_eq!(
            sanitize_backup_segment("cisco-core_01.example"),
            "cisco-core_01.example"
        );
    }
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn put_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_app_state(conn: &Connection, key: &str) -> Result<Option<String>> {
    get_setting(conn, key)
}

pub fn put_app_state(conn: &Connection, key: &str, value: &str) -> Result<()> {
    put_setting(conn, key, value)
}

pub fn delete_app_state(conn: &Connection, key: &str) -> Result<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    Ok(())
}

pub fn list_trusted_host_fingerprints(
    conn: &Connection,
    host: &str,
    port: u16,
) -> Result<Vec<String>> {
    let mut stmt =
        conn.prepare("SELECT fingerprint FROM trusted_host_keys WHERE host = ?1 AND port = ?2")?;
    let rows = stmt.query_map(params![host, i64::from(port)], |row| row.get(0))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn open_connection_log(conn: &Connection, host_alias: &str) -> Result<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let opened_at = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;
    conn.execute(
        "INSERT INTO connection_log (id, host_alias, opened_at, bytes_in, bytes_out)
         VALUES (?1, ?2, ?3, 0, 0)",
        params![id, host_alias, opened_at],
    )?;
    Ok(id)
}

pub fn close_connection_log(
    conn: &Connection,
    log_id: &str,
    bytes_in: i64,
    bytes_out: i64,
    exit_status: Option<i32>,
    error: Option<&str>,
) -> Result<()> {
    let closed_at = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;
    conn.execute(
        "UPDATE connection_log
         SET closed_at = ?1, bytes_in = ?2, bytes_out = ?3, exit_status = ?4, error = ?5
         WHERE id = ?6",
        params![closed_at, bytes_in, bytes_out, exit_status, error, log_id],
    )?;
    Ok(())
}

pub fn remember_trusted_host_key(
    conn: &Connection,
    host: &str,
    port: u16,
    key_type: &str,
    fingerprint: &str,
) -> Result<()> {
    let trusted_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs() as i64;
    conn.execute(
        "INSERT INTO trusted_host_keys (host, port, key_type, fingerprint, trusted_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(host, port, fingerprint) DO UPDATE SET
           key_type = excluded.key_type,
           trusted_at = excluded.trusted_at",
        params![host, i64::from(port), key_type, fingerprint, trusted_at],
    )?;
    Ok(())
}

pub fn remove_trusted_host_key(conn: &Connection, host: &str, port: u16) -> Result<()> {
    conn.execute(
        "DELETE FROM trusted_host_keys WHERE host = ?1 AND port = ?2",
        params![host, i64::from(port)],
    )?;
    Ok(())
}
