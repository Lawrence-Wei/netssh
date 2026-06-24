// Tauri command surface — all #[tauri::command] entry points.
// Each command is a thin wrapper that delegates to its module.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::{app_lifecycle, credentials, pty, serial, ssh, ssh_config, storage};

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

#[derive(Clone, Deserialize)]
pub struct SshJumpArgs {
    pub alias: String,
    pub host: String,
    pub user: String,
    pub port: u16,
    pub identity_file: Option<String>,
    pub password: Option<String>,
    pub passphrase: Option<String>,
    pub device_hint: Option<String>,
}

#[derive(Clone, Deserialize)]
pub struct SshOpenArgs {
    pub alias: String,
    pub host: String,
    pub user: String,
    pub port: u16,
    pub identity_file: Option<String>,
    pub password: Option<String>,
    pub passphrase: Option<String>,
    pub skip_open_ssh_known_hosts: Option<bool>,
    pub terminal_locale: Option<String>,
    pub terminal_timezone: Option<String>,
    pub device_hint: Option<String>,
    pub jump: Option<SshJumpArgs>,
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
pub fn ssh_forget_trusted_host_key(host: String, port: u16) -> Result<(), String> {
    let conn = storage::open().map_err(|e| e.to_string())?;
    storage::remove_trusted_host_key(&conn, &host, port).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ssh_send(state: State<'_, AppState>, id: String, data: Vec<u8>) -> Result<(), String> {
    let sessions = state.ssh_sessions.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(s) = sessions.get(&id) {
        s.send(&data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn ssh_resize(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.ssh_sessions.lock().unwrap_or_else(|e| e.into_inner());
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

#[tauri::command]
pub fn ssh_detach(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut sessions = state.ssh_sessions.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(s) = sessions.get_mut(&id) {
        s.detach();
    }
    Ok(())
}

#[tauri::command]
pub fn ssh_reattach(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut sessions = state.ssh_sessions.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(s) = sessions.get_mut(&id) {
        s.reattach();
        Ok(())
    } else {
        Err("session_not_found".into())
    }
}

// ─── local PTYs ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn pty_open(
    app: AppHandle,
    state: State<'_, AppState>,
    shell_id: Option<String>,
    shell_path: Option<String>,
    terminal_locale: Option<String>,
    terminal_timezone: Option<String>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let session = pty::PtySession::spawn(
        &app,
        &id,
        shell_id.as_deref().unwrap_or("pwsh"),
        shell_path.as_deref(),
        terminal_locale.as_deref(),
        terminal_timezone.as_deref(),
    )
    .map_err(|e| e.to_string())?;
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
pub fn pty_resize(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
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
pub fn serial_resize(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
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

// ─── safe readonly checks + config backup ─────────────────────────────────

#[derive(Clone, Deserialize)]
pub struct SshExecHostArgs {
    pub alias: String,
    pub host: String,
    pub user: String,
    pub port: u16,
    pub identity_file: Option<String>,
    pub password: Option<String>,
    pub passphrase: Option<String>,
    pub device_hint: Option<String>,
    pub jump: Option<SshJumpArgs>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReadonlyCheckId {
    Reachability,
    Identity,
    Health,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConfigBackupProfile {
    Cisco,
    Huawei,
    H3c,
    Openwrt,
    Linux,
}

#[derive(Deserialize)]
pub struct ReadonlyCheckRunArgs {
    pub check_id: ReadonlyCheckId,
    pub profile: Option<ConfigBackupProfile>,
    pub host: SshExecHostArgs,
}

#[derive(Serialize)]
pub struct ReadonlyCheckResult {
    pub check_id: ReadonlyCheckId,
    pub status: String,
    pub output: String,
    pub bytes: usize,
    pub duration_ms: u64,
}

#[tauri::command]
pub async fn readonly_check_run(
    app: AppHandle,
    state: State<'_, AppState>,
    args: ReadonlyCheckRunArgs,
) -> Result<ReadonlyCheckResult, String> {
    let started = Instant::now();
    if args.check_id == ReadonlyCheckId::Reachability {
        let ping = host_ping(args.host.host.clone(), args.host.port).await;
        let output = if ping.ok {
            format!(
                "TCP {}:{} reachable in {} ms",
                args.host.host,
                args.host.port,
                ping.latency_ms.unwrap_or_default()
            )
        } else {
            format!("TCP {}:{} unreachable", args.host.host, args.host.port)
        };
        return Ok(ReadonlyCheckResult {
            check_id: args.check_id,
            status: if ping.ok { "ok" } else { "failed" }.into(),
            bytes: output.len(),
            output,
            duration_ms: started.elapsed().as_millis() as u64,
        });
    }

    let profile = args
        .profile
        .unwrap_or_else(|| infer_profile_from_hint(args.host.device_hint.as_deref()));
    let command = readonly_command(args.check_id, profile)?;
    let exec_id = uuid::Uuid::new_v4().to_string();
    let output = ssh::run_exec(
        &app,
        &exec_id,
        args.host,
        command,
        state.host_key_challenges.clone(),
    )
    .await
    .map_err(|e| e.to_string())?;
    let bytes = output.len();
    Ok(ReadonlyCheckResult {
        check_id: args.check_id,
        status: "ok".into(),
        output,
        bytes,
        duration_ms: started.elapsed().as_millis() as u64,
    })
}

#[derive(Deserialize)]
pub struct ConfigBackupRunArgs {
    pub profile: ConfigBackupProfile,
    pub host: SshExecHostArgs,
}

#[derive(Serialize)]
pub struct ConfigBackupRunResult {
    pub record: storage::ConfigBackupRecord,
}

#[tauri::command]
pub async fn config_backup_run(
    app: AppHandle,
    state: State<'_, AppState>,
    args: ConfigBackupRunArgs,
) -> Result<ConfigBackupRunResult, String> {
    let command = config_backup_command(args.profile)?;
    let exec_id = uuid::Uuid::new_v4().to_string();
    let output = ssh::run_exec(
        &app,
        &exec_id,
        args.host.clone(),
        command,
        state.host_key_challenges.clone(),
    )
    .await
    .map_err(|e| e.to_string())?;
    let created_at = storage::now_epoch_seconds().map_err(|e| e.to_string())?;
    let path = storage::config_backup_path(
        &args.host.alias,
        config_backup_profile_key(args.profile),
        created_at,
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(&path, output.as_bytes()).map_err(|e| e.to_string())?;
    let conn = storage::open().map_err(|e| e.to_string())?;
    let record = storage::record_config_backup(
        &conn,
        &args.host.alias,
        &path.to_string_lossy(),
        output.len() as i64,
        config_backup_profile_key(args.profile),
        "ok",
        created_at,
    )
    .map_err(|e| e.to_string())?;
    Ok(ConfigBackupRunResult { record })
}

#[tauri::command]
pub fn config_backup_list(
    host_alias: Option<String>,
) -> Result<Vec<storage::ConfigBackupRecord>, String> {
    let conn = storage::open().map_err(|e| e.to_string())?;
    storage::list_config_backups(&conn, host_alias.as_deref()).map_err(|e| e.to_string())
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

// ─── app lifecycle ────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct AutostartStatus {
    pub enabled: bool,
}

#[tauri::command]
pub fn autostart_status() -> Result<AutostartStatus, String> {
    let status = app_lifecycle::autostart_status()?;
    Ok(AutostartStatus {
        enabled: status.enabled,
    })
}

#[tauri::command]
pub fn autostart_set_enabled(enabled: bool) -> Result<AutostartStatus, String> {
    let status = app_lifecycle::set_autostart_enabled(enabled)?;
    Ok(AutostartStatus {
        enabled: status.enabled,
    })
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
    validate_app_state_value(&key, &value)?;
    let conn = storage::open().map_err(|e| e.to_string())?;
    storage::put_app_state(&conn, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_state_delete(key: String) -> Result<(), String> {
    let conn = storage::open().map_err(|e| e.to_string())?;
    storage::delete_app_state(&conn, &key).map_err(|e| e.to_string())
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

pub fn validate_app_state_value(key: &str, value: &str) -> Result<(), String> {
    if is_sensitive_app_state_field(key) {
        return Err("app_state_sensitive_value_rejected".into());
    }
    if let Ok(json) = serde_json::from_str::<Value>(value) {
        if json_contains_sensitive_app_state_field(&json) {
            return Err("app_state_sensitive_value_rejected".into());
        }
        return Ok(());
    }
    if raw_value_contains_sensitive_app_state_field(value) {
        return Err("app_state_sensitive_value_rejected".into());
    }
    Ok(())
}

fn json_contains_sensitive_app_state_field(value: &Value) -> bool {
    match value {
        Value::Array(items) => items.iter().any(json_contains_sensitive_app_state_field),
        Value::Object(map) => map.iter().any(|(key, nested)| {
            is_sensitive_app_state_field(key) || json_contains_sensitive_app_state_field(nested)
        }),
        _ => false,
    }
}

fn is_sensitive_app_state_field(key: &str) -> bool {
    let normalized = key
        .chars()
        .filter(|ch| *ch != '_' && *ch != '-' && !ch.is_whitespace())
        .flat_map(|ch| ch.to_lowercase())
        .collect::<String>();
    if normalized == "haspassword" {
        return false;
    }
    matches!(
        normalized.as_str(),
        "password" | "passphrase" | "privatekey" | "ephemeralpassword" | "secret"
    )
}

fn raw_value_contains_sensitive_app_state_field(value: &str) -> bool {
    let raw = value.to_ascii_lowercase();
    [
        "\"password\"",
        "'password'",
        "\"passphrase\"",
        "'passphrase'",
        "\"privatekey\"",
        "'privatekey'",
        "\"private_key\"",
        "'private_key'",
        "\"ephemeralpassword\"",
        "'ephemeralpassword'",
        "\"ephemeral_password\"",
        "'ephemeral_password'",
        "\"secret\"",
        "'secret'",
    ]
    .iter()
    .any(|needle| raw.contains(needle))
}

pub fn readonly_command(
    check_id: ReadonlyCheckId,
    profile: ConfigBackupProfile,
) -> Result<&'static str, String> {
    match check_id {
        ReadonlyCheckId::Reachability => Err("readonly_reachability_has_no_remote_command".into()),
        ReadonlyCheckId::Identity => match profile {
            ConfigBackupProfile::Cisco | ConfigBackupProfile::H3c => Ok("show version"),
            ConfigBackupProfile::Huawei => Ok("display version"),
            ConfigBackupProfile::Openwrt | ConfigBackupProfile::Linux => Ok("uname -a"),
        },
        ReadonlyCheckId::Health => match profile {
            ConfigBackupProfile::Openwrt | ConfigBackupProfile::Linux => Ok("uptime && df -h"),
            ConfigBackupProfile::Cisco | ConfigBackupProfile::H3c => Ok("show version"),
            ConfigBackupProfile::Huawei => Ok("display version"),
        },
    }
}

pub fn config_backup_command(profile: ConfigBackupProfile) -> Result<&'static str, String> {
    match profile {
        ConfigBackupProfile::Cisco | ConfigBackupProfile::H3c => Ok("show running-config"),
        ConfigBackupProfile::Huawei => Ok("display current-configuration"),
        ConfigBackupProfile::Openwrt => Ok("uci show || cat /etc/config/network"),
        ConfigBackupProfile::Linux => Ok("cat /etc/os-release && ip addr show"),
    }
}

fn infer_profile_from_hint(hint: Option<&str>) -> ConfigBackupProfile {
    let hint = hint.unwrap_or_default().to_ascii_lowercase();
    if hint.contains("huawei") {
        ConfigBackupProfile::Huawei
    } else if hint.contains("h3c") {
        ConfigBackupProfile::H3c
    } else if hint.contains("cisco") {
        ConfigBackupProfile::Cisco
    } else if hint.contains("openwrt") || hint.contains("istore") {
        ConfigBackupProfile::Openwrt
    } else {
        ConfigBackupProfile::Linux
    }
}

fn config_backup_profile_key(profile: ConfigBackupProfile) -> &'static str {
    match profile {
        ConfigBackupProfile::Cisco => "cisco",
        ConfigBackupProfile::Huawei => "huawei",
        ConfigBackupProfile::H3c => "h3c",
        ConfigBackupProfile::Openwrt => "openwrt",
        ConfigBackupProfile::Linux => "linux",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn readonly_whitelist_maps_known_checks_only() {
        assert_eq!(
            readonly_command(ReadonlyCheckId::Identity, ConfigBackupProfile::Cisco).unwrap(),
            "show version"
        );
        assert_eq!(
            readonly_command(ReadonlyCheckId::Identity, ConfigBackupProfile::Huawei).unwrap(),
            "display version"
        );
        assert_eq!(
            readonly_command(ReadonlyCheckId::Health, ConfigBackupProfile::Linux).unwrap(),
            "uptime && df -h"
        );
        assert!(
            readonly_command(ReadonlyCheckId::Reachability, ConfigBackupProfile::Linux).is_err()
        );
    }

    #[test]
    fn config_backup_profiles_map_to_fixed_commands() {
        assert_eq!(
            config_backup_command(ConfigBackupProfile::Cisco).unwrap(),
            "show running-config"
        );
        assert_eq!(
            config_backup_command(ConfigBackupProfile::Huawei).unwrap(),
            "display current-configuration"
        );
        assert_eq!(
            config_backup_command(ConfigBackupProfile::Openwrt).unwrap(),
            "uci show || cat /etc/config/network"
        );
    }
}
