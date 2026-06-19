mod commands;
mod credentials;
mod pty;
mod ssh;
mod ssh_config;
mod serial;
pub mod storage;

// 导出供集成测试使用的符号
pub use ssh::{list_keys, HostKeyChallengeRegistry, HostKeyDecision, SshSession,
    host_matches as ssh_host_matches,
    expand_tilde as ssh_expand_tilde,
    load_known_hosts_from_reader as ssh_load_known_hosts_from_reader,
};
pub use ssh_config::{parse as config_parse};
pub use commands::validate_app_state_value;

use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .compact()
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .manage(commands::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::config_parse,
            commands::ssh_open,
            commands::ssh_send,
            commands::ssh_resize,
            commands::ssh_close,
            commands::ssh_host_key_decide,
            commands::ssh_forget_trusted_host_key,
            commands::pty_open,
            commands::pty_send,
            commands::pty_resize,
            commands::pty_close,
            commands::serial_list_ports,
            commands::serial_open,
            commands::serial_send,
            commands::serial_resize,
            commands::serial_close,
            commands::shells_detect,
            commands::keys_list,
            commands::cred_store,
            commands::cred_load,
            commands::cred_delete,
            commands::i18n_detect_system,
            commands::host_ping,
            commands::app_state_get,
            commands::app_state_put,
            commands::app_state_delete,
            commands::connection_log_open,
            commands::connection_log_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
