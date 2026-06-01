import type { Terminal as XTerm } from "@xterm/xterm";
import type { Host } from "../../types";

export function createDemoShell(
  term: XTerm,
  host: Host | undefined,
  fallbackTitle: string,
  onClose?: () => void
) {
  const user = host?.user || "local";
  const hn = host?.alias || fallbackTitle || "localhost";
  const cwd = { value: "~" };
  const line = { value: "" };
  const history: string[] = [];
  let histIndex = -1;
  const c = {
    reset: "\x1b[0m",
    dim: "\x1b[2m",
    bold: "\x1b[1m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
    purple: "\x1b[38;5;141m",
  };
  const prompt = () =>
    `${c.purple}${user}${c.gray}@${c.cyan}${hn}${c.reset}:${c.blue}${cwd.value}${c.reset}$ `;

  const start = () => {
    [
      "",
      `${c.gray}Welcome to ${c.reset}${c.bold}${host?.role || "Netssh local shell"}${c.reset} ${c.gray}- ${host?.hostname || "demo session"}${c.reset}`,
      `${c.gray}This installer build uses live Tauri bridges when available and this demo shell as a fallback.${c.reset}`,
      "",
      `${c.gray}Type ${c.reset}${c.bold}help${c.reset}${c.gray} for example commands.${c.reset}`,
      "",
    ].forEach((row) => term.writeln(row));
    term.write(prompt());
  };

  const runCommand = (input: string) => {
    for (const char of input) {
      term.write(char);
      line.value += char;
    }
    submit();
  };

  const handle = (data: string) => {
    if (data === "\x1b[A") {
      if (history.length === 0) return;
      histIndex = Math.max(0, histIndex - 1);
      replaceLine(history[histIndex] || "");
      return;
    }
    if (data === "\x1b[B") {
      histIndex = Math.min(history.length, histIndex + 1);
      replaceLine(history[histIndex] || "");
      return;
    }
    for (const char of data) {
      if (char === "\r") {
        submit();
      } else if (char === "") {
        if (line.value.length > 0) {
          line.value = line.value.slice(0, -1);
          term.write("\b \b");
        }
      } else if (char === "\x03") {
        term.write("^C\r\n");
        line.value = "";
        term.write(prompt());
      } else if (char === "\x0c") {
        term.clear();
        term.write(prompt() + line.value);
      } else if (char >= " ") {
        line.value += char;
        term.write(char);
      }
    }
  };

  const submit = () => {
    term.write("\r\n");
    const input = line.value;
    if (input.trim()) {
      history.push(input);
      histIndex = history.length;
    }
    const result = exec(input.trim());
    if (result === "CLEAR") {
      term.clear();
    } else if (result === "EXIT") {
      term.writeln(`\r\n${c.gray}connection closed.${c.reset}`);
      window.setTimeout(() => onClose?.(), 600);
      line.value = "";
      return;
    } else {
      result.forEach((row) => term.writeln(row));
    }
    line.value = "";
    term.write(prompt());
  };

  const replaceLine = (next: string) => {
    term.write("\r" + " ".repeat(line.value.length + prompt().length + 8) + "\r");
    line.value = next;
    term.write(prompt() + next);
  };

  const exec = (cmd: string): string[] | "CLEAR" | "EXIT" => {
    if (!cmd) return [];
    if (cmd === "help")
      return [
        `${c.bold}Available demo commands:${c.reset}`,
        `  ${c.purple}ls${c.reset}        list home directory`,
        `  ${c.purple}pwd${c.reset}       print working directory`,
        `  ${c.purple}whoami${c.reset}    print user`,
        `  ${c.purple}date${c.reset}      current date/time`,
        `  ${c.purple}uname -a${c.reset}  kernel info`,
        `  ${c.purple}uptime${c.reset}    boot time + load`,
        `  ${c.purple}docker ps${c.reset} running containers`,
        `  ${c.purple}clear${c.reset}     clear screen`,
        `  ${c.purple}exit${c.reset}      close session`,
        "",
        `${c.gray}If a real SSH/PTY bridge opens successfully, input is sent to that session instead.${c.reset}`,
      ];
    if (cmd.startsWith("ls"))
      return [
        `${c.blue}scripts/${c.reset}  ${c.blue}.config/${c.reset}  README.md`,
        `${c.green}backup-nightly.sh${c.reset}  notes.md  ${c.gray}.ssh/${c.reset}`,
      ];
    if (cmd === "pwd") return [`/home/${user}`];
    if (cmd === "whoami") return [user];
    if (cmd === "hostname") return [hn];
    if (cmd === "date") return [new Date().toString()];
    if (cmd === "uname -a")
      return [`Linux ${hn} 6.8.0-netssh #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`];
    if (cmd === "uptime")
      return [
        " 22:14:31 up 47 days,  3:12,  2 users,  load average: 0.21, 0.18, 0.16",
      ];
    if (cmd === "docker ps")
      return [
        `${c.bold}CONTAINER ID   IMAGE                STATUS          PORTS                    NAMES${c.reset}`,
        `7c2a91b1d4f3   ${c.cyan}nginx:1.27${c.reset}           Up 23 hours     0.0.0.0:443->443/tcp     edge-proxy`,
        `b32a08e91a02   ${c.cyan}postgres:16-alpine${c.reset}   Up 5 days       127.0.0.1:5432->5432/tcp postgres`,
      ];
    if (cmd === "clear") return "CLEAR";
    if (cmd === "exit") return "EXIT";
    if (cmd.startsWith("cd ")) {
      const target = cmd.slice(3).trim();
      cwd.value = target.startsWith("/")
        ? target
        : cwd.value === "~"
          ? `~/${target}`
          : `${cwd.value}/${target}`;
      return [];
    }
    if (cmd === "cd" || cmd === "cd ~") {
      cwd.value = "~";
      return [];
    }
    if (cmd.startsWith("echo ")) return [cmd.slice(5)];
    if (cmd.startsWith("sudo ")) return exec(cmd.slice(5));
    return [
      `${c.gray}-bash: ${c.reset}${cmd.split(" ")[0]}${c.gray}: command not found - try ${c.reset}${c.bold}help${c.reset}`,
    ];
  };

  return { start, handle, runCommand };
}
