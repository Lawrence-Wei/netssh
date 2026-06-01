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
