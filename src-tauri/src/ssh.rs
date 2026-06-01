// Remote SSH sessions backed by `russh`.
//
// Handles: known_hosts verification, passphrase-protected keys,
// password auth fallback, and channel I/O.

use std::collections::HashSet;
use std::io::BufRead;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::Engine;
use russh::client::{Handle, Handler};
use russh::*;
use russh_keys::key::PublicKey;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio::sync::Mutex;

use crate::commands::{emit_data, SshKey, SshOpenArgs};

pub struct SshSession {
    id: String,
    handle: Arc<Mutex<Handle<ClientHandler>>>,
    commands: UnboundedSender<SshCommand>,
}

struct ClientHandler {
    app: AppHandle,
    session_id: String,
    host: String,
    port: u16,
    accepted_keys: HashSet<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HostKeyEvent {
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub key_type: String,
    pub fingerprint: String,
    pub status: String, // "unknown" | "mismatch"
}

enum SshCommand {
    Data(Vec<u8>),
    Resize(u16, u16),
    Close,
}

#[async_trait]
impl Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> std::result::Result<bool, Self::Error> {
        let fingerprint = server_public_key.fingerprint();
        if self.accepted_keys.contains(&fingerprint) {
            return Ok(true);
        }

        let key_type = key_type_name(server_public_key);

        // Check if there's a different key for this host already.
        if self.accepted_keys.is_empty() {
            // No known_hosts entry → TOFU: accept and notify frontend.
            let _ = self.app.emit(
                "ssh:host-key-unknown",
                HostKeyEvent {
                    session_id: self.session_id.clone(),
                    host: self.host.clone(),
                    port: self.port,
                    key_type,
                    fingerprint: fingerprint.clone(),
                    status: "unknown".into(),
                },
            );
            Ok(true)
        } else {
            // Host known but key doesn't match → REJECT.
            let _ = self.app.emit(
                "ssh:host-key-mismatch",
                HostKeyEvent {
                    session_id: self.session_id.clone(),
                    host: self.host.clone(),
                    port: self.port,
                    key_type,
                    fingerprint,
                    status: "mismatch".into(),
                },
            );
            Ok(false)
        }
    }
}

impl SshSession {
    pub async fn connect(app: &AppHandle, id: &str, args: SshOpenArgs) -> Result<Self> {
        let config = Arc::new(client::Config::default());
        let addr = format!("{}:{}", args.host, args.port);

        // TCP probe first so we can return a clean "network_unreachable" code.
        let probe = tokio::time::timeout(
            std::time::Duration::from_secs(4),
            tokio::net::TcpStream::connect(&addr),
        )
        .await;
        match probe {
            Err(_) => return Err(anyhow!("network_unreachable: timeout connecting to {}", addr)),
            Ok(Err(e)) => return Err(anyhow!("network_unreachable: {}", e)),
            Ok(Ok(_)) => {}
        }

        // Load known_hosts for this session.
        let accepted_keys = load_known_hosts(&args.host, args.port);

        let handler = ClientHandler {
            app: app.clone(),
            session_id: id.to_string(),
            host: args.host.clone(),
            port: args.port,
            accepted_keys,
        };
        let mut handle = match client::connect(config, addr.clone(), handler).await {
            Ok(h) => h,
            Err(e) => return Err(anyhow!("network_unreachable: {}", e)),
        };

        // Authenticate: try publickey first, then password.
        let authed = if let Some(ref identity_file) = args.identity_file {
            try_publickey_auth(&mut handle, &args.user, identity_file, &args.passphrase).await?
        } else {
            false
        };

        if !authed {
            if let Some(ref password) = args.password {
                // Validate the username locally; servers usually answer "auth failed"
                // identically whether the user exists or not, so we catch the obvious
                // cases (empty / whitespace / disallowed chars) up front.
                if args.user.trim().is_empty()
                    || args
                        .user
                        .chars()
                        .any(|c| c.is_whitespace() || c == ':' || c == '@')
                {
                    return Err(anyhow!(
                        "username_invalid: \"{}\" is not a valid SSH username",
                        args.user
                    ));
                }
                let ok = handle
                    .authenticate_password(&args.user, password)
                    .await
                    .map_err(|e| anyhow!("auth_error: {}", e))?;
                if !ok {
                    return Err(anyhow!(
                        "password_incorrect: password rejected for {}@{}",
                        args.user,
                        args.host
                    ));
                }
            } else {
                return Err(anyhow!(
                    "no_credentials: no IdentityFile or password provided for {}@{}",
                    args.alias,
                    args.host
                ));
            }
        }

        // Open a session channel and request a PTY.
        let channel = handle.channel_open_session().await?;
        channel
            .request_pty(true, "xterm-256color", 80, 24, 0, 0, &[])
            .await?;
        channel.request_shell(true).await?;

        let (tx, mut rx) = unbounded_channel::<SshCommand>();

        let app_clone = app.clone();
        let id_clone = id.to_string();
        let mut channel_stream = channel;
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(command) = rx.recv() => {
                        match command {
                            SshCommand::Data(data) => {
                                let _ = channel_stream.data(&data[..]).await;
                            }
                            SshCommand::Resize(cols, rows) => {
                                let _ = channel_stream
                                    .window_change(cols as u32, rows as u32, 0, 0)
                                    .await;
                            }
                            SshCommand::Close => {
                                let _ = channel_stream.close().await;
                                break;
                            }
                        }
                    }
                    msg = channel_stream.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { ref data }) => {
                                emit_data(&app_clone, "ssh", &id_clone, data);
                            }
                            Some(ChannelMsg::ExtendedData { ref data, ext: _ }) => {
                                emit_data(&app_clone, "ssh", &id_clone, data);
                            }
                            Some(ChannelMsg::ExitStatus { .. })
                            | Some(ChannelMsg::ExitSignal { .. })
                            | Some(ChannelMsg::Close)
                            | None => {
                                let _ = app_clone.emit(&format!("ssh:{}:exit", id_clone), ());
                                break;
                            }
                            _ => {}
                        }
                    }
                }
            }
        });

        Ok(SshSession {
            id: id.to_string(),
            handle: Arc::new(Mutex::new(handle)),
            commands: tx,
        })
    }

    pub fn send(&self, data: &[u8]) -> Result<()> {
        self.commands
            .send(SshCommand::Data(data.to_vec()))
            .map_err(|_| anyhow!("ssh channel is closed"))
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        self.commands
            .send(SshCommand::Resize(cols, rows))
            .map_err(|_| anyhow!("ssh channel is closed"))
    }

    pub async fn close(self) -> Result<()> {
        let _ = self.commands.send(SshCommand::Close);
        let handle = self.handle.clone();
        tokio::spawn(async move {
            let guard = handle.lock().await;
            let _ = guard
                .disconnect(Disconnect::ByApplication, "session closed", "en")
                .await;
        });
        Ok(())
    }
}

// ─── Public-key auth with optional passphrase ─────────────────────────────

async fn try_publickey_auth(
    handle: &mut Handle<ClientHandler>,
    user: &str,
    identity_file: &str,
    passphrase: &Option<String>,
) -> Result<bool> {
    let path = expand_tilde(identity_file);
    let key = match russh_keys::load_secret_key(&path, passphrase.as_deref()) {
        Ok(k) => k,
        Err(e) => {
            if passphrase.is_none() {
                return Err(anyhow!("key_passphrase_needed: {}", e));
            }
            return Err(anyhow!("failed to load key {}: {}", path, e));
        }
    };
    let ok = handle.authenticate_publickey(user, Arc::new(key)).await?;
    Ok(ok)
}

// ─── known_hosts ─────────────────────────────────────────────────────────

fn known_hosts_path() -> Option<std::path::PathBuf> {
    dirs::home_dir().map(|d| d.join(".ssh").join("known_hosts"))
}

fn load_known_hosts(hostname: &str, _port: u16) -> HashSet<String> {
    let mut set = HashSet::new();
    let Some(path) = known_hosts_path() else { return set };
    let Ok(file) = std::fs::File::open(&path) else { return set };
    for line in std::io::BufReader::new(file).lines().flatten() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('@') {
            continue;
        }
        let parts: Vec<&str> = trimmed.splitn(3, ' ').collect();
        if parts.len() < 3 {
            continue;
        }
        // Check if this line matches our hostname.
        let hosts = parts[0];
        if !host_matches(hosts, hostname) {
            continue;
        }
        // Decode the base64 key and compute its fingerprint.
        let key_b64 = parts[2];
        let Ok(bytes) = russh_keys::parse_public_key_base64(key_b64) else {
            continue;
        };
        // Store fingerprint for fast comparison.
        set.insert(bytes.fingerprint());
    }
    set
}

fn host_matches(pattern: &str, hostname: &str) -> bool {
    if pattern == hostname {
        return true;
    }
    // Handle hashed hosts (starts with '|1|' = HMAC-SHA1).
    if let Some(rest) = pattern.strip_prefix("|1|") {
        let parts: Vec<&str> = rest.split('|').collect();
        if parts.len() != 2 {
            return false;
        }
        let Ok(salt) = base64::engine::general_purpose::STANDARD.decode(parts[0]) else {
            return false;
        };
        let Ok(expected) = base64::engine::general_purpose::STANDARD.decode(parts[1]) else {
            return false;
        };
        use hmac::{Hmac, Mac};
        use sha1::Sha1;
        let mut mac = Hmac::<Sha1>::new_from_slice(&salt)
            .expect("HMAC can take key of any size");
        mac.update(hostname.as_bytes());
        let result = mac.finalize();
        return result.into_bytes().as_slice() == expected.as_slice();
    }
    false
}

// ─── key_type_name helper ────────────────────────────────────────────────

fn key_type_name(key: &PublicKey) -> String {
    // russh_keys PublicKey has a Display impl that usually gives the key type
    let disp = format!("{key:?}");
    if disp.contains("Ed25519") {
        "ssh-ed25519".into()
    } else if disp.contains("Rsa") {
        "ssh-rsa".into()
    } else if disp.contains("Ecdsa") {
        "ecdsa-sha2-nistp256".into()
    } else {
        "ssh-unknown".into()
    }
}

// ─── key listing ─────────────────────────────────────────────────────────

pub fn list_keys() -> Result<Vec<SshKey>> {
    let ssh_dir = dirs::home_dir()
        .ok_or_else(|| anyhow!("no home dir"))?
        .join(".ssh");

    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(&ssh_dir) else {
        return Ok(out);
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        if !name.starts_with("id_") && !name.ends_with("_ed25519") && !name.ends_with("_rsa") {
            continue;
        }
        if name.ends_with(".pub") {
            continue;
        }

        let key_type = if name.contains("ed25519") {
            "ed25519"
        } else if name.contains("rsa") {
            "rsa"
        } else if name.contains("ecdsa") {
            "ecdsa"
        } else {
            "unknown"
        };

        let pub_path = path.with_file_name(format!("{name}.pub"));
        let fingerprint = russh_keys::load_public_key(&pub_path)
            .map(|key| key.fingerprint())
            .unwrap_or_else(|_| "unavailable".into());

        out.push(SshKey {
            id: name.clone(),
            name,
            key_type: key_type.into(),
            fingerprint,
            path: path.to_string_lossy().into(),
        });
    }

    Ok(out)
}

impl SshSession {
    #[allow(dead_code)]
    pub fn id(&self) -> &str {
        &self.id
    }
}

fn expand_tilde(s: &str) -> String {
    if let Some(rest) = s.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().into_owned();
        }
    }
    s.to_string()
}
