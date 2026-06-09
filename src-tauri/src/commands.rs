// Tauri command surface — all #[tauri::command] entry points.
// Each command is a thin wrapper that delegates to its module.

use std::collections::HashMap;
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::{credentials, pty, ssh, ssh_config, storage};

#[derive(Default)]
pub struct AppState {
    pub ssh_sessions: Mutex<HashMap<String, ssh::SshSession>>,
    pub pty_sessions: Mutex<HashMap<String, pty::PtySession>>,
    pub serial_sessions: Mutex<HashMap<String, serial::SerialSession>>,
    pub host_key_challenges: ssh::HostKeyChallengeRegistry,
}

// ─── ssh_config ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn config_parse(path: Option<String>) -> Result<Vec<ssh_config::HostEntry>, String> {
    ssh_config::parse(path).map_err(|e| e.to_string())
}

// ─── remote SSH ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SshOpenArgs {
    pub alias: String,
    pub host: String,
    pub user: String,
    pub port: u16,
    pub identity_file: Option<String>,
    pub password: Option<String>,
    pub passphrase: Option<String>,
}

#[tauri::command]
pub async fn ssh_open(
    app: AppHandle,
    state: State<'_, AppState>,
    args: SshOpenArgs,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let session = ssh::SshSession::connect(&app, &id, args, state.host_key_challenges.clone())
        .await
        .map_err(|e| e.to_string())?;
    state
        .ssh_sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(id.clone(), session);
    Ok(id)
}

#[tauri::command]
pub fn ssh_host_key_decide(
    state: State<'_, AppState>,
    challenge_id: String,
    decision: ssh::HostKeyDecision,
) -> Result<(), String> {
    let sender = state
        .host_key_challenges
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&challenge_id);

    let Some(sender) = sender else {
        return Err("host_key_challenge_not_found".into());
    };

    sender
        .send(decision)
        .map_err(|_| "host_key_challenge_closed".to_string())
}

#[tauri::command]
pub fn ssh_send(state: State<'_, AppState>, id: String, data: Vec<u8>) -> Result<(), String> {
    let sessions = state
        .ssh_sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(s) = sessions.get(&id) {
        s.send(&data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn ssh_resize(state: State<'_, AppState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state
        .ssh_sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(s) = sessions.get(&id) {
        s.resize(cols, rows).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_close(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let session = state
        .ssh_sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&id);
    if let Some(s) = session {
        s.close().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── local PTYs ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn pty_open(app: AppHandle, state: State<'_, AppState>, shell_id: String) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let session = pty::PtySession::spawn(&app, &id, &shell_id).map_err(|e| e.to_string())?;
    state
        .pty_sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(id.clone(), session);
    Ok(id)
}

#[tauri::command]
pub fn pty_send(state: State<'_, AppState>, id: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(s) = state
        .pty_sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&id)
    {
        s.send(&data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_resize(state: State<'_, AppState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    if let Some(s) = state
        .pty_sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&id)
    {
        s.resize(cols, rows).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_close(state: State<'_, AppState>, id: String) -> Result<(), String> {
    if let Some(s) = state
        .pty_sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&id)
    {
        let _ = s.close();
    }
    Ok(())
}

// ─── serial backend ───────────────────────────────────────────────────────

#[tauri::command]
pub fn serial_list_ports() -> Result<Vec<serial::SerialPortInfo>, String> {
    serial::list_ports().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn serial_open(
    app: AppHandle,
    state: State<'_, AppState>,
    args: serial::SerialOpenArgs,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let session = serial::SerialSession::open(&app, &id, args).map_err(|e| e.to_string())?;
    state
        .serial_sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(id.clone(), session);
    Ok(id)
}

#[tauri::command]
pub fn serial_send(state: State<'_, AppState>, id: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(s) = state
        .serial_sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&id)
    {
        s.send(&data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn serial_resize(state: State<'_, AppState>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    if let Some(s) = state
        .serial_sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&id)
    {
        s.resize(cols, rows).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn serial_close(state: State<'_, AppState>, id: String) -> Result<(), String> {
    if let Some(s) = state
        .serial_sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&id)
    {
        let _ = s.close();
    }
    Ok(())
}

// ─── shell detection ───────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ShellInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub is_default: bool,
}

#[tauri::command]
pub fn shells_detect() -> Vec<ShellInfo> {
    pty::detect_local_shells()
}

// ─── key listing ───────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SshKey {
    pub id: String,
    pub name: String,
    pub key_type: String,
    pub fingerprint: String,
    pub path: String,
}

#[tauri::command]
pub fn keys_list() -> Result<Vec<SshKey>, String> {
    ssh::list_keys().map_err(|e| e.to_string())
}

// ─── credentials (Windows Credential Manager) ──────────────────────────────

#[tauri::command]
pub fn cred_store(account: String, secret: String) -> Result<(), String> {
    credentials::store(&account, &secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cred_load(account: String) -> Result<String, String> {
    credentials::load(&account).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cred_delete(account: String) -> Result<(), String> {
    credentials::delete(&account).map_err(|e| e.to_string())
}

// ─── i18n ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn i18n_detect_system() -> String {
    #[cfg(windows)]
    {
        use windows::Globalization::Language;
        if let Ok(tag) = Language::CurrentInputMethodLanguageTag() {
            let tag = tag.to_string().to_lowercase();
            if tag.starts_with("zh") || tag.contains("hans") {
                return "zh".into();
            }
        }
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        if let Ok(locale) = std::env::var("LC_ALL").or_else(|_| std::env::var("LANG")) {
            let locale = locale.to_lowercase();
            if locale.starts_with("zh") || locale.contains("zh_") {
                return "zh".into();
            }
        }
    }

    "en".into()
}

// ─── reachability ─────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct PingResult {
    pub ok: bool,
    pub latency_ms: Option<u64>,
}

#[tauri::command]
pub async fn host_ping(host: String, port: u16) -> PingResult {
    use std::time::Instant;
    let addr = format!("{}:{}", host, if port == 0 { 22 } else { port });
    let start = Instant::now();
    let probe = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        tokio::net::TcpStream::connect(&addr),
    )
    .await;
    match probe {
        Ok(Ok(_)) => PingResult {
            ok: true,
            latency_ms: Some(start.elapsed().as_millis() as u64),
        },
        _ => PingResult {
            ok: false,
            latency_ms: None,
        },
    }
}

// ─── local app storage ────────────────────────────────────────────────────

#[tauri::command]
pub fn app_state_get(key: String) -> Result<Option<String>, String> {
    let conn = storage::open().map_err(|e| e.to_string())?;
    storage::get_app_state(&conn, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_state_put(key: String, value: String) -> Result<(), String> {
    let conn = storage::open().map_err(|e| e.to_string())?;
    storage::put_app_state(&conn, &key, &value).map_err(|e| e.to_string())
}

// ─── local operation log ────────────────────────────────────────────────────

#[tauri::command]
pub fn connection_log_open(host_alias: String) -> Result<String, String> {
    let conn = storage::open().map_err(|e| e.to_string())?;
    storage::open_connection_log(&conn, &host_alias).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
pub struct ConnectionLogClose {
    pub log_id: String,
    pub bytes_in: i64,
    pub bytes_out: i64,
    pub exit_status: Option<i32>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn connection_log_close(args: ConnectionLogClose) -> Result<(), String> {
    let conn = storage::open().map_err(|e| e.to_string())?;
    storage::close_connection_log(
        &conn,
        &args.log_id,
        args.bytes_in,
        args.bytes_out,
        args.exit_status,
        args.error.as_deref(),
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

// Used by ssh + pty modules to push bytes back to JS.
pub fn emit_data(app: &AppHandle, channel: &str, id: &str, data: &[u8]) {
    let _ = app.emit(
        &format!("{}:{}:data", channel, id),
        // base64 keeps binary clean over IPC
        base64_encode(data),
    );
}

fn base64_encode(b: &[u8]) -> String {
    STANDARD.encode(b)
}
