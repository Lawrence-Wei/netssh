// Local PTY sessions via `portable-pty` (ConPTY on Windows, pty on Linux/macOS).
//
// One PtySession = one running shell + its reader thread.

use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use anyhow::Result;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter};

use crate::commands::{emit_data, ShellInfo};

pub struct PtySession {
    id: String,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
}

impl PtySession {
    pub fn spawn(
        app: &AppHandle,
        id: &str,
        shell_id: &str,
        shell_path: Option<&str>,
        terminal_locale: Option<&str>,
        terminal_timezone: Option<&str>,
    ) -> Result<Self> {
        let shells = detect_local_shells();
        let shell_program = if let Some(path) = shell_path.filter(|path| !path.trim().is_empty()) {
            path
        } else {
            shells
                .iter()
                .find(|s| s.id == shell_id)
                .or_else(|| shells.iter().find(|s| s.is_default))
                .map(|shell| shell.path.as_str())
                .ok_or_else(|| anyhow::anyhow!("no shell available"))?
        };

        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(shell_program);
        if let Some(home) = dirs::home_dir() {
            cmd.cwd(home);
        }
        apply_terminal_env(&mut cmd, terminal_locale, terminal_timezone);
        let child = pair.slave.spawn_command(cmd)?;
        drop(pair.slave);

        // Reader thread → emit data events.
        let mut reader = pair.master.try_clone_reader()?;
        let app_clone = app.clone();
        let id_clone = id.to_string();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        let _ = app_clone.emit(&format!("pty:{}:exit", id_clone), ());
                        break;
                    }
                    Ok(n) => emit_data(&app_clone, "pty", &id_clone, &buf[..n]),
                    Err(_) => break,
                }
            }
        });

        let writer = pair.master.take_writer()?;
        Ok(PtySession {
            id: id.to_string(),
            writer: Arc::new(Mutex::new(writer)),
            master: Arc::new(Mutex::new(pair.master)),
            _child: child,
        })
    }

    pub fn send(&self, data: &[u8]) -> Result<()> {
        let mut w = self.writer.lock().unwrap();
        w.write_all(data)?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        let m = self.master.lock().unwrap();
        m.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }

    pub fn close(self) -> Result<()> {
        // Master/writer drop closes the PTY.
        Ok(())
    }

    #[allow(dead_code)]
    pub fn id(&self) -> &str {
        &self.id
    }
}

fn apply_terminal_env(
    cmd: &mut CommandBuilder,
    terminal_locale: Option<&str>,
    terminal_timezone: Option<&str>,
) {
    if let Some(locale) = clean_env_value(terminal_locale) {
        cmd.env("LANG", locale);
        cmd.env("LC_ALL", locale);
    }
    if let Some(timezone) = clean_env_value(terminal_timezone) {
        cmd.env("TZ", timezone);
    }
}

fn clean_env_value(value: Option<&str>) -> Option<&str> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty() && !value.contains('\0') && !value.contains('='))
}

pub fn detect_local_shells() -> Vec<ShellInfo> {
    let mut out = Vec::new();

    let candidates = if cfg!(windows) {
        vec![
            (
                "pwsh",
                "PowerShell 7",
                "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
            ),
            (
                "powershell",
                "Windows PowerShell",
                "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
            ),
            ("cmd", "Command Prompt", "C:\\Windows\\System32\\cmd.exe"),
            (
                "wsl",
                "WSL (default distro)",
                "C:\\Windows\\System32\\wsl.exe",
            ),
            (
                "gitbash",
                "Git Bash",
                "C:\\Program Files\\Git\\bin\\bash.exe",
            ),
        ]
    } else {
        vec![
            ("zsh", "Zsh", "/bin/zsh"),
            ("bash", "Bash", "/bin/bash"),
            ("sh", "Sh", "/bin/sh"),
            ("fish", "Fish", "/usr/bin/fish"),
        ]
    };

    for (id, name, path) in candidates {
        if std::path::Path::new(path).exists() {
            out.push(ShellInfo {
                id: id.into(),
                name: name.into(),
                path: path.into(),
                is_default: id == "pwsh",
            });
        }
    }

    // Ensure at least one is marked default.
    if !out.iter().any(|s| s.is_default) {
        if let Some(first) = out.first_mut() {
            first.is_default = true;
        }
    }

    out
}
