import type { Group, Host, ShellInfo, Snippet, SshKey } from "../types";

export interface SnippetCategory {
  id: string;
  i18n: string;
  count: number;
}

export interface QuickCommand {
  name: string;
  cmd: string;
}

// Bundled mock hosts are intentionally empty: netssh now starts with a clean
// slate and asks the user to import from .xlsx / .json / .csv / ~/.ssh.
export const MOCK_HOSTS: Host[] = [];

export const HOST_GROUPS: Group[] = [
  { id: "unassigned", name: "Unassigned", color: "#897e6e" },
];

export const LOCAL_SHELLS: ShellInfo[] = [
  {
    id: "pwsh",
    name: "PowerShell 7",
    path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    is_default: true,
  },
  {
    id: "cmd",
    name: "Command Prompt",
    path: "C:\\Windows\\System32\\cmd.exe",
    is_default: false,
  },
  {
    id: "wsl",
    name: "WSL - default distro",
    path: "C:\\Windows\\System32\\wsl.exe",
    is_default: false,
  },
  {
    id: "gitbash",
    name: "Git Bash",
    path: "C:\\Program Files\\Git\\bin\\bash.exe",
    is_default: false,
  },
];

export const SSH_KEYS: SshKey[] = [];

export const SNIPPET_CATEGORIES: SnippetCategory[] = [
  { id: "all", i18n: "snippets.cat.all", count: 0 },
  { id: "network", i18n: "snippets.cat.network", count: 3 },
  { id: "system", i18n: "snippets.cat.system", count: 3 },
  { id: "docker", i18n: "snippets.cat.docker", count: 1 },
];

// Pared-down snippet library — only the everyday SSH-adjacent commands.
export const SNIPPETS: Snippet[] = [
  { id: "s-ssh", category: "network", name: "ssh user@host", desc: "Open an SSH session to a host.", cmd: "ssh ${user}@${host}", tags: ["ssh"], shells: ["bash", "pwsh"] },
  { id: "s-ping", category: "network", name: "ping", desc: "Send four ICMP echo requests.", cmd: "ping -c 4 ${host}", tags: ["net"], shells: ["bash"] },
  { id: "s-ifconfig", category: "network", name: "ifconfig / ip a", desc: "Show network interfaces.", cmd: "ip a || ifconfig", tags: ["net"], shells: ["bash"] },
  { id: "s-uptime", category: "system", name: "uptime", desc: "Show load and uptime.", cmd: "uptime", tags: ["quick"], shells: ["bash"] },
  { id: "s-df", category: "system", name: "df -h", desc: "Disk usage by filesystem.", cmd: "df -h", tags: ["disk"], shells: ["bash"] },
  { id: "s-osinfo", category: "system", name: "uname -a", desc: "Kernel and architecture.", cmd: "uname -a", tags: ["info"], shells: ["bash"] },
  { id: "s-dps", category: "docker", name: "docker ps", desc: "Containers running.", cmd: "docker ps", tags: ["docker"], shells: ["bash"] },
];

export const HOST_QUICK_CMDS: Record<string, QuickCommand[]> = {};
