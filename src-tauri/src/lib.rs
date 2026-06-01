mod commands;
mod credentials;
mod pty;
mod ssh;
mod ssh_config;
mod storage;

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
            commands::pty_open,
            commands::pty_send,
            commands::pty_resize,
            commands::pty_close,
            commands::shells_detect,
            commands::keys_list,
            commands::cred_store,
            commands::cred_load,
            commands::cred_delete,
            commands::i18n_detect_system,
            commands::host_ping,
            commands::app_state_get,
            commands::app_state_put,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
