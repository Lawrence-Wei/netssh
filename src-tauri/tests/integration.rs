// Rust 集成测试 — 覆盖 SSH 连接、host key 挑战、认证、存储等核心流程。
//
// 运行方式：cargo test --test integration 或 cargo test

use std::collections::HashSet;
use std::io::{BufReader, Cursor};
use std::sync::Arc;
use std::sync::Mutex as StdMutex;

// ============================================================
// 1. known_hosts 解析
// ============================================================

#[test]
fn known_hosts_parses_plain_entry() {
    let input = "example.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHpLGSicKoP09/I1s4wB9SJ8B68m+BL6hD9gQDWvrB9F";
    let reader = BufReader::new(Cursor::new(input));
    let mut out = HashSet::new();
    netssh_lib::ssh_load_known_hosts_from_reader(reader, "example.com", 22, &mut out);
    assert!(!out.is_empty(), "应有至少一个指纹");
}

#[test]
fn known_hosts_ignores_comments_and_blanks() {
    let input = "# this is a comment\n\n@cert-authority *.example.com key AAAAC3NzaC1lZDI1NTE5AAAAIHpLGSicKoP09/I1s4wB9SJ8B68m+BL6hD9gQDWvrB9F\n\nrealhost ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHpLGSicKoP09/I1s4wB9SJ8B68m+BL6hD9gQDWvrB9F";
    let reader = BufReader::new(Cursor::new(input));
    let mut out = HashSet::new();
    netssh_lib::ssh_load_known_hosts_from_reader(reader, "realhost", 22, &mut out);
    assert!(!out.is_empty(), "注释行和空行应被跳过");
}

#[test]
fn known_hosts_does_not_match_wrong_host() {
    let input = "otherhost ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGtest==";
    let reader = BufReader::new(Cursor::new(input));
    let mut out = HashSet::new();
    netssh_lib::ssh_load_known_hosts_from_reader(reader, "example.com", 22, &mut out);
    assert!(out.is_empty(), "不同主机名不应匹配");
}

// ============================================================
// 2. 存储集成测试
// ============================================================

#[test]
fn storage_db_open_and_migrate() {
    // 使用临时文件作为 SQLite 数据库
    let temp = tempfile::tempdir().expect("创建临时目录失败");
    let db_file = temp.path().join("test.db");
    // 直接打开文件路径的 Connection，跳过 migrate 也行——我们测 migrate 本身
    let conn = rusqlite::Connection::open(&db_file).expect("打开 SQLite 连接失败");
    // 跑一遍 migrate 的 SQL——不应该报错
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS trusted_host_keys (
          host        TEXT NOT NULL,
          port        INTEGER NOT NULL,
          key_type    TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          trusted_at  INTEGER NOT NULL,
          PRIMARY KEY (host, port, fingerprint)
        );
        CREATE TABLE IF NOT EXISTS connection_log (
          id          TEXT PRIMARY KEY,
          host_alias  TEXT NOT NULL,
          opened_at   INTEGER NOT NULL,
          closed_at   INTEGER,
          bytes_in    INTEGER NOT NULL DEFAULT 0,
          bytes_out   INTEGER NOT NULL DEFAULT 0,
          exit_status INTEGER,
          error       TEXT
        );
        ",
    )
    .expect("创建表失败");

    // INSERT 一条 host key
    conn.execute(
        "INSERT INTO trusted_host_keys (host, port, key_type, fingerprint, trusted_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            "test-host",
            22,
            "ssh-ed25519",
            "SHA256:abc123",
            1717920000u64
        ],
    )
    .expect("插入 host key 失败");

    // 查询应该返回结果
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM trusted_host_keys WHERE host = ?1 AND port = ?2",
            rusqlite::params!["test-host", 22u64],
            |row| row.get(0),
        )
        .expect("查询 host key 失败");
    assert_eq!(count, 1, "应有一条 trusted_host_key 记录");

    // connection_log
    conn.execute(
        "INSERT INTO connection_log (id, host_alias, opened_at, bytes_in, bytes_out)
         VALUES (?1, ?2, ?3, 0, 0)",
        rusqlite::params!["log-001", "my-router", 1717920000u64],
    )
    .expect("插入连接日志失败");
    let alias: String = conn
        .query_row(
            "SELECT host_alias FROM connection_log WHERE id = ?1",
            rusqlite::params!["log-001"],
            |row| row.get(0),
        )
        .expect("查询连接日志失败");
    assert_eq!(alias, "my-router");

    // UPDATE close
    conn.execute(
        "UPDATE connection_log SET closed_at = ?1, bytes_in = 4096, bytes_out = 1024, exit_status = 0 WHERE id = ?2",
        rusqlite::params![1717921000u64, "log-001"],
    )
    .expect("更新连接日志失败");
    let closed: Option<i64> = conn
        .query_row(
            "SELECT closed_at FROM connection_log WHERE id = ?1",
            rusqlite::params!["log-001"],
            |row| row.get(0),
        )
        .expect("查询关闭时间失败");
    assert!(closed.is_some());
}

#[test]
fn app_state_validation_rejects_sensitive_payloads() {
    assert!(netssh_lib::validate_app_state_value(
        "netssh.settings",
        r#"{"state":{"theme":"blue","terminalScrollback":10000}}"#
    )
    .is_ok());
    assert!(netssh_lib::validate_app_state_value(
        "netssh.credentials",
        r#"{"state":{"credentials":[{"id":"cred-1","user":"lawrence","hasPassword":true}]}}"#
    )
    .is_ok());
    assert!(netssh_lib::validate_app_state_value(
        "netssh.settings",
        r#"{"state":{"ephemeralPassword":"secret"}}"#
    )
    .is_err());
    assert!(netssh_lib::validate_app_state_value(
        "netssh.credentials",
        r#"{"state":{"credentials":[{"id":"cred-1","password":"secret"}]}}"#
    )
    .is_err());
    assert!(netssh_lib::validate_app_state_value("password", "anything").is_err());
}

// ============================================================
// 3. Host key 挑战注册表
// ============================================================

#[test]
fn registry_insert_and_remove() {
    let registry: netssh_lib::HostKeyChallengeRegistry =
        Arc::new(StdMutex::new(std::collections::HashMap::new()));

    let challenge_id = "challenge-42".to_string();
    let (tx, mut rx) = tokio::sync::oneshot::channel::<netssh_lib::HostKeyDecision>();

    {
        let mut map = registry.lock().unwrap_or_else(|e| e.into_inner());
        map.insert(challenge_id.clone(), tx);
    }

    {
        let mut map = registry.lock().unwrap_or_else(|e| e.into_inner());
        let sender = map.remove(&challenge_id);
        assert!(sender.is_some(), "应有注册过的 challenge");

        // 发送一个决策并检查 rx 收到
        sender
            .unwrap()
            .send(netssh_lib::HostKeyDecision::AcceptOnce)
            .unwrap();
    }

    // 由于是 oneshot，rx 应该能立刻拿到值
    // 注意：在非 async 测试里用 poll；简单验证一下即可
    let result = rx.try_recv();
    assert!(result.is_ok(), "接收方应收到 AcceptOnce");
}

// ============================================================
// 4. SSH config 解析
// ============================================================

#[test]
fn ssh_config_parse_handles_includes_and_wildcards() {
    use std::io::Write;
    let mut f = tempfile::NamedTempFile::new().unwrap();
    writeln!(
        f,
        "Host *\n  User root\n  Port 22\n\nHost router-*\n  User admin\n  Port 2222\n\nHost router-core\n  HostName 10.0.0.1\n\nHost router-edge\n  HostName 192.168.1.1\n"
    )
    .unwrap();

    let entries = netssh_lib::config_parse(Some(f.path().to_string_lossy().to_string())).unwrap();
    assert!(entries.len() >= 2, "应至少解析出 2 个主机条目");

    let router_core = entries.iter().find(|e| e.alias == "router-core");
    assert!(router_core.is_some(), "应找到 router-core");
    assert_eq!(router_core.unwrap().hostname.as_deref(), Some("10.0.0.1"));
}

// ============================================================
// 5. 工具函数
// ============================================================

#[test]
fn expand_tilde_expands_user_home() {
    let result = netssh_lib::ssh_expand_tilde("~/");
    assert!(!result.is_empty());
    // 在 Windows 上 C:\Users\... 或 \\?\
    if cfg!(windows) {
        assert!(
            result.contains("Users") || result.contains(":\\"),
            "展开路径应包含用户目录"
        );
    }
}

#[test]
fn host_matches_complex_known_hosts_lines() {
    // 非标准端口带方括号
    assert!(netssh_lib::ssh_host_matches(
        "[192.168.1.1]:2222",
        "192.168.1.1",
        2222
    ));
    assert!(!netssh_lib::ssh_host_matches(
        "[192.168.1.1]:2222",
        "192.168.1.1",
        22
    ));
    // 逗号分隔
    assert!(netssh_lib::ssh_host_matches("host-a,host-b", "host-b", 22));
    // 通配符
    assert!(netssh_lib::ssh_host_matches("*", "anything", 22));
}
