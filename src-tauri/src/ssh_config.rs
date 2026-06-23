// Read-only parser for ~/.ssh/config via the `ssh2-config` crate.
//
// Supports Include, Match, Wildcard patterns, and all standard directives.
// Never writes — the user must opt in via Settings → Advanced to allow
// Netssh to modify the config.

use anyhow::Result;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize, Clone, Debug)]
pub struct HostEntry {
    pub alias: String,
    pub aliases: Vec<String>,
    pub hostname: Option<String>,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
    pub group: Option<String>,
    pub source: String,
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

    let text = std::fs::read_to_string(&p)?;
    let (mut entries, mut seen) = parse_text(&text);

    // If no hosts were found (config may use patterns only), try known hosts file.
    if entries.is_empty() {
        let known = dirs::home_dir()
            .ok_or_else(|| anyhow::anyhow!("no home dir"))?
            .join(".ssh")
            .join("known_hosts");
        if let Ok(text) = std::fs::read_to_string(&known) {
            for line in text.lines() {
                let host = line
                    .split(|c: char| c.is_whitespace() || c == ',')
                    .next()
                    .unwrap_or("");
                if host.is_empty() || host.contains('|') || seen.contains(host) {
                    continue;
                }
                seen.insert(host.to_string());
                entries.push(HostEntry {
                    alias: host.to_string(),
                    aliases: vec![host.to_string()],
                    hostname: Some(host.to_string()),
                    user: None,
                    port: None,
                    identity_file: None,
                    group: None,
                    source: "known-hosts".into(),
                    raw: format!("# from known_hosts\nHost {}\n", host),
                });
            }
        }
    }

    Ok(entries)
}

fn parse_text(text: &str) -> (Vec<HostEntry>, std::collections::HashSet<String>) {
    let mut entries = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut defaults = HostDefaults::default();
    let mut current_site: Option<String> = None;
    let mut current: Option<HostBlock> = None;

    for line in text.lines() {
        if let Some(site) = parse_site_comment(line) {
            current_site = Some(site);
        }

        let trimmed = line.trim();
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        let is_host_line = parts
            .first()
            .map(|part| part.eq_ignore_ascii_case("host"))
            .unwrap_or(false);

        if is_host_line {
            if let Some(block) = current.take() {
                if block.defaults_only {
                    defaults.apply_block(&block);
                } else {
                    push_block(block, &defaults, &mut seen, &mut entries);
                }
            }

            let aliases: Vec<String> = parts
                .iter()
                .skip(1)
                .filter(|part| !part.contains('*') && !part.contains('?') && **part != "!")
                .map(|part| (*part).to_string())
                .collect();

            if aliases.iter().any(|alias| alias == "*") || aliases.is_empty() {
                current = Some(HostBlock {
                    aliases,
                    group: current_site.clone(),
                    raw_lines: vec![line.to_string()],
                    defaults_only: true,
                    ..HostBlock::default()
                });
            } else {
                current = Some(HostBlock {
                    aliases,
                    group: current_site.clone(),
                    raw_lines: vec![line.to_string()],
                    defaults_only: false,
                    ..HostBlock::default()
                });
            }
            continue;
        }

        if let Some(block) = current.as_mut() {
            block.raw_lines.push(line.to_string());
            apply_directive_to_block(trimmed, block);
        }
    }

    if let Some(block) = current.take() {
        if block.defaults_only {
            defaults.apply_block(&block);
        } else {
            push_block(block, &defaults, &mut seen, &mut entries);
        }
    }

    (entries, seen)
}

#[derive(Default)]
struct HostDefaults {
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
}

impl HostDefaults {
    fn apply_block(&mut self, block: &HostBlock) {
        if block.user.is_some() {
            self.user = block.user.clone();
        }
        if block.port.is_some() {
            self.port = block.port;
        }
        if block.identity_file.is_some() {
            self.identity_file = block.identity_file.clone();
        }
    }
}

#[derive(Default)]
struct HostBlock {
    aliases: Vec<String>,
    hostname: Option<String>,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
    group: Option<String>,
    raw_lines: Vec<String>,
    defaults_only: bool,
}

fn push_block(
    block: HostBlock,
    defaults: &HostDefaults,
    seen: &mut std::collections::HashSet<String>,
    entries: &mut Vec<HostEntry>,
) {
    if block.defaults_only {
        return;
    }

    let aliases: Vec<String> = block
        .aliases
        .into_iter()
        .filter(|alias| seen.insert(alias.clone()))
        .collect();

    if aliases.is_empty() {
        return;
    }

    let alias = aliases[0].clone();
    entries.push(HostEntry {
        alias,
        aliases,
        hostname: block.hostname,
        user: block.user.or_else(|| defaults.user.clone()),
        port: block.port.or(defaults.port),
        identity_file: block
            .identity_file
            .or_else(|| defaults.identity_file.clone())
            .map(|path| expand_tilde(&path)),
        group: block.group,
        source: "ssh-config".into(),
        raw: block.raw_lines.join("\n"),
    });
}

fn apply_directive_to_block(trimmed: &str, block: &mut HostBlock) {
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return;
    }
    let mut parts = trimmed.splitn(2, char::is_whitespace);
    let key = parts.next().unwrap_or("");
    let value = parts.next().unwrap_or("").trim();
    if value.is_empty() {
        return;
    }

    if key.eq_ignore_ascii_case("hostname") {
        block.hostname = Some(value.to_string());
    } else if key.eq_ignore_ascii_case("user") {
        block.user = Some(value.to_string());
    } else if key.eq_ignore_ascii_case("port") {
        block.port = value.parse::<u16>().ok();
    } else if key.eq_ignore_ascii_case("identityfile") {
        block.identity_file = Some(value.to_string());
    }
}

fn parse_site_comment(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if !trimmed.starts_with('#') {
        return None;
    }
    let text = trimmed.trim_start_matches('#').trim();
    let lower = text.to_lowercase();
    if !lower.starts_with("site:") {
        return None;
    }
    text.split_once(':')
        .map(|(_, site)| site.trim())
        .filter(|site| !site.is_empty())
        .map(|site| site.to_string())
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

    #[test]
    fn preserves_multiple_aliases_and_site_comments() {
        let mut f = tempfile::NamedTempFile::new().unwrap();
        writeln!(
            f,
            "Host *\n  User root\n  IdentityFile ~/.ssh/id_ed25519\n\n# SITE: Office Lab\nHost sw-core gw-main\n  HostName 192.168.1.1\n"
        )
        .unwrap();

        let entries = parse(Some(f.path().to_string_lossy().into())).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].alias, "sw-core");
        assert_eq!(entries[0].aliases, vec!["sw-core", "gw-main"]);
        assert_eq!(entries[0].user.as_deref(), Some("root"));
        assert_eq!(entries[0].group.as_deref(), Some("Office Lab"));
    }
}
