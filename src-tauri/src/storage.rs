// Local metadata storage. SQLite under %APPDATA%\Netssh\db.sqlite.
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
use std::path::PathBuf;

pub fn db_path() -> Result<PathBuf> {
    let dir = dirs::data_dir()
        .ok_or_else(|| anyhow::anyhow!("no AppData dir"))?
        .join("Netssh");
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("db.sqlite"))
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
        ",
    )?;
    Ok(())
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

pub fn list_trusted_host_fingerprints(
    conn: &Connection,
    host: &str,
    port: u16,
) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT fingerprint FROM trusted_host_keys WHERE host = ?1 AND port = ?2",
    )?;
    let rows = stmt.query_map(params![host, i64::from(port)], |row| row.get(0))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
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
