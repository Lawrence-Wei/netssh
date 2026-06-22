// Remote SSH sessions backed by `russh`.
//
// Handles: known_hosts verification, passphrase-protected keys,
// password auth fallback, and channel I/O.

use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::Engine;
use russh::client::{Handle, Handler, KeyboardInteractiveAuthResponse, Prompt};
use russh::*;
use russh_keys::key::PublicKey;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio::sync::{oneshot, Mutex};
use tracing::{debug, error, info, warn};

use crate::commands::{emit_data, SshExecHostArgs, SshJumpArgs, SshKey, SshOpenArgs};
use crate::storage;

pub type HostKeyChallengeRegistry =
    Arc<StdMutex<HashMap<String, oneshot::Sender<HostKeyDecision>>>>;

pub struct SshSession {
    id: String,
    handle: Arc<Mutex<Handle<ClientHandler>>>,
    jump_handle: Option<Arc<Mutex<Handle<ClientHandler>>>>,
    commands: UnboundedSender<SshCommand>,
    /// True when the frontend tab closed but the session should stay alive.
    pub detached: bool,
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
    path_role: String,
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
    pub path_role: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SshHostMetadata {
    pub session_id: String,
    pub alias: String,
    pub host: String,
    pub port: u16,
    pub remote_hostname: Option<String>,
    pub os_id: Option<String>,
    pub os_name: Option<String>,
    pub os_pretty_name: Option<String>,
    pub kernel: Option<String>,
    pub model: Option<String>,
    pub icon_override: Option<String>,
    pub icon_confidence: u8,
    pub role: Option<String>,
    pub tags: Vec<String>,
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

const HOST_METADATA_SCRIPT: &str = r#"printf '__NETSSH_BEGIN__\n'
if [ -r /etc/os-release ]; then
  cat /etc/os-release
elif [ -r /usr/lib/os-release ]; then
  cat /usr/lib/os-release
fi
if [ -r /etc/openwrt_release ]; then
  printf '__NETSSH_OPENWRT_RELEASE__=1\n'
  cat /etc/openwrt_release
fi
if [ -d /etc/pve ] || uname -r 2>/dev/null | grep -qi pve; then
  printf '__NETSSH_PVE__=1\n'
fi
if [ -r /proc/device-tree/model ]; then
  printf '__NETSSH_MODEL__='
  tr -d '\000' </proc/device-tree/model
  printf '\n'
fi
printf '__NETSSH_HOSTNAME__=%s\n' "$(hostname 2>/dev/null || uname -n 2>/dev/null || true)"
printf '__NETSSH_KERNEL__=%s\n' "$(uname -srm 2>/dev/null || true)"
printf '__NETSSH_END__\n'"#;

const NETWORK_METADATA_COMMANDS: &[&str] = &["display version", "show version"];
const SSH_TCP_CONNECT_TIMEOUT: Duration = Duration::from_secs(8);
const SSH_AUTH_ATTEMPT_TIMEOUT: Duration = Duration::from_secs(8);
const SSH_BANNER_PEEK_TIMEOUT: Duration = Duration::from_millis(500);
const NETWORK_DEVICE_HINTS: &[&str] = &["huawei", "cisco"];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SshAlgorithmProfile {
    ModernWithLegacyFallback,
    LegacyNetworkDevice,
}

fn ssh_client_config(profile: SshAlgorithmProfile) -> client::Config {
    let mut config = client::Config::default();
    match profile {
        SshAlgorithmProfile::ModernWithLegacyFallback => {
            append_legacy_algorithms(&mut config);
        }
        SshAlgorithmProfile::LegacyNetworkDevice => {
            config.preferred.kex = std::borrow::Cow::Owned(vec![
                russh::kex::DH_G14_SHA1,
                russh::kex::DH_G1_SHA1,
            ]);
            config.preferred.key = std::borrow::Cow::Owned(vec![russh_keys::key::SSH_RSA]);
            config.preferred.cipher = std::borrow::Cow::Owned(vec![
                russh::cipher::AES_128_CTR,
                russh::cipher::AES_192_CTR,
                russh::cipher::AES_256_CTR,
                russh::cipher::AES_128_CBC,
                russh::cipher::AES_192_CBC,
                russh::cipher::AES_256_CBC,
                russh::cipher::TRIPLE_DES_CBC,
            ]);
            config.preferred.mac = std::borrow::Cow::Owned(vec![russh::mac::HMAC_SHA1]);
            config.preferred.compression = std::borrow::Cow::Owned(vec![russh::compression::NONE]);
        }
    }
    config
}

fn append_legacy_algorithms(config: &mut client::Config) {
    let mut kex_list: Vec<russh::kex::Name> = config.preferred.kex.to_vec();
    for legacy in [russh::kex::DH_G14_SHA1, russh::kex::DH_G1_SHA1] {
        if !kex_list.iter().any(|k| k.as_ref() == legacy.as_ref()) {
            kex_list.push(legacy);
        }
    }
    config.preferred.kex = std::borrow::Cow::Owned(kex_list);

    let mut key_list: Vec<russh_keys::key::Name> = config.preferred.key.to_vec();
    let ssh_rsa = russh_keys::key::SSH_RSA;
    if !key_list.iter().any(|k| k.as_ref() == ssh_rsa.as_ref()) {
        key_list.push(ssh_rsa);
    }
    config.preferred.key = std::borrow::Cow::Owned(key_list);

    let mut cipher_list: Vec<russh::cipher::Name> = config.preferred.cipher.to_vec();
    for legacy in [
        russh::cipher::AES_128_CBC,
        russh::cipher::AES_192_CBC,
        russh::cipher::AES_256_CBC,
        russh::cipher::TRIPLE_DES_CBC,
    ] {
        if !cipher_list.iter().any(|c| c.as_ref() == legacy.as_ref()) {
            cipher_list.push(legacy);
        }
    }
    config.preferred.cipher = std::borrow::Cow::Owned(cipher_list);
}

fn no_common_algorithm_message(kind: &russh::AlgorithmKind, ours: &[String], theirs: &[String]) -> String {
    let ours = format_algorithm_list(ours);
    let theirs = format_algorithm_list(theirs);
    match kind {
        russh::AlgorithmKind::Kex => {
            format!("kex_no_common_algorithm: server offered [{theirs}]; client offered [{ours}]")
        }
        russh::AlgorithmKind::Key => {
            format!("host_key_algo_no_common: server offered [{theirs}]; client offered [{ours}]")
        }
        russh::AlgorithmKind::Cipher => {
            format!("cipher_no_common_algorithm: server offered [{theirs}]; client offered [{ours}]")
        }
        russh::AlgorithmKind::Mac => {
            format!("mac_no_common_algorithm: server offered [{theirs}]; client offered [{ours}]")
        }
        russh::AlgorithmKind::Compression => {
            format!("algo_no_common: no common compression algorithm; server offered [{theirs}]; client offered [{ours}]")
        }
    }
}

fn format_algorithm_list(items: &[String]) -> String {
    if items.is_empty() {
        "(none)".to_string()
    } else {
        items.join(", ")
    }
}

async fn open_ssh_tcp(addr: &str) -> Result<tokio::net::TcpStream> {
    match tokio::time::timeout(SSH_TCP_CONNECT_TIMEOUT, tokio::net::TcpStream::connect(addr)).await
    {
        Ok(Ok(socket)) => Ok(socket),
        Ok(Err(e)) => {
            error!(error = %e, "SSH TCP connection failed");
            Err(anyhow!("connect_failed: {}", e))
        }
        Err(_) => {
            error!(
                target = %addr,
                timeout_ms = SSH_TCP_CONNECT_TIMEOUT.as_millis() as u64,
                "SSH TCP connection timed out"
            );
            Err(anyhow!(
                "connect_timeout: no response from {} after {} seconds",
                addr,
                SSH_TCP_CONNECT_TIMEOUT.as_secs()
            ))
        }
    }
}

fn classify_ssh_handshake_error(
    error: russh::Error,
    last_host_key_error: &Arc<StdMutex<Option<String>>>,
) -> anyhow::Error {
    if let Some(host_key_error) = last_host_key_error
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .clone()
    {
        error!(error = %host_key_error, "SSH handshake failed due to host key");
        return anyhow!("{host_key_error}");
    }
    if let russh::Error::NoCommonAlgo { kind, ours, theirs } = &error {
        let message = no_common_algorithm_message(kind, ours, theirs);
        error!(error = %error, message = %message, "SSH algorithm negotiation failed");
        return anyhow!(message);
    }
    let err_str = error.to_string();
    let err_lower = err_str.to_lowercase();
    if err_lower.contains("no common") && (err_lower.contains("kex") || err_lower.contains("key exchange")) {
        error!(error = %error, "SSH KEX algorithm negotiation failed (no overlap with server)");
        return anyhow!("kex_no_common_algorithm: {err_str}");
    }
    if err_lower.contains("no common") && (err_lower.contains("host key") || err_lower.contains(" key")) {
        error!(error = %error, "SSH host key algorithm negotiation failed (no overlap with server)");
        return anyhow!("host_key_algo_no_common: {err_str}");
    }
    if err_lower.contains("no common") && err_lower.contains("mac") {
        error!(error = %error, "SSH MAC algorithm negotiation failed (no overlap with server)");
        return anyhow!("mac_no_common_algorithm: {err_str}");
    }
    if err_lower.contains("no common") && err_lower.contains("cipher") {
        error!(error = %error, "SSH cipher algorithm negotiation failed (no overlap with server)");
        return anyhow!("cipher_no_common_algorithm: {err_str}");
    }
    if err_lower.contains("no common") {
        error!(error = %error, "SSH algorithm negotiation failed");
        return anyhow!("algo_no_common: {err_str}");
    }
    error!(error = %error, "SSH handshake / key exchange error");
    anyhow!("network_unreachable: {err_str}")
}

fn should_retry_with_legacy_profile(error: &anyhow::Error) -> bool {
    let raw = error.to_string().to_lowercase();
    if raw.contains("host_key_") {
        return false;
    }
    raw.contains("no_common_algorithm")
        || raw.contains("algo_no_common")
        || raw.contains("no common")
        || raw.contains("key exchange")
        || raw.contains("kex")
        || raw.contains("strict kex")
        || raw.contains("network_unreachable")
}

fn normalized_identity_file(args: &SshOpenArgs) -> Option<String> {
    args.identity_file.as_ref().and_then(|v| {
        let v = v.trim();
        if v.is_empty() {
            None
        } else {
            Some(v.to_string())
        }
    })
}

fn normalized_password(args: &SshOpenArgs) -> Option<String> {
    args.password.clone().filter(|p| !p.trim().is_empty())
}

fn identity_file_log_label(identity_file: &str) -> String {
    let expanded = expand_tilde(identity_file);
    expanded
        .rsplit(['\\', '/'])
        .next()
        .filter(|name| !name.trim().is_empty())
        .map(|name| format!("configured:{name}"))
        .unwrap_or_else(|| "configured".into())
}

fn accepted_host_keys(args: &SshOpenArgs) -> HashSet<String> {
    let mut accepted_keys = if args.skip_open_ssh_known_hosts.unwrap_or(false) {
        info!("Skipping OpenSSH known_hosts for explicit host-key recovery retry");
        HashSet::new()
    } else {
        load_known_hosts(&args.host, args.port)
    };
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
        host = %args.host,
        port = args.port,
        "Accepted host key fingerprints loaded"
    );
    accepted_keys
}

async fn handshake_on_stream<S>(
    app: &AppHandle,
    id: &str,
    args: &SshOpenArgs,
    challenge_registry: HostKeyChallengeRegistry,
    accepted_keys: HashSet<String>,
    last_host_key_error: Arc<StdMutex<Option<String>>>,
    profile: SshAlgorithmProfile,
    stream: S,
    path_role: &str,
) -> Result<Handle<ClientHandler>>
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let handler = ClientHandler {
        app: app.clone(),
        session_id: id.to_string(),
        alias: args.alias.clone(),
        host: args.host.clone(),
        port: args.port,
        accepted_keys,
        challenge_registry,
        last_host_key_error: last_host_key_error.clone(),
        path_role: path_role.into(),
    };
    client::connect_stream(Arc::new(ssh_client_config(profile)), stream, handler)
        .await
        .map_err(|error| classify_ssh_handshake_error(error, &last_host_key_error))
}

async fn connect_authenticated_tcp(
    app: &AppHandle,
    id: &str,
    args: &SshOpenArgs,
    challenge_registry: HostKeyChallengeRegistry,
    path_role: &str,
) -> Result<(Handle<ClientHandler>, Option<String>)> {
    let addr = format!("{}:{}", args.host, args.port);
    let accepted_keys = accepted_host_keys(args);
    let profiles = [
        SshAlgorithmProfile::ModernWithLegacyFallback,
        SshAlgorithmProfile::LegacyNetworkDevice,
    ];
    let mut last_error: Option<anyhow::Error> = None;
    let mut banner_device_hint = None;

    for profile in profiles {
        let last_host_key_error = Arc::new(StdMutex::new(None));
        info!(profile = ?profile, path_role = path_role, "Opening TCP connection for SSH");
        let socket = open_ssh_tcp(&addr).await?;
        if banner_device_hint.is_none() {
            if let Some(banner) = peek_ssh_banner(&socket).await {
                banner_device_hint = infer_device_hint_from_ssh_banner(&banner);
                if let Some(hint) = banner_device_hint.as_deref() {
                    debug!(banner = %banner, hint = hint, "SSH server banner inferred device hint");
                }
            }
        }
        info!(profile = ?profile, path_role = path_role, "Starting SSH handshake and key exchange");
        match handshake_on_stream(
            app,
            id,
            args,
            challenge_registry.clone(),
            accepted_keys.clone(),
            last_host_key_error,
            profile,
            socket,
            path_role,
        )
        .await
        {
            Ok(handle) => return Ok((handle, banner_device_hint)),
            Err(error) => {
                if profile == SshAlgorithmProfile::ModernWithLegacyFallback
                    && should_retry_with_legacy_profile(&error)
                {
                    warn!(
                        error = %error,
                        "Retrying SSH handshake with legacy network-device algorithms"
                    );
                    last_error = Some(error);
                    continue;
                }
                return Err(error);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| anyhow!("network_unreachable: SSH handshake did not complete")))
}

async fn connect_authenticated_stream<S>(
    app: &AppHandle,
    id: &str,
    args: &SshOpenArgs,
    challenge_registry: HostKeyChallengeRegistry,
    stream: S,
    path_role: &str,
) -> Result<Handle<ClientHandler>>
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    handshake_on_stream(
        app,
        id,
        args,
        challenge_registry,
        accepted_host_keys(args),
        Arc::new(StdMutex::new(None)),
        SshAlgorithmProfile::ModernWithLegacyFallback,
        stream,
        path_role,
    )
    .await
}

async fn authenticate_handle(
    handle: &mut Handle<ClientHandler>,
    args: &SshOpenArgs,
    banner_device_hint: Option<&str>,
) -> Result<()> {
    let password = normalized_password(args);
    let identity_file = normalized_identity_file(args);

    let authed = if let Some(ref identity_file) = identity_file {
        let identity_label = identity_file_log_label(identity_file);
        match tokio::time::timeout(
            SSH_AUTH_ATTEMPT_TIMEOUT,
            try_publickey_auth(handle, &args.user, identity_file, &args.passphrase),
        )
        .await
        {
            Ok(Ok(true)) => {
                info!(user = %args.user, key = %identity_label, "Public-key auth succeeded");
                true
            }
            Ok(Ok(false)) => false,
            Ok(Err(err)) if password.is_some() => {
                warn!(
                    user = %args.user,
                    key = %identity_label,
                    error = %err,
                    "Public-key auth failed, falling back to password"
                );
                false
            }
            Ok(Err(err)) => {
                error!(user = %args.user, key = %identity_label, error = %err, "Public-key auth fatal");
                return Err(err);
            }
            Err(_) if password.is_some() => {
                warn!(
                    user = %args.user,
                    key = %identity_label,
                    timeout_ms = SSH_AUTH_ATTEMPT_TIMEOUT.as_millis() as u64,
                    "Public-key auth timed out, falling back to password"
                );
                false
            }
            Err(_) => {
                error!(
                    user = %args.user,
                    key = %identity_label,
                    timeout_ms = SSH_AUTH_ATTEMPT_TIMEOUT.as_millis() as u64,
                    "Public-key auth timed out"
                );
                return Err(anyhow!(
                    "auth_timeout: public-key authentication timed out for {}@{}",
                    args.user,
                    args.host
                ));
            }
        }
    } else {
        false
    };

    if authed {
        return Ok(());
    }

    if let Some(ref password) = password {
        validate_username(&args.user)?;
        let prefer_keyboard_interactive = prefers_keyboard_interactive(args, banner_device_hint);

        if prefer_keyboard_interactive {
            info!(
                user = %args.user,
                host = %args.host,
                device_hint = ?clean_device_hint(args.device_hint.as_deref()),
                "Attempting keyboard-interactive auth before password auth"
            );
            match tokio::time::timeout(
                SSH_AUTH_ATTEMPT_TIMEOUT,
                try_keyboard_interactive_auth(handle, &args.user, password),
            )
            .await
            {
                Ok(Ok(true)) => {
                    info!(user = %args.user, "Keyboard-interactive auth succeeded");
                    Ok(())
                }
                Ok(Ok(false)) => Err(anyhow!(
                    "password_incorrect: password rejected for {}@{}",
                    args.user,
                    args.host
                )),
                Ok(Err(err)) if is_keyboard_interactive_unavailable(&err) => {
                    warn!(
                        user = %args.user,
                        host = %args.host,
                        error = %err,
                        "Keyboard-interactive auth unavailable, trying password auth"
                    );
                    let ok = try_password_auth_with_timeout(
                        handle,
                        &args.user,
                        &args.host,
                        password,
                    )
                    .await?;
                    if ok {
                        info!(user = %args.user, "Password auth succeeded");
                        Ok(())
                    } else {
                        Err(anyhow!(
                            "password_incorrect: password rejected for {}@{}",
                            args.user,
                            args.host
                        ))
                    }
                }
                Ok(Err(err)) => {
                    warn!(
                        user = %args.user,
                        host = %args.host,
                        error = %err,
                        "Keyboard-interactive auth failed"
                    );
                    Err(anyhow!(
                        "password_incorrect: password rejected for {}@{}",
                        args.user,
                        args.host
                    ))
                }
                Err(_) => Err(anyhow!(
                    "auth_timeout: keyboard-interactive authentication timed out for {}@{}",
                    args.user,
                    args.host
                )),
            }
        } else {
            info!(user = %args.user, host = %args.host, "Attempting password auth");
            let ok = try_password_auth_with_timeout(handle, &args.user, &args.host, password).await?;
            if ok {
                info!(user = %args.user, "Password auth succeeded");
                Ok(())
            } else {
                Err(anyhow!(
                    "password_incorrect: password rejected for {}@{}",
                    args.user,
                    args.host
                ))
            }
        }
    } else {
        validate_username(&args.user)?;
        if identity_file.is_some() {
            warn!(
                alias = %args.alias,
                host = %args.host,
                "Public key was not accepted and no password is available"
            );
            return Err(anyhow!(
                "password_required: SSH key was not accepted and no password is available for {}@{}",
                args.user,
                args.host
            ));
        }
        warn!(alias = %args.alias, host = %args.host, "Password required but not available");
        Err(anyhow!(
            "password_required: password is required for {}@{}",
            args.user,
            args.host
        ))
    }
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
                path_role: self.path_role.clone(),
            },
        );

        let decision = tokio::time::timeout(std::time::Duration::from_secs(600), rx).await;
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
        info!(
            host = %args.host,
            port = args.port,
            user = %args.user,
            has_password = normalized_password(&args).is_some(),
            has_identity = normalized_identity_file(&args).is_some(),
            has_jump = args.jump.is_some(),
            "SSH connect starting"
        );

        let mut jump_handle_for_session = None;
        let (mut handle, banner_device_hint) = if let Some(jump) = args.jump.clone() {
            let jump_args = open_args_from_jump(jump, args.skip_open_ssh_known_hosts);
            let (mut jump_handle, jump_banner_hint) = connect_authenticated_tcp(
                app,
                &format!("{id}:jump"),
                &jump_args,
                challenge_registry.clone(),
                "jump",
            )
            .await?;
            authenticate_handle(&mut jump_handle, &jump_args, jump_banner_hint.as_deref())
                .await
                .map_err(|err| anyhow!("jump_{err}"))?;
            info!(
                jump = %jump_args.host,
                target = %args.host,
                port = args.port,
                "Opening direct-tcpip channel through jump host"
            );
            let channel = jump_handle
                .channel_open_direct_tcpip(args.host.clone(), u32::from(args.port), "127.0.0.1", 0)
                .await
                .map_err(|err| anyhow!("jump_channel_open_failed: {err}"))?;
            let stream = channel.into_stream();
            let target_handle = connect_authenticated_stream(
                app,
                id,
                &args,
                challenge_registry.clone(),
                stream,
                "target",
            )
            .await?;
            jump_handle_for_session = Some(Arc::new(Mutex::new(jump_handle)));
            (target_handle, None)
        } else {
            connect_authenticated_tcp(app, id, &args, challenge_registry.clone(), "direct").await?
        };

        authenticate_handle(&mut handle, &args, banner_device_hint.as_deref()).await?;

        if let Some(metadata) = metadata_from_device_hint(id, &args, banner_device_hint.as_deref()) {
            debug!(
                alias = %args.alias,
                host = %args.host,
                icon = ?metadata.icon_override,
                "SSH host metadata inferred from device hint"
            );
            let _ = app.emit("ssh:host-metadata", metadata);
        } else {
            match detect_host_metadata(&mut handle, id, &args).await {
                Ok(Some(metadata)) => {
                    debug!(
                        alias = %args.alias,
                        host = %args.host,
                        icon = ?metadata.icon_override,
                        "SSH host metadata detected"
                    );
                    let _ = app.emit("ssh:host-metadata", metadata);
                }
                Ok(None) => {
                    debug!(alias = %args.alias, host = %args.host, "No SSH host metadata detected");
                }
                Err(err) => {
                    debug!(
                        alias = %args.alias,
                        host = %args.host,
                        error = %err,
                        "SSH host metadata detection skipped"
                    );
                }
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
        if let Some(locale) = clean_env_value(args.terminal_locale.as_deref()) {
            let _ = channel.set_env(false, "LANG", locale).await;
            let _ = channel.set_env(false, "LC_ALL", locale).await;
        }
        if let Some(timezone) = clean_env_value(args.terminal_timezone.as_deref()) {
            let _ = channel.set_env(false, "TZ", timezone).await;
        }
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
            jump_handle: jump_handle_for_session,
            commands: tx,
            detached: false,
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
        let jump_handle = self.jump_handle.clone();
        tokio::spawn(async move {
            let guard = handle.lock().await;
            let _ = guard
                .disconnect(Disconnect::ByApplication, "session closed", "en")
                .await;
            if let Some(jump_handle) = jump_handle {
                let guard = jump_handle.lock().await;
                let _ = guard
                    .disconnect(Disconnect::ByApplication, "jump session closed", "en")
                    .await;
            }
        });
        Ok(())
    }

    /// Detach the session — keep the SSH connection and remote shell alive
    /// but stop the frontend I/O task.  The session can be reattached later.
    pub fn detach(&mut self) {
        self.detached = true;
    }

    /// Reattach a previously detached session so the frontend can resume
    /// sending/receiving data.
    pub fn reattach(&mut self) {
        self.detached = false;
    }
}

pub async fn run_exec(
    app: &AppHandle,
    id: &str,
    args: SshExecHostArgs,
    command: &str,
    challenge_registry: HostKeyChallengeRegistry,
) -> Result<String> {
    let open_args = open_args_from_exec(args);
    let mut jump_handle_for_disconnect = None;
    let mut handle = if let Some(jump) = open_args.jump.clone() {
        let jump_args = open_args_from_jump(jump, open_args.skip_open_ssh_known_hosts);
        let (mut jump_handle, jump_banner_hint) = connect_authenticated_tcp(
            app,
            &format!("{id}:jump"),
            &jump_args,
            challenge_registry.clone(),
            "jump",
        )
        .await?;
        authenticate_handle(&mut jump_handle, &jump_args, jump_banner_hint.as_deref())
            .await
            .map_err(|err| anyhow!("jump_{err}"))?;
        let channel = jump_handle
            .channel_open_direct_tcpip(
                open_args.host.clone(),
                u32::from(open_args.port),
                "127.0.0.1",
                0,
            )
            .await
            .map_err(|err| anyhow!("jump_channel_open_failed: {err}"))?;
        let stream = channel.into_stream();
        let target_handle = connect_authenticated_stream(
            app,
            id,
            &open_args,
            challenge_registry.clone(),
            stream,
            "target",
        )
        .await?;
        jump_handle_for_disconnect = Some(jump_handle);
        target_handle
    } else {
        let (handle, _banner_hint) =
            connect_authenticated_tcp(app, id, &open_args, challenge_registry.clone(), "direct")
                .await?;
        handle
    };

    authenticate_handle(&mut handle, &open_args, None).await?;
    let output = tokio::time::timeout(
        Duration::from_secs(12),
        run_host_metadata_command(&mut handle, command),
    )
    .await
    .map_err(|_| anyhow!("readonly_exec_timeout"))??;
    let _ = handle
        .disconnect(Disconnect::ByApplication, "exec complete", "en")
        .await;
    if let Some(jump_handle) = jump_handle_for_disconnect {
        let _ = jump_handle
            .disconnect(Disconnect::ByApplication, "exec jump complete", "en")
            .await;
    }
    Ok(output)
}

fn open_args_from_exec(args: SshExecHostArgs) -> SshOpenArgs {
    SshOpenArgs {
        alias: args.alias,
        host: args.host,
        user: args.user,
        port: args.port,
        identity_file: args.identity_file,
        password: args.password,
        passphrase: args.passphrase,
        skip_open_ssh_known_hosts: None,
        terminal_locale: None,
        terminal_timezone: None,
        device_hint: args.device_hint,
        jump: args.jump,
    }
}

fn open_args_from_jump(args: SshJumpArgs, skip_known_hosts: Option<bool>) -> SshOpenArgs {
    SshOpenArgs {
        alias: args.alias,
        host: args.host,
        user: args.user,
        port: args.port,
        identity_file: args.identity_file,
        password: args.password,
        passphrase: args.passphrase,
        skip_open_ssh_known_hosts: skip_known_hosts,
        terminal_locale: None,
        terminal_timezone: None,
        device_hint: args.device_hint,
        jump: None,
    }
}

async fn detect_host_metadata(
    handle: &mut Handle<ClientHandler>,
    session_id: &str,
    args: &SshOpenArgs,
) -> Result<Option<SshHostMetadata>> {
    let output = match tokio::time::timeout(
        Duration::from_secs(2),
        run_host_metadata_command(handle, HOST_METADATA_SCRIPT),
    )
    .await
    {
        Ok(Ok(output)) => output,
        Ok(Err(err)) => return Err(err),
        Err(_) => return Err(anyhow!("metadata_probe_timeout")),
    };
    let posix_metadata = host_metadata_from_probe(
        session_id,
        &args.alias,
        &args.host,
        args.port,
        &output,
    );
    if posix_metadata
        .as_ref()
        .and_then(|metadata| metadata.icon_override.as_ref())
        .is_some()
    {
        return Ok(posix_metadata);
    }

    for command in NETWORK_METADATA_COMMANDS {
        let output = match tokio::time::timeout(
            Duration::from_secs(1),
            run_host_metadata_command(handle, command),
        )
        .await
        {
            Ok(Ok(output)) => output,
            Ok(Err(_)) | Err(_) => continue,
        };
        if let Some(metadata) =
            host_metadata_from_network_probe(session_id, &args.alias, &args.host, args.port, &output)
        {
            return Ok(Some(metadata));
        }
    }

    Ok(posix_metadata)
}

async fn run_host_metadata_command(
    handle: &mut Handle<ClientHandler>,
    command: &str,
) -> Result<String> {
    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|e| anyhow!("metadata_channel_open_failed: {}", e))?;
    channel
        .exec(true, command)
        .await
        .map_err(|e| anyhow!("metadata_exec_failed: {}", e))?;

    let mut output = Vec::new();
    loop {
        let Some(msg) = channel.wait().await else { break };
        match msg {
            ChannelMsg::Data { ref data } | ChannelMsg::ExtendedData { ref data, ext: _ } => {
                if output.len() >= 32 * 1024 {
                    break;
                }
                let remaining = 32 * 1024 - output.len();
                output.extend_from_slice(&data[..data.len().min(remaining)]);
            }
            ChannelMsg::Close | ChannelMsg::ExitStatus { .. } => break,
            ChannelMsg::Eof => {}
            _ => {}
        }
    }
    let _ = channel.close().await;
    Ok(String::from_utf8_lossy(&output).into_owned())
}

#[derive(Default, Debug)]
struct RemoteProbe {
    remote_hostname: Option<String>,
    os_id: Option<String>,
    os_id_like: Vec<String>,
    os_name: Option<String>,
    os_pretty_name: Option<String>,
    kernel: Option<String>,
    model: Option<String>,
    openwrt_release: bool,
    pve: bool,
}

fn host_metadata_from_probe(
    session_id: &str,
    alias: &str,
    host: &str,
    port: u16,
    output: &str,
) -> Option<SshHostMetadata> {
    if !output.contains("__NETSSH_BEGIN__") {
        return None;
    }
    let probe = parse_remote_probe(output);
    let (icon_override, icon_confidence) = infer_icon_override(alias, host, &probe);
    let role = infer_role(alias, &probe, icon_override.as_deref());
    let tags = infer_tags(&probe, icon_override.as_deref(), role.as_deref());

    let has_metadata = probe.remote_hostname.is_some()
        || probe.os_id.is_some()
        || probe.os_name.is_some()
        || probe.os_pretty_name.is_some()
        || probe.kernel.is_some()
        || probe.model.is_some()
        || icon_override.is_some()
        || !tags.is_empty();
    if !has_metadata {
        return None;
    }

    Some(SshHostMetadata {
        session_id: session_id.to_string(),
        alias: alias.to_string(),
        host: host.to_string(),
        port,
        remote_hostname: probe.remote_hostname,
        os_id: probe.os_id,
        os_name: probe.os_name,
        os_pretty_name: probe.os_pretty_name,
        kernel: probe.kernel,
        model: probe.model,
        icon_override,
        icon_confidence,
        role,
        tags,
    })
}

fn host_metadata_from_network_probe(
    session_id: &str,
    alias: &str,
    host: &str,
    port: u16,
    output: &str,
) -> Option<SshHostMetadata> {
    let text = output.to_lowercase();
    let (icon_override, os_name, role, tags) = if contains_any(
        &text,
        &[
            "huawei",
            "huawei versatile routing platform",
            "vrp software",
            "quidway",
            "cloudengine",
            "s5700",
            "s6700",
        ],
    ) {
        (
            Some("huawei".to_string()),
            Some("Huawei VRP".to_string()),
            network_role(&text),
            network_tags(&["huawei", "vrp"], &text),
        )
    } else if contains_any(
        &text,
        &[
            "cisco ios",
            "ios xe",
            "ios-xe",
            "nx-os",
            "cisco nexus",
            "cisco catalyst",
            "cisco systems",
        ],
    ) {
        (
            Some("cisco".to_string()),
            Some("Cisco IOS".to_string()),
            network_role(&text),
            network_tags(&["cisco"], &text),
        )
    } else {
        return None;
    };

    Some(SshHostMetadata {
        session_id: session_id.to_string(),
        alias: alias.to_string(),
        host: host.to_string(),
        port,
        remote_hostname: None,
        os_id: None,
        os_name,
        os_pretty_name: None,
        kernel: None,
        model: None,
        icon_override,
        icon_confidence: 90,
        role,
        tags,
    })
}

fn parse_remote_probe(output: &str) -> RemoteProbe {
    let mut probe = RemoteProbe::default();
    for raw_line in output.lines() {
        let line = raw_line.trim().trim_end_matches('\r').trim();
        if line.is_empty() || line == "__NETSSH_BEGIN__" || line == "__NETSSH_END__" {
            continue;
        }
        if let Some(value) = line.strip_prefix("__NETSSH_HOSTNAME__=") {
            set_non_empty(&mut probe.remote_hostname, value);
            continue;
        }
        if let Some(value) = line.strip_prefix("__NETSSH_KERNEL__=") {
            set_non_empty(&mut probe.kernel, value);
            continue;
        }
        if let Some(value) = line.strip_prefix("__NETSSH_MODEL__=") {
            set_non_empty(&mut probe.model, value);
            continue;
        }
        if line == "__NETSSH_OPENWRT_RELEASE__=1" {
            probe.openwrt_release = true;
            continue;
        }
        if line == "__NETSSH_PVE__=1" {
            probe.pve = true;
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let value = clean_probe_value(value);
        match key {
            "ID" => {
                let value = value.to_lowercase();
                set_non_empty(&mut probe.os_id, &value);
            }
            "ID_LIKE" => {
                for item in value.split_whitespace() {
                    push_unique(&mut probe.os_id_like, &item.to_lowercase());
                }
            }
            "NAME" => set_non_empty(&mut probe.os_name, &value),
            "PRETTY_NAME" => set_non_empty(&mut probe.os_pretty_name, &value),
            "DISTRIB_ID" => {
                let value = value.to_lowercase();
                if value.contains("openwrt") {
                    probe.openwrt_release = true;
                    set_non_empty(&mut probe.os_id, "openwrt");
                }
            }
            "DISTRIB_DESCRIPTION" => set_non_empty(&mut probe.os_pretty_name, &value),
            _ => {}
        }
    }
    probe
}

fn infer_icon_override(alias: &str, host: &str, probe: &RemoteProbe) -> (Option<String>, u8) {
    let name_text = format!("{alias} {host}").to_lowercase();
    let remote_text = [
        probe.remote_hostname.as_deref(),
        probe.os_id.as_deref(),
        probe.os_name.as_deref(),
        probe.os_pretty_name.as_deref(),
        probe.kernel.as_deref(),
        probe.model.as_deref(),
    ]
    .into_iter()
    .flatten()
    .chain(probe.os_id_like.iter().map(String::as_str))
    .collect::<Vec<_>>()
    .join(" ")
    .to_lowercase();

    if probe.pve || contains_any(&remote_text, &["proxmox", " pve", "-pve"]) {
        return (Some("proxmox".into()), 95);
    }
    if contains_any(&remote_text, &["istoreos", "istore os"]) {
        return (Some("istoreos".into()), 95);
    }
    if probe.openwrt_release || contains_any(&remote_text, &["openwrt", "lede"]) {
        return (Some("openwrt".into()), 95);
    }
    if contains_any(&remote_text, &["luckfox", "picokvm", "pico kvm"]) {
        return (Some("luckfox".into()), 95);
    }
    if contains_any(&remote_text, &["raspberry pi", "raspbian", "raspberrypi"]) {
        return (Some("raspberry".into()), 95);
    }
    if contains_any(
        &remote_text,
        &[
            "asuswrt",
            "asuswrt-merlin",
            "asus router",
            "asus wireless",
            "asus",
            "rog rapture",
            "aimesh",
            "rt-ac",
            "rt-ax",
            "gt-ac",
            "gt-ax",
            "tuf-ax",
        ],
    ) {
        return (Some("asus".into()), 95);
    }
    if contains_any(&remote_text, &["huawei", "vrp", "s5700", "s6700", "cloudengine"]) {
        return (Some("huawei".into()), 90);
    }
    if contains_any(&remote_text, &["cisco", "ios xe", "ios-xe", "nx-os", "catalyst"]) {
        return (Some("cisco".into()), 90);
    }
    if contains_any(&remote_text, &["ubuntu"]) || probe.os_id.as_deref() == Some("ubuntu") {
        return (Some("ubuntu".into()), 95);
    }
    if contains_any(&remote_text, &["debian"]) || probe.os_id.as_deref() == Some("debian") {
        return (Some("debian".into()), 90);
    }
    if contains_any(&remote_text, &["rocky"]) {
        return (Some("rocky".into()), 90);
    }
    if contains_any(&remote_text, &["almalinux", "alma linux"]) {
        return (Some("alma".into()), 90);
    }
    if contains_any(&remote_text, &["centos"]) {
        return (Some("centos".into()), 90);
    }
    if contains_any(&remote_text, &["darwin"]) {
        return (Some("macos".into()), 90);
    }
    if contains_any(&remote_text, &["microsoft", "windows"]) {
        return (Some("windows".into()), 90);
    }
    if contains_any(
        &name_text,
        &[
            "asus",
            "asuswrt",
            "rog-rapture",
            "rog rapture",
            "aimesh",
            "rt-ac",
            "rt-ax",
            "gt-ac",
            "gt-ax",
            "tuf-ax",
        ],
    ) {
        return (Some("asus".into()), 85);
    }
    if contains_any(&remote_text, &["linux"]) || probe.os_id.is_some() {
        return (Some("linux".into()), 70);
    }

    if contains_any(&name_text, &["huawei", "s5700", "s6700"]) {
        return (Some("huawei".into()), 55);
    }
    if contains_any(&name_text, &["cisco", "catalyst", "ios-xe", "nx-os"]) {
        return (Some("cisco".into()), 55);
    }
    if contains_any(&name_text, &["luckfox", "picokvm", "pico-kvm"]) {
        return (Some("luckfox".into()), 55);
    }
    if contains_any(&name_text, &["raspberry", "raspi"]) {
        return (Some("raspberry".into()), 55);
    }
    if contains_any(&name_text, &["proxmox", "pve"]) {
        return (Some("proxmox".into()), 55);
    }
    if contains_any(&name_text, &["istoreos", "istore-os"]) {
        return (Some("istoreos".into()), 55);
    }
    if contains_any(&name_text, &["openwrt"]) {
        return (Some("openwrt".into()), 55);
    }
    (None, 0)
}

fn infer_role(alias: &str, probe: &RemoteProbe, icon: Option<&str>) -> Option<String> {
    let text = [
        Some(alias),
        probe.remote_hostname.as_deref(),
        probe.os_name.as_deref(),
        probe.os_pretty_name.as_deref(),
        probe.model.as_deref(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ")
    .to_lowercase();

    match icon {
        Some("proxmox") => Some("hypervisor".into()),
        Some("openwrt") | Some("istoreos") | Some("asus") => Some("router".into()),
        Some("huawei") | Some("cisco") if contains_any(&text, &["switch", "s5700", "s6700", "catalyst"]) => {
            Some("switch".into())
        }
        Some("huawei") | Some("cisco") if contains_any(&text, &["router", "gateway"]) => {
            Some("router".into())
        }
        _ => None,
    }
}

fn infer_tags(probe: &RemoteProbe, icon: Option<&str>, role: Option<&str>) -> Vec<String> {
    let mut tags = Vec::new();
    if let Some(os_id) = &probe.os_id {
        push_unique(&mut tags, os_id);
    }
    for item in &probe.os_id_like {
        push_unique(&mut tags, item);
    }
    if let Some(pretty) = &probe.os_pretty_name {
        if pretty.to_lowercase().contains("ubuntu") {
            push_unique(&mut tags, "ubuntu");
        }
    }
    if probe
        .kernel
        .as_deref()
        .map(|kernel| kernel.to_lowercase().contains("linux"))
        .unwrap_or(false)
    {
        push_unique(&mut tags, "linux");
    }
    if probe.pve {
        push_unique(&mut tags, "proxmox");
        push_unique(&mut tags, "pve");
    }
    if probe.openwrt_release {
        push_unique(&mut tags, "openwrt");
    }
    if let Some(icon) = icon {
        push_unique(&mut tags, icon);
    }
    if let Some(role) = role {
        push_unique(&mut tags, role);
    }
    tags
}

fn network_role(text: &str) -> Option<String> {
    if contains_any(
        text,
        &[
            "switch",
            "s5700",
            "s6700",
            "cloudengine",
            "catalyst",
            "nexus",
        ],
    ) {
        return Some("switch".into());
    }
    if contains_any(text, &["router", "gateway", "routing platform"]) {
        return Some("router".into());
    }
    None
}

fn network_tags(base: &[&str], text: &str) -> Vec<String> {
    let mut tags = Vec::new();
    for tag in base {
        push_unique(&mut tags, tag);
    }
    if let Some(role) = network_role(text) {
        push_unique(&mut tags, &role);
    }
    if contains_any(text, &["ios xe", "ios-xe"]) {
        push_unique(&mut tags, "ios-xe");
    }
    if contains_any(text, &["nx-os"]) {
        push_unique(&mut tags, "nx-os");
    }
    tags
}

fn set_non_empty(slot: &mut Option<String>, value: &str) {
    let value = clean_probe_value(value);
    if value.is_empty() || slot.is_some() {
        return;
    }
    *slot = Some(value);
}

fn clean_probe_value(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() >= 2 {
        let first = trimmed.as_bytes()[0] as char;
        let last = trimmed.as_bytes()[trimmed.len() - 1] as char;
        if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
            return trimmed[1..trimmed.len() - 1]
                .replace("\\\"", "\"")
                .replace("\\'", "'");
        }
    }
    trimmed.to_string()
}

fn push_unique(tags: &mut Vec<String>, value: &str) {
    let tag = value.trim().to_lowercase();
    if tag.is_empty() || tags.iter().any(|item| item == &tag) {
        return;
    }
    tags.push(tag);
}

fn contains_any(text: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| text.contains(needle))
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
            return Err(anyhow!("{}", key_load_error_code(&e.to_string())));
        }
    };
    let ok = handle.authenticate_publickey(user, Arc::new(key)).await?;
    Ok(ok)
}

fn key_load_error_code(error: &str) -> &'static str {
    let raw = error.to_ascii_lowercase();
    if raw.contains("passphrase")
        || raw.contains("decrypt")
        || raw.contains("encrypted")
        || raw.contains("bad password")
        || raw.contains("invalid password")
    {
        "key_passphrase_needed"
    } else {
        "key_load_failed"
    }
}

async fn try_password_auth_with_timeout(
    handle: &mut Handle<ClientHandler>,
    user: &str,
    host: &str,
    password: &str,
) -> Result<bool> {
    match tokio::time::timeout(
        SSH_AUTH_ATTEMPT_TIMEOUT,
        handle.authenticate_password(user, password),
    )
    .await
    {
        Ok(result) => result.map_err(|e| {
            error!(error = %e, "Password auth protocol error");
            anyhow!("auth_error: {}", e)
        }),
        Err(_) => {
            error!(
                user = %user,
                host = %host,
                timeout_ms = SSH_AUTH_ATTEMPT_TIMEOUT.as_millis() as u64,
                "Password auth timed out"
            );
            Err(anyhow!(
                "auth_timeout: password authentication timed out for {}@{}",
                user,
                host
            ))
        }
    }
}

async fn peek_ssh_banner(socket: &tokio::net::TcpStream) -> Option<String> {
    let mut buffer = [0u8; 256];
    let read = tokio::time::timeout(SSH_BANNER_PEEK_TIMEOUT, socket.peek(&mut buffer))
        .await
        .ok()?
        .ok()?;
    if read == 0 {
        return None;
    }

    let text = String::from_utf8_lossy(&buffer[..read]);
    text.lines()
        .find(|line| line.starts_with("SSH-"))
        .map(|line| line.trim().to_string())
}

fn infer_device_hint_from_ssh_banner(banner: &str) -> Option<String> {
    let text = banner.to_ascii_lowercase();
    if text.contains("cisco") {
        return Some("cisco".into());
    }
    if text.contains("huawei") || text.contains("vrp") {
        return Some("huawei".into());
    }
    None
}

async fn try_keyboard_interactive_auth(
    handle: &mut Handle<ClientHandler>,
    user: &str,
    password: &str,
) -> Result<bool> {
    let mut response = handle
        .authenticate_keyboard_interactive_start(user, None)
        .await
        .map_err(|e| anyhow!("keyboard_interactive_unavailable: {}", e))?;

    for _ in 0..4 {
        match response {
            KeyboardInteractiveAuthResponse::Success => return Ok(true),
            KeyboardInteractiveAuthResponse::Failure => return Ok(false),
            KeyboardInteractiveAuthResponse::InfoRequest { prompts, .. } => {
                let responses = keyboard_interactive_responses(&prompts, password);
                response = handle
                    .authenticate_keyboard_interactive_respond(responses)
                    .await
                    .map_err(|e| anyhow!("keyboard_interactive_error: {}", e))?;
            }
        }
    }

    Ok(false)
}

fn is_keyboard_interactive_unavailable(err: &anyhow::Error) -> bool {
    err.to_string().starts_with("keyboard_interactive_unavailable:")
}

fn keyboard_interactive_responses(prompts: &[Prompt], password: &str) -> Vec<String> {
    if prompts.is_empty() {
        return Vec::new();
    }
    let mut used_password = false;
    let mut responses = Vec::with_capacity(prompts.len());
    for prompt in prompts {
        let text = prompt.prompt.to_lowercase();
        if !used_password && is_password_prompt(&text, prompt.echo) {
            responses.push(password.to_string());
            used_password = true;
        } else {
            responses.push(String::new());
        }
    }
    if !used_password {
        responses[0] = password.to_string();
    }
    responses
}

fn is_password_prompt(text: &str, echo: bool) -> bool {
    !echo
        || text.contains("password")
        || text.contains("passcode")
        || text.contains("密码")
        || text.contains("口令")
}

fn validate_username(user: &str) -> Result<()> {
    if user.trim().is_empty() || user.chars().any(|c| c.is_whitespace() || c == ':') {
        warn!(user = %user, "Username validation failed locally");
        return Err(anyhow!(
            "username_invalid: \"{}\" is not a valid SSH username",
            user
        ));
    }
    Ok(())
}

fn clean_device_hint(value: Option<&str>) -> Option<String> {
    let hint = value?.trim().to_lowercase();
    if hint.is_empty() || hint.contains('\0') {
        None
    } else {
        Some(hint)
    }
}

fn prefers_keyboard_interactive(args: &SshOpenArgs, banner_hint: Option<&str>) -> bool {
    let explicit_hint = clean_device_hint(args.device_hint.as_deref());
    let hint = explicit_hint
        .as_deref()
        .filter(|hint| *hint != "auto")
        .or(banner_hint);
    hint.is_some_and(|hint| NETWORK_DEVICE_HINTS.contains(&hint))
}

fn metadata_from_device_hint(
    session_id: &str,
    args: &SshOpenArgs,
    banner_hint: Option<&str>,
) -> Option<SshHostMetadata> {
    let explicit_hint = clean_device_hint(args.device_hint.as_deref());
    let hint = explicit_hint
        .as_deref()
        .filter(|hint| *hint != "auto")
        .or(banner_hint)?;
    match hint {
        "huawei" => Some(SshHostMetadata {
            session_id: session_id.to_string(),
            alias: args.alias.clone(),
            host: args.host.clone(),
            port: args.port,
            remote_hostname: None,
            os_id: None,
            os_name: Some("Huawei VRP".to_string()),
            os_pretty_name: None,
            kernel: None,
            model: None,
            icon_override: Some("huawei".to_string()),
            icon_confidence: 100,
            role: Some("switch".to_string()),
            tags: vec!["huawei".to_string(), "vrp".to_string()],
        }),
        "cisco" => Some(SshHostMetadata {
            session_id: session_id.to_string(),
            alias: args.alias.clone(),
            host: args.host.clone(),
            port: args.port,
            remote_hostname: None,
            os_id: None,
            os_name: Some("Cisco IOS".to_string()),
            os_pretty_name: None,
            kernel: None,
            model: None,
            icon_override: Some("cisco".to_string()),
            icon_confidence: 100,
            role: Some("switch".to_string()),
            tags: vec!["cisco".to_string()],
        }),
        _ => None,
    }
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

fn clean_env_value(value: Option<&str>) -> Option<&str> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty() && !value.contains('\0') && !value.contains('='))
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

    #[test]
    fn identity_file_log_label_redacts_parent_path() {
        let label = identity_file_log_label("C:\\Users\\lawrence\\.ssh\\lab_ed25519");
        assert_eq!(label, "configured:lab_ed25519");
        assert!(!label.contains("Users"));
        assert!(!label.contains("lawrence"));
    }

    #[test]
    fn key_load_error_code_uses_stable_redacted_codes() {
        assert_eq!(
            key_load_error_code("bad decrypt while reading C:\\Users\\lawrence\\.ssh\\id_rsa"),
            "key_passphrase_needed"
        );
        assert_eq!(
            key_load_error_code("No such file or directory: C:\\Users\\lawrence\\.ssh\\missing"),
            "key_load_failed"
        );
    }

    #[test]
    fn host_metadata_probe_detects_ubuntu() {
        let output = r#"__NETSSH_BEGIN__
NAME="Ubuntu"
ID=ubuntu
ID_LIKE=debian
PRETTY_NAME="Ubuntu 24.04.2 LTS"
__NETSSH_HOSTNAME__=metrics
__NETSSH_KERNEL__=Linux 6.8.0-60-generic x86_64
__NETSSH_END__
"#;

        let metadata = host_metadata_from_probe("session-1", "metrics", "192.168.77.213", 22, output)
            .expect("metadata");
        assert_eq!(metadata.remote_hostname.as_deref(), Some("metrics"));
        assert_eq!(metadata.os_id.as_deref(), Some("ubuntu"));
        assert_eq!(metadata.icon_override.as_deref(), Some("ubuntu"));
        assert!(metadata.icon_confidence >= 90);
        assert!(metadata.tags.contains(&"ubuntu".to_string()));
        assert!(metadata.tags.contains(&"linux".to_string()));
    }

    #[test]
    fn host_metadata_probe_prefers_proxmox_over_debian() {
        let output = r#"__NETSSH_BEGIN__
NAME="Debian GNU/Linux"
ID=debian
PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"
__NETSSH_PVE__=1
__NETSSH_HOSTNAME__=pve
__NETSSH_KERNEL__=Linux 6.8.12-9-pve x86_64
__NETSSH_END__
"#;

        let metadata = host_metadata_from_probe("session-1", "pve", "192.168.77.160", 22, output)
            .expect("metadata");
        assert_eq!(metadata.icon_override.as_deref(), Some("proxmox"));
        assert_eq!(metadata.role.as_deref(), Some("hypervisor"));
        assert!(metadata.tags.contains(&"pve".to_string()));
    }

    #[test]
    fn host_metadata_probe_prefers_raspberry_model_over_debian() {
        let output = r#"__NETSSH_BEGIN__
NAME="Debian GNU/Linux"
ID=debian
PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"
__NETSSH_MODEL__=Raspberry Pi 4 Model B Rev 1.5
__NETSSH_HOSTNAME__=pi
__NETSSH_KERNEL__=Linux 6.6.20+rpt-rpi-v8 aarch64
__NETSSH_END__
"#;

        let metadata = host_metadata_from_probe("session-1", "pi", "192.168.77.198", 22, output)
            .expect("metadata");
        assert_eq!(metadata.icon_override.as_deref(), Some("raspberry"));
        assert!(metadata.tags.contains(&"debian".to_string()));
    }

    #[test]
    fn host_metadata_probe_prefers_asus_router_over_generic_linux() {
        let output = r#"__NETSSH_BEGIN__
NAME="Linux"
ID=linux
PRETTY_NAME="Linux"
__NETSSH_MODEL__=ASUSTeK COMPUTER INC. RT-AX86U
__NETSSH_HOSTNAME__=asus-router
__NETSSH_KERNEL__=Linux 4.19.183 aarch64
__NETSSH_END__
"#;

        let metadata =
            host_metadata_from_probe("session-1", "asus-router", "192.168.100.154", 22, output)
                .expect("metadata");
        assert_eq!(metadata.icon_override.as_deref(), Some("asus"));
        assert!(metadata.icon_confidence >= 80);
        assert_eq!(metadata.role.as_deref(), Some("router"));
        assert!(metadata.tags.contains(&"asus".to_string()));
        assert!(metadata.tags.contains(&"router".to_string()));
        assert!(metadata.tags.contains(&"linux".to_string()));
    }

    #[test]
    fn network_metadata_probe_detects_huawei_vrp_switch() {
        let output = r#"Huawei Versatile Routing Platform Software
VRP (R) software, Version 5.170 (S5700 V200R022C00SPC500)
Quidway S5700-28C-EI uptime is 10 weeks
"#;

        let metadata =
            host_metadata_from_network_probe("session-1", "switch", "192.168.100.253", 22, output)
                .expect("metadata");
        assert_eq!(metadata.icon_override.as_deref(), Some("huawei"));
        assert_eq!(metadata.role.as_deref(), Some("switch"));
        assert!(metadata.tags.contains(&"vrp".to_string()));
    }

    #[test]
    fn network_metadata_probe_detects_cisco_switch() {
        let output = r#"Cisco IOS XE Software, Version 17.09.04a
Cisco Catalyst 9300 Switch uptime is 2 weeks
"#;

        let metadata =
            host_metadata_from_network_probe("session-1", "core-cisco", "192.168.100.252", 22, output)
                .expect("metadata");
        assert_eq!(metadata.icon_override.as_deref(), Some("cisco"));
        assert_eq!(metadata.role.as_deref(), Some("switch"));
        assert!(metadata.tags.contains(&"ios-xe".to_string()));
    }

    #[test]
    fn keyboard_interactive_uses_password_for_hidden_password_prompt() {
        let prompts = vec![Prompt {
            prompt: "Password:".into(),
            echo: false,
        }];
        assert_eq!(
            keyboard_interactive_responses(&prompts, "secret"),
            vec!["secret".to_string()]
        );
    }

    #[test]
    fn keyboard_interactive_leaves_non_password_prompts_empty() {
        let prompts = vec![
            Prompt {
                prompt: "Password:".into(),
                echo: false,
            },
            Prompt {
                prompt: "Verification code:".into(),
                echo: true,
            },
        ];
        assert_eq!(
            keyboard_interactive_responses(&prompts, "secret"),
            vec!["secret".to_string(), String::new()]
        );
    }

    #[test]
    fn keyboard_interactive_uses_password_for_chinese_passphrase_prompt() {
        let prompts = vec![Prompt {
            prompt: "用户口令:".into(),
            echo: true,
        }];
        assert_eq!(
            keyboard_interactive_responses(&prompts, "secret"),
            vec!["secret".to_string()]
        );
    }

    #[test]
    fn huawei_device_hint_prefers_keyboard_interactive() {
        let args = test_ssh_args(Some("huawei"));
        assert!(prefers_keyboard_interactive(&args, None));
        let metadata = metadata_from_device_hint("session-1", &args, None).expect("metadata");
        assert_eq!(metadata.icon_override.as_deref(), Some("huawei"));
        assert_eq!(metadata.role.as_deref(), Some("switch"));
        assert!(metadata.tags.contains(&"vrp".to_string()));
    }

    #[test]
    fn linux_device_hint_keeps_default_auth_order() {
        let args = test_ssh_args(Some("ubuntu"));
        assert!(!prefers_keyboard_interactive(&args, None));
        assert!(metadata_from_device_hint("session-1", &args, None).is_none());
    }

    #[test]
    fn keyboard_interactive_unavailable_error_is_detected() {
        let unavailable = anyhow::anyhow!("keyboard_interactive_unavailable: no method");
        let rejected = anyhow::anyhow!("keyboard_interactive_error: rejected");

        assert!(is_keyboard_interactive_unavailable(&unavailable));
        assert!(!is_keyboard_interactive_unavailable(&rejected));
    }

    #[test]
    fn cisco_ssh_banner_infers_device_hint_and_metadata() {
        let args = test_ssh_args(None);
        assert_eq!(
            infer_device_hint_from_ssh_banner("SSH-2.0-Cisco-1.25").as_deref(),
            Some("cisco")
        );
        assert!(prefers_keyboard_interactive(&args, Some("cisco")));
        let metadata =
            metadata_from_device_hint("session-1", &args, Some("cisco")).expect("metadata");
        assert_eq!(metadata.icon_override.as_deref(), Some("cisco"));
        assert_eq!(metadata.role.as_deref(), Some("switch"));
    }

    #[test]
    fn no_common_algorithm_message_labels_kex_failures() {
        let message = no_common_algorithm_message(
            &russh::AlgorithmKind::Kex,
            &["diffie-hellman-group14-sha1".to_string()],
            &["diffie-hellman-group-exchange-sha1".to_string()],
        );

        assert!(message.starts_with("kex_no_common_algorithm:"));
        assert!(message.contains("diffie-hellman-group-exchange-sha1"));
    }

    #[test]
    fn no_common_algorithm_message_labels_mac_failures() {
        let message = no_common_algorithm_message(
            &russh::AlgorithmKind::Mac,
            &["hmac-sha2-256".to_string()],
            &["hmac-sha1-96".to_string()],
        );

        assert!(message.starts_with("mac_no_common_algorithm:"));
        assert!(message.contains("hmac-sha1-96"));
    }

    #[test]
    fn modern_profile_keeps_legacy_network_algorithms_as_fallback() {
        let config = ssh_client_config(SshAlgorithmProfile::ModernWithLegacyFallback);
        assert!(config.preferred.kex.iter().any(|item| item.as_ref() == "diffie-hellman-group14-sha1"));
        assert!(config.preferred.kex.iter().any(|item| item.as_ref() == "diffie-hellman-group1-sha1"));
        assert!(config.preferred.key.iter().any(|item| item.as_ref() == "ssh-rsa"));
        assert!(config.preferred.cipher.iter().any(|item| item.as_ref() == "aes128-cbc"));
        assert!(config.preferred.cipher.iter().any(|item| item.as_ref() == "3des-cbc"));
        assert!(config.preferred.mac.iter().any(|item| item.as_ref() == "hmac-sha1"));
    }

    #[test]
    fn legacy_network_profile_offers_cisco_compatible_algorithms_first() {
        let config = ssh_client_config(SshAlgorithmProfile::LegacyNetworkDevice);
        assert_eq!(config.preferred.kex[0].as_ref(), "diffie-hellman-group14-sha1");
        assert_eq!(config.preferred.key[0].as_ref(), "ssh-rsa");
        assert_eq!(config.preferred.cipher[0].as_ref(), "aes128-ctr");
        assert_eq!(config.preferred.mac[0].as_ref(), "hmac-sha1");
    }

    fn test_ssh_args(device_hint: Option<&str>) -> SshOpenArgs {
        SshOpenArgs {
            alias: "switch".to_string(),
            host: "192.168.100.253".to_string(),
            user: "admin".to_string(),
            port: 22,
            identity_file: None,
            password: Some("secret".to_string()),
            passphrase: None,
            skip_open_ssh_known_hosts: None,
            terminal_locale: None,
            terminal_timezone: None,
            device_hint: device_hint.map(str::to_string),
            jump: None,
        }
    }
}
