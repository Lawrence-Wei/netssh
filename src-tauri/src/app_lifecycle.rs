use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, Window, WindowEvent};

const AUTOSTART_RUN_NAME: &str = "Netssh";
const AUTOSTART_ARG: &str = "--minimized-to-tray";
const MENU_SHOW: &str = "tray-show";
const MENU_QUIT: &str = "tray-quit";

pub fn setup(app: &mut App) -> tauri::Result<()> {
    setup_tray(app)?;

    if launched_minimized_to_tray() {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_skip_taskbar(true);
            let _ = window.hide();
        }
    }

    Ok(())
}

pub fn handle_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }

    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        hide_window(window);
    }
}

#[derive(Debug, Clone, Copy)]
pub struct AutostartStatus {
    pub enabled: bool,
}

pub fn autostart_status() -> Result<AutostartStatus, String> {
    autostart_enabled().map(|enabled| AutostartStatus { enabled })
}

pub fn set_autostart_enabled(enabled: bool) -> Result<AutostartStatus, String> {
    set_autostart(enabled)?;
    autostart_status()
}

fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id(MENU_SHOW, "显示 Netssh").build(app)?;
    let quit = MenuItemBuilder::with_id(MENU_QUIT, "退出").build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&quit)
        .build()?;

    let mut tray = TrayIconBuilder::with_id("netssh-tray")
        .menu(&menu)
        .tooltip("Netssh")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_SHOW => show_main_window(app),
            MENU_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            let should_show = matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            );
            if should_show {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;
    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(false);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_window(window: &Window) {
    let _ = window.set_skip_taskbar(true);
    let _ = window.hide();
}

fn launched_minimized_to_tray() -> bool {
    std::env::args().any(|arg| arg == AUTOSTART_ARG)
}

#[cfg(windows)]
fn set_autostart(enabled: bool) -> Result<(), String> {
    windows_autostart::set_enabled(enabled)
}

#[cfg(not(windows))]
fn set_autostart(_enabled: bool) -> Result<(), String> {
    Err("autostart_unsupported".into())
}

#[cfg(windows)]
fn autostart_enabled() -> Result<bool, String> {
    windows_autostart::is_enabled()
}

#[cfg(not(windows))]
fn autostart_enabled() -> Result<bool, String> {
    Ok(false)
}

#[cfg(windows)]
mod windows_autostart {
    use std::ffi::c_void;
    use std::path::Path;

    use super::{AUTOSTART_ARG, AUTOSTART_RUN_NAME};
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegGetValueW, RegOpenKeyExW, RegSetValueExW,
        HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ,
        RRF_RT_REG_SZ,
    };

    const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";

    pub fn set_enabled(enabled: bool) -> Result<(), String> {
        if enabled {
            write_run_value(&current_autostart_command()?)
        } else {
            delete_run_value()
        }
    }

    pub fn is_enabled() -> Result<bool, String> {
        let Some(value) = read_run_value()? else {
            return Ok(false);
        };
        Ok(value == current_autostart_command()?)
    }

    fn current_autostart_command() -> Result<String, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        command_for_exe_path(&exe)
    }

    fn command_for_exe_path(path: &Path) -> Result<String, String> {
        let exe = path.to_string_lossy();
        if exe.contains('"') {
            return Err("autostart_exe_path_contains_quote".into());
        }
        Ok(format!("\"{}\" {}", exe, AUTOSTART_ARG))
    }

    fn write_run_value(command: &str) -> Result<(), String> {
        let key = create_run_key(KEY_SET_VALUE)?;
        let name = wide(AUTOSTART_RUN_NAME);
        let data = utf16le_bytes(command);
        let status =
            unsafe { RegSetValueExW(key.0, PCWSTR(name.as_ptr()), 0, REG_SZ, Some(&data)) };
        win32_ok(status, "RegSetValueExW")
    }

    fn delete_run_value() -> Result<(), String> {
        let Ok(key) = open_run_key(KEY_SET_VALUE) else {
            return Ok(());
        };
        let name = wide(AUTOSTART_RUN_NAME);
        let status = unsafe { RegDeleteValueW(key.0, PCWSTR(name.as_ptr())) };
        if status == ERROR_SUCCESS || status == ERROR_FILE_NOT_FOUND {
            Ok(())
        } else {
            Err(format!("RegDeleteValueW failed: {}", status.0))
        }
    }

    fn read_run_value() -> Result<Option<String>, String> {
        let _key = match open_run_key(KEY_QUERY_VALUE) {
            Ok(key) => key,
            Err(_) => return Ok(None),
        };

        let subkey = wide(RUN_KEY);
        let name = wide(AUTOSTART_RUN_NAME);
        let mut byte_len = 0u32;
        let status = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                PCWSTR(name.as_ptr()),
                RRF_RT_REG_SZ,
                None,
                None,
                Some(&mut byte_len),
            )
        };

        if status == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        win32_ok(status, "RegGetValueW size")?;
        if byte_len == 0 {
            return Ok(Some(String::new()));
        }

        let mut buffer = vec![0u16; ((byte_len as usize) + 1) / 2];
        let status = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                PCWSTR(name.as_ptr()),
                RRF_RT_REG_SZ,
                None,
                Some(buffer.as_mut_ptr() as *mut c_void),
                Some(&mut byte_len),
            )
        };
        win32_ok(status, "RegGetValueW data")?;

        let nul = buffer
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(buffer.len());
        Ok(Some(String::from_utf16_lossy(&buffer[..nul])))
    }

    fn create_run_key(
        access: windows::Win32::System::Registry::REG_SAM_FLAGS,
    ) -> Result<RegKey, String> {
        let subkey = wide(RUN_KEY);
        let mut key = HKEY::default();
        let status = unsafe {
            RegCreateKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                0,
                PCWSTR::null(),
                REG_OPTION_NON_VOLATILE,
                access,
                None,
                &mut key,
                None,
            )
        };
        win32_ok(status, "RegCreateKeyExW")?;
        Ok(RegKey(key))
    }

    fn open_run_key(
        access: windows::Win32::System::Registry::REG_SAM_FLAGS,
    ) -> Result<RegKey, String> {
        let subkey = wide(RUN_KEY);
        let mut key = HKEY::default();
        let status = unsafe {
            RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(subkey.as_ptr()),
                0,
                access,
                &mut key,
            )
        };
        win32_ok(status, "RegOpenKeyExW")?;
        Ok(RegKey(key))
    }

    fn win32_ok(status: windows::Win32::Foundation::WIN32_ERROR, op: &str) -> Result<(), String> {
        if status == ERROR_SUCCESS {
            Ok(())
        } else {
            Err(format!("{} failed: {}", op, status.0))
        }
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn utf16le_bytes(value: &str) -> Vec<u8> {
        let mut bytes = Vec::new();
        for unit in value.encode_utf16().chain(std::iter::once(0)) {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        bytes
    }

    struct RegKey(HKEY);

    impl Drop for RegKey {
        fn drop(&mut self) {
            unsafe {
                let _ = RegCloseKey(self.0);
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::command_for_exe_path;
        use std::path::Path;

        #[test]
        fn autostart_command_quotes_exe_path_and_adds_tray_arg() {
            let command = command_for_exe_path(Path::new("C:\\Program Files\\Netssh\\Netssh.exe"))
                .expect("command");
            assert_eq!(
                command,
                "\"C:\\Program Files\\Netssh\\Netssh.exe\" --minimized-to-tray"
            );
        }

        #[test]
        fn autostart_command_rejects_quote_in_path() {
            let err = command_for_exe_path(Path::new("C:\\bad\"path\\Netssh.exe")).unwrap_err();
            assert_eq!(err, "autostart_exe_path_contains_quote");
        }
    }
}
