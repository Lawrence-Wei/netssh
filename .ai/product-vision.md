# netssh Product Vision

netssh is a local-first SSH and serial console operations workbench for Infra and Network users on Windows.

## Core Users

- Network engineers
- Infra engineers
- SRE / Ops users
- IT admins
- Homelab and office lab operators

## Core Assets

- Switches, routers, firewalls, and gateways
- OpenWRT, iStoreOS, and similar network appliances
- NAS devices such as ZspaceNAS
- PVE, Docker hosts, Linux servers, PCs, and Macs
- Cloud servers from Aliyun, Tencent Cloud, CloudCone, and generic VPS providers

## Product Direction

The app should help users find assets quickly, connect safely, keep local credentials private, and preserve Windows operator habits. Existing `~/.ssh/config` usage is a first-class import path, not an afterthought.

## Phase 1 MVP

- Asset inventory
- Site/group management
- SSH config import preview
- Quick SSH connection
- Favorites and recent connections
- Basic connection diagnostics

## Phase 2

- Serial console connection profiles
- COM port selection
- Baud rate and 8N1 configuration
- Network-device console presets

## Phase 3

- Credential vault polish
- Batch commands
- Config backup and diff
- Safety and audit workflows
