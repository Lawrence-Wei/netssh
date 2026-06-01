// Read-only parser for ~/.ssh/config via the `ssh2-config` crate.
//
// Supports Include, Match, Wildcard patterns, and all standard directives.
// Never writes — the user must opt in via Settings → Advanced to allow
// Netssh to modify the config.

use anyhow::Result;
use serde::Serialize;
use std::io::BufReader;
use std::path::PathBuf;

#[derive(Serialize, Clone, Debug)]
pub struct HostEntry {
    pub alias: String,
    pub hostname: Option<String>,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
    pub raw: String,
}

pub fn default_path() -> Option<PathBuf> {
    dirs::home_dir().map(|d| d.join(".ssh").join("config"))
}

pub fn parse(path: Option<String>) -> Result<Vec<HostEntry>> {
    let p = path
        .map(PathBuf::from)
        .or_else(default_path)
        .ok_or_else(|| anyhow::anyhow!("no ssh_config path"))?;

    if !p.exists() {
        return Ok(Vec::new());
    }

    let file = std::fs::File::open(&p)?;
    let mut reader = BufReader::new(file);

    let config = ssh2_config::SshConfig::default()
        .parse(
            &mut reader,
            ssh2_config::ParseRule::ALLOW_UNSUPPORTED_FIELDS,
        )
        .map_err(|e| anyhow::anyhow!("failed to parse ssh config: {}", e))?;

    let mut entries: Vec<HostEntry> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // Collect all host patterns, expand wildcards, and resolve params.
    for host in config.get_hosts() {
        let pattern_str: String = match host.pattern.first() {
            Some(clause) => {
                let s = clause.to_string();
                if s.contains('*') || s.contains('?') || s == "*" {
                    continue;
                }
                s
            }
            None => continue,
        };

        if seen.contains(&pattern_str) {
            continue;
        }
        seen.insert(pattern_str.clone());

        let hostname = host.params.host_name.as_ref().map(|s| s.to_string());
        let user = host.params.user.as_ref().map(|s| s.to_string());
        let port = host.params.port;
        let identity_file = host
            .params
            .identity_file
            .as_ref()
            .and_then(|v| v.first())
            .map(|s| expand_tilde(&s.to_string_lossy()));

        let mut raw = String::new();
        raw.push_str(&format!("Host {}\n", pattern_str));
        if let Some(ref hn) = hostname {
            raw.push_str(&format!("  HostName {}\n", hn));
        }
        if let Some(ref u) = user {
            raw.push_str(&format!("  User {}\n", u));
        }
        if let Some(p) = port {
            raw.push_str(&format!("  Port {}\n", p));
        }
        if let Some(ref id) = identity_file {
            raw.push_str(&format!("  IdentityFile {}\n", id));
        }

        entries.push(HostEntry {
            alias: pattern_str.clone(),
            hostname,
            user,
            port,
            identity_file,
            raw,
        });
    }

    // If no hosts were found (config may use patterns only), try known hosts file.
    if entries.is_empty() {
        let known = dirs::home_dir()
            .ok_or_else(|| anyhow::anyhow!("no home dir"))?
            .join(".ssh")
            .join("known_hosts");
        if let Ok(text) = std::fs::read_to_string(&known) {
            for line in text.lines() {
                let host = line.split(|c: char| c.is_whitespace() || c == ',').next().unwrap_or("");
                if host.is_empty() || host.contains('|') || seen.contains(host) {
                    continue;
                }
                seen.insert(host.to_string());
                entries.push(HostEntry {
                    alias: host.to_string(),
                    hostname: Some(host.to_string()),
                    user: None,
                    port: None,
                    identity_file: None,
                    raw: format!("# from known_hosts\nHost {}\n", host),
                });
            }
        }
    }

    Ok(entries)
}

fn expand_tilde(s: &str) -> String {
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
    use std::io::Write;

    #[test]
    fn parses_basic_config() {
        let mut f = tempfile::NamedTempFile::new().unwrap();
        writeln!(
            f,
            "# my hosts\nHost prox-01\n  HostName 10.10.1.11\n  User root\n  Port 22\n  IdentityFile ~/.ssh/homelab_ed25519\n\nHost edge-fra\n  HostName edge-fra.example\n  Port 2222\n"
        )
        .unwrap();
        let entries = parse(Some(f.path().to_string_lossy().into())).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].alias, "prox-01");
        assert_eq!(entries[0].port, Some(22));
        assert_eq!(entries[1].alias, "edge-fra");
        assert_eq!(entries[1].port, Some(2222));
    }
}
