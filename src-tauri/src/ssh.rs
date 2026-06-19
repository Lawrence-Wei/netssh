// Remote SSH sessions backed by `russh`.
//
// Handles: known_hosts verification, passphrase-protected keys,
// password auth fallback, and channel I/O.

use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::sync::{Arc, Mutex as StdMutex};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::Engine;
use russh::client::{Handle, Handler};
use russh::*;
use russh_keys::key::PublicKey;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio::sync::{oneshot, Mutex};
use tracing::{debug, error, info, warn};

use crate::commands::{emit_data, SshKey, SshOpenArgs};
use crate::storage;

pub type HostKeyChallengeRegistry =
    Arc<StdMutex<HashMap<String, oneshot::Sender<HostKeyDecision>>>>;

pub struct SshSession {
    id: String,
    handle: Arc<Mutex<Handle<ClientHandler>>>,
    commands: UnboundedSender<SshCommand>,
}

struct ClientHandler {
    app: AppHandle,
    session_id: String,
    alias: String,
    host: String,
    port: u16,
    accepted_keys: HashSet<String>,
    challenge_registry: HostKeyChallengeRegistry,
    last_host_key_error: Arc<StdMutex<Option<String>>>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HostKeyChallenge {
    pub challenge_id: String,
    pub session_id: String,
    pub alias: String,
    pub host: String,
    pub port: u16,
    pub key_type: String,
    pub fingerprint: String,
    pub status: String,
    pub known_fingerprints: Vec<String>,
    pub can_remember: bool,
}

#[derive(Debug, Clone, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HostKeyDecision {
    AcceptOnce,
    AcceptAndRemember,
    Reject,
}

#[derive(Debug, PartialEq, Eq)]
enum HostKeyDecisionPolicy {
    AcceptOnce,
    AcceptAndRemember,
    Reject(&'static str),
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
        let key_type = key_type_name(server_public_key);
        info!(
            host = %self.host,
            port = self.port,
            key_type = %key_type,
            fingerprint = %fingerprint,
            known_count = self.accepted_keys.len(),
            "Server host key received"
        );
        if self.accepted_keys.contains(&fingerprint) {
            info!(fingerprint = %fingerprint, "Host key already trusted");
            return Ok(true);
        }

        let known_fingerprints: Vec<String> = self.accepted_keys.iter().cloned().collect();
        let status = if self.accepted_keys.is_empty() {
            "unknown"
        } else {
            "mismatch"
        };
        info!(
            status = %status,
            "Emitting host key challenge to frontend"
        );
        let can_remember = status == "unknown";
        let challenge_id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel::<HostKeyDecision>();

        self.challenge_registry
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(challenge_id.clone(), tx);

        let _ = self.app.emit(
            "ssh:host-key-challenge",
            HostKeyChallenge {
                challenge_id: challenge_id.clone(),
                session_id: self.session_id.clone(),
                alias: self.alias.clone(),
                host: self.host.clone(),
                port: self.port,
                key_type: key_type.clone(),
                fingerprint: fingerprint.clone(),
                status: status.into(),
                known_fingerprints,
                can_remember,
            },
        );

        let decision = tokio::time::timeout(std::time::Duration::from_secs(60), rx).await;
        self.challenge_registry
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&challenge_id);

        match decision {
            Ok(Ok(decision)) => match host_key_decision_policy(status, decision) {
                HostKeyDecisionPolicy::AcceptOnce => {
                    info!("Host key accepted (once)");
                    Ok(true)
                }
                HostKeyDecisionPolicy::AcceptAndRemember => {
                    info!("Host key accepted and will be remembered");
                    match storage::open().and_then(|conn| {
                        storage::remember_trusted_host_key(
                            &conn,
                            &self.host,
                            self.port,
                            &key_type,
                            &fingerprint,
                        )
                    }) {
                        Ok(()) => {
                            info!("Host key stored in trusted_host_keys");
                            Ok(true)
                        }
                        Err(e) => {
                            error!(error = %e, "Failed to store host key");
                            set_host_key_error(&self.last_host_key_error, "host_key_store_failed");
                            Ok(false)
                        }
                    }
                }
                HostKeyDecisionPolicy::Reject(error_code) => {
                    set_host_key_error(&self.last_host_key_error, error_code);
                    Ok(false)
                }
            },
            Ok(Err(_)) | Err(_) => {
                set_host_key_error(&self.last_host_key_error, "host_key_timeout");
                Ok(false)
            }
        }
    }
}

impl SshSession {
    pub async fn connect(
        app: &AppHandle,
        id: &str,
        args: SshOpenArgs,
        challenge_registry: HostKeyChallengeRegistry,
    ) -> Result<Self> {
        let mut config = client::Config::default();
        // Add legacy ssh-rsa host key algorithm for router/embedded device compatibility.
        {
            let mut keys: Vec<russh_keys::key::Name> = config.preferred.key.to_vec();
            if !keys.iter().any(|k| k.0 == russh_keys::key::SSH_RSA.0) {
                keys.insert(0, russh_keys::key::SSH_RSA);
                config.preferred.key = std::borrow::Cow::Owned(keys);
            }
        }
        let config = Arc::new(config);
        let addr = format!("{}:{}", args.host, args.port);
        let password = args.password.clone().filter(|p| !p.trim().is_empty());
        let identity_file = args
            .identity_file
            .as_ref()
            .and_then(|v| {
                let v = v.trim();
                if v.is_empty() {
                    None
                } else {
                    Some(v.to_string())
                }
            });

        info!(
            host = %args.host,
            port = args.port,
            user = %args.user,
            has_password = password.is_some(),
            has_identity = identity_file.is_some(),
            "SSH connect starting"
        );

        // Load known_hosts for this session.
        let mut accepted_keys = load_known_hosts(&args.host, args.port);
        if let Ok(conn) = storage::open() {
            if let Ok(trusted) = storage::list_trusted_host_fingerprints(&conn, &args.host, args.port)
            {
                if !trusted.is_empty() {
                    debug!(count = trusted.len(), "Loaded persisted trusted host keys");
                }
                accepted_keys.extend(trusted);
            }
        }
        debug!(
            known_count = accepted_keys.len(),
            "Accepted host key fingerprints loaded"
        );
        let last_host_key_error = Arc::new(StdMutex::new(None));

        let handler = ClientHandler {
            app: app.clone(),
            session_id: id.to_string(),
            alias: args.alias.clone(),
            host: args.host.clone(),
            port: args.port,
            accepted_keys,
            challenge_registry,
            last_host_key_error: last_host_key_error.clone(),
        };
        info!("Starting SSH handshake and key exchange");
        let mut handle = match client::connect(config, addr.clone(), handler).await {
            Ok(h) => {
                info!("SSH handshake + key exchange completed");
                h
            }
            Err(e) => {
                if let Some(host_key_error) = last_host_key_error
                    .lock()
                    .unwrap_or_else(|err| err.into_inner())
                    .clone()
                {
                    error!(error = %host_key_error, "SSH handshake failed due to host key");
                    return Err(anyhow!("{host_key_error}"));
                }
                error!(error = %e, "SSH handshake / key exchange error");
                return Err(anyhow!("network_unreachable: {}", e));
            }
        };

        // Authenticate: try publickey first, then password.
        let authed = if let Some(ref identity_file) = identity_file {
            match try_publickey_auth(&mut handle, &args.user, identity_file, &args.passphrase).await {
                Ok(true) => {
                    info!(user = %args.user, key = %identity_file, "Public-key auth succeeded");
                    true
                }
                Ok(false) => false,
                Err(err) if password.is_some() => {
                    warn!(
                        user = %args.user,
                        key = %identity_file,
                        error = %err,
                        "Public-key auth failed, falling back to password"
                    );
                    false
                }
                Err(err) => {
                    error!(user = %args.user, key = %identity_file, error = %err, "Public-key auth fatal");
                    return Err(err);
                }
            }
        } else {
            false
        };

        if !authed {
            if let Some(ref password) = password {
                // Validate the username locally; servers usually answer "auth failed"
                // identically whether the user exists or not, so we catch the obvious
                // cases (empty / whitespace / disallowed chars) up front.
                if args.user.trim().is_empty()
                    || args
                        .user
                        .chars()
                        .any(|c| c.is_whitespace() || c == ':')
                {
                    warn!(user = %args.user, "Username validation failed locally");
                    return Err(anyhow!(
                        "username_invalid: \"{}\" is not a valid SSH username",
                        args.user
                    ));
                }
                info!(user = %args.user, host = %args.host, "Attempting password auth");
                let ok = handle
                    .authenticate_password(&args.user, password)
                    .await
                    .map_err(|e| {
                        error!(error = %e, "Password auth protocol error");
                        anyhow!("auth_error: {}", e)
                    })?;
                if !ok {
                    warn!(user = %args.user, host = %args.host, "Password rejected by server");
                    return Err(anyhow!(
                        "password_incorrect: password rejected for {}@{}",
                        args.user,
                        args.host
                    ));
                }
                info!(user = %args.user, "Password auth succeeded");
            } else {
                warn!(
                    alias = %args.alias,
                    host = %args.host,
                    "No credentials available — connection aborted"
                );
                return Err(anyhow!(
                    "no_credentials: no IdentityFile or password provided for {}@{}",
                    args.alias,
                    args.host
                ));
            }
        }

        // Open a session channel and request a PTY.
        info!("Opening SSH session channel");
        let channel = handle.channel_open_session().await.map_err(|e| {
            error!(error = %e, "Failed to open session channel");
            anyhow!("channel_open_failed: {}", e)
        })?;
        debug!("Requesting PTY (xterm-256color, 80x24)");
        channel
            .request_pty(true, "xterm-256color", 80, 24, 0, 0, &[])
            .await
            .map_err(|e| {
                error!(error = %e, "PTY request failed");
                anyhow!("pty_request_failed: {}", e)
            })?;
        debug!("Requesting shell");
        channel.request_shell(true).await.map_err(|e| {
            error!(error = %e, "Shell request failed");
            anyhow!("shell_request_failed: {}", e)
        })?;
        info!("SSH session fully established");

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

fn load_known_hosts(hostname: &str, port: u16) -> HashSet<String> {
    let mut set = HashSet::new();
    let Some(path) = known_hosts_path() else { return set };
    let Ok(file) = std::fs::File::open(&path) else { return set };
    load_known_hosts_from_reader(BufReader::new(file), hostname, port, &mut set);
    set
}

pub fn load_known_hosts_from_reader<R: BufRead>(
    reader: R,
    hostname: &str,
    port: u16,
    out: &mut HashSet<String>,
) {
    for line in reader.lines().map_while(|line| line.ok()) {
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
        if !host_matches(hosts, hostname, port) {
            continue;
        }
        // Decode the base64 key and compute its fingerprint.
        let key_b64 = parts[2];
        let Ok(bytes) = russh_keys::parse_public_key_base64(key_b64) else {
            continue;
        };
        // Store fingerprint for fast comparison.
        out.insert(bytes.fingerprint());
    }
}

pub fn host_matches(patterns: &str, hostname: &str, port: u16) -> bool {
    patterns
        .split(',')
        .any(|pattern| single_host_matches(pattern.trim(), hostname, port))
}

fn single_host_matches(pattern: &str, hostname: &str, port: u16) -> bool {
    if pattern == hostname {
        return true;
    }
    if pattern == "*" {
        return true;
    }
    if let Some((pattern_host, pattern_port)) = parse_bracketed_host_port(pattern) {
        return pattern_host == hostname && pattern_port == port;
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
        let hashed_target = if port == 22 {
            hostname.to_string()
        } else {
            format!("[{}]:{}", hostname, port)
        };
        mac.update(hashed_target.as_bytes());
        let result = mac.finalize();
        return result.into_bytes().as_slice() == expected.as_slice();
    }
    false
}

fn parse_bracketed_host_port(pattern: &str) -> Option<(&str, u16)> {
    let rest = pattern.strip_prefix('[')?;
    let (host, port_raw) = rest.split_once("]:")?;
    let port = port_raw.parse::<u16>().ok()?;
    Some((host, port))
}

fn set_host_key_error(slot: &Arc<StdMutex<Option<String>>>, value: &str) {
    *slot.lock().unwrap_or_else(|e| e.into_inner()) = Some(value.to_string());
}

fn host_key_decision_policy(status: &str, decision: HostKeyDecision) -> HostKeyDecisionPolicy {
    match (status, decision) {
        ("unknown", HostKeyDecision::AcceptOnce) => HostKeyDecisionPolicy::AcceptOnce,
        ("unknown", HostKeyDecision::AcceptAndRemember) => {
            HostKeyDecisionPolicy::AcceptAndRemember
        }
        (_, HostKeyDecision::Reject) => HostKeyDecisionPolicy::Reject("host_key_rejected"),
        ("mismatch", HostKeyDecision::AcceptOnce | HostKeyDecision::AcceptAndRemember) => {
            HostKeyDecisionPolicy::Reject("host_key_mismatch")
        }
        _ => HostKeyDecisionPolicy::Reject("host_key_rejected"),
    }
}

// ─── key_type_name helper ────────────────────────────────────────────────

fn key_type_name(key: &PublicKey) -> String {
    // Use the proper PublicKey::name() API instead of Debug format
    key.name().to_string()
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

pub fn expand_tilde(s: &str) -> String {
    if let Some(rest) = s.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().into_owned();
        }
    }
    s.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_matches_plain_host_matches_all_ports() {
        assert!(host_matches("example.com", "example.com", 22));
        assert!(host_matches("example.com", "example.com", 2222));
    }

    #[test]
    fn host_matches_bracketed_nonstandard_port() {
        assert!(host_matches("[example.com]:2222", "example.com", 2222));
        assert!(!host_matches("[example.com]:2222", "example.com", 22));
    }

    #[test]
    fn host_matches_comma_separated_entries() {
        assert!(host_matches("example.com,192.0.2.1", "192.0.2.1", 22));
    }

    #[test]
    fn unknown_host_key_can_be_accepted_and_saved() {
        assert_eq!(
            host_key_decision_policy("unknown", HostKeyDecision::AcceptAndRemember),
            HostKeyDecisionPolicy::AcceptAndRemember
        );
    }

    #[test]
    fn mismatched_host_key_accept_once_is_blocked() {
        assert_eq!(
            host_key_decision_policy("mismatch", HostKeyDecision::AcceptOnce),
            HostKeyDecisionPolicy::Reject("host_key_mismatch")
        );
    }

    #[test]
    fn mismatched_host_key_accept_and_remember_is_blocked() {
        assert_eq!(
            host_key_decision_policy("mismatch", HostKeyDecision::AcceptAndRemember),
            HostKeyDecisionPolicy::Reject("host_key_mismatch")
        );
    }
}
