# netssh Backlog

## Phase 0: Autonomous Development Rails

- [x] Restore `npm run lint` as a usable validation gate for ESLint 9.
- [x] Add `.ai` product vision, backlog, and iteration rules.
- [x] Add a PowerShell helper that runs the full validation gate and writes a timestamped report.
- [x] Add a README app interface screenshot.
- [x] Refresh the README screenshot with a multi-site network topology view.

## Phase 1: Asset Inventory + Quick SSH

- [x] Extend the host model toward an asset model with `assetType`, `connectionType`, `aliases`, and `source`.
- [x] Preserve multiple SSH config aliases such as `Host shgw-lan gw-main`.
- [x] Infer site/group from `# SITE:` comments during SSH config import.
- [x] Add SSH config import preview before importing.
- [x] Add diagnostics for duplicate host aliases.
- [x] Add diagnostics for duplicate hostnames and duplicate `HostName` directives.
- [x] Add diagnostics for missing identity files.
- [x] Add favorites and recent connection timestamps.
- [x] Improve quick connect error diagnostics for DNS, route, port, auth, and key-passphrase failures.
- [x] Fix unknown host key handling so the user confirms TOFU before trust is granted.
- [x] Implement blocking TOFU host key challenge with `ssh_host_key_decide`.
- [x] Store Netssh-trusted host keys in local SQLite instead of writing OpenSSH `known_hosts`.
- [x] Add known_hosts parser support for comma-separated hosts and `[host]:port`.

## Phase 2: Serial Console

- [x] Add serial connection profile types.
- [x] Define `SerialProfile` and attach it to `Host.serialProfile`.
- [x] Add serial preset constants for Cisco, Huawei, H3C, OpenWRT/Linux SBC, and Generic.
- [x] Update Host editor to switch between SSH and Serial connection fields.
- [ ] Add Rust serial backend commands: list ports, open, send, resize/no-op, close.
- [ ] Add frontend serial API wrappers and serial event listeners.
- [ ] Add TerminalPane serial live mode.
- [ ] Add console profile editor fields: COM port, baud rate, data bits, parity, stop bits, flow control, line ending.
- [ ] Add presets for Cisco/Huawei/H3C 9600 8N1.
- [ ] Add presets for OpenWRT/Linux/SBC 115200 8N1.

## Phase 3: Credential and Safety

- [ ] Consolidate credentials and identities into one clear credential profile model.
- [ ] Bind assets to credential profiles instead of duplicating login data everywhere.
- [ ] Add production asset markers.
- [ ] Add dangerous command confirmation.
- [ ] Add local operation log metadata without storing command bodies.

