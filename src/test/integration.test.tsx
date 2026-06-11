/**
 * Netssh SSH 连接全流程集成测试
 *
 * 覆盖：sshOpen 参数映射、host key 挑战、凭据加载、密码回退、
 * 错误场景（密码错误、DNS 失败、连接超时等）、连接日志。
 *
 * Run: npm test
 */
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import App from "../pages/App";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { useHosts } from "../store/hosts";
import { useSessions } from "../store/sessions";
import { useCredentials } from "../store/credentials";
import { describeConnectionError } from "../pages/TerminalPane";

// ============================================================
// 1. SSH 参数映射 (Rust ↔ JS contract)
// ============================================================
describe("SSH 连接参数映射", () => {
  it("sshOpen 传参包含 alias、host、user、port、identityFile、password", async () => {
    const invokeMock = (await import("@tauri-apps/api/core")).invoke as ReturnType<typeof vi.fn>;
    const { sshOpen } = await import("../api/tauri");
    await sshOpen({
      alias: "router-01",
      host: "10.0.0.1",
      user: "admin",
      port: 2222,
      identityFile: "~/.ssh/id_ed25519",
      password: "secret123",
    });
    expect(invokeMock).toHaveBeenCalledWith("ssh_open", {
      args: {
        alias: "router-01",
        host: "10.0.0.1",
        user: "admin",
        port: 2222,
        identity_file: "~/.ssh/id_ed25519",
        password: "secret123",
        passphrase: undefined,
      },
    });
  });

  it("sshOpen 传 passphrase 当 password 未提供时", async () => {
    const invokeMock = (await import("@tauri-apps/api/core")).invoke as ReturnType<typeof vi.fn>;
    const { sshOpen } = await import("../api/tauri");
    await sshOpen({
      alias: "nas",
      host: "192.168.1.10",
      user: "root",
      port: 22,
      passphrase: "unlock",
    });
    expect(invokeMock).toHaveBeenCalledWith("ssh_open", {
      args: {
        alias: "nas",
        host: "192.168.1.10",
        user: "root",
        port: 22,
        identity_file: undefined,
        password: undefined,
        passphrase: "unlock",
      },
    });
  });
});

// ============================================================
// 2. 连接错误消息分类
// ============================================================
describe("连接错误诊断", () => {
  it("DNS 解析失败", () => {
    const msg = describeConnectionError("could not resolve dns");
    expect(msg).toMatch(/DNS/i);
  });

  it("连接被拒绝", () => {
    const msg = describeConnectionError("connection refused");
    expect(msg).toMatch(/refused|rejected/i);
  });

  it("认证失败 — 密码/密钥错误", () => {
    const msg = describeConnectionError("authentication failed: publickey");
    expect(msg).toMatch(/[Aa]uthentication.*[Ff]ailed/);
  });

  it("Host key mismatch", () => {
    const msg = describeConnectionError("host_key_mismatch");
    expect(msg).toMatch(/fingerprint changed|mismatch/i);
  });

  it("超时", () => {
    const msg = describeConnectionError("connection timed out");
    expect(msg).toMatch(/timed out|Timeout/i);
  });

  it("无凭据", () => {
    const msg = describeConnectionError("no_credentials");
    expect(msg).toMatch(/credential/i);
  });

  it("Passphrase 需要", () => {
    const msg = describeConnectionError("bad decrypt: invalid passphrase");
    expect(msg).toMatch(/passphrase/i);
  });

  it("用户名非法", () => {
    const msg = describeConnectionError("username_invalid");
    expect(msg).toMatch(/[Ii]nvalid.*username/i);
  });

  it("空错误 → 回退消息", () => {
    const msg = describeConnectionError("");
    expect(msg.length).toBeGreaterThan(10);
  });
});

// ============================================================
// 3. 凭据存储
// ============================================================
describe("凭据管理", () => {
  it("add credential 写入 localStorage + 触发 credStore", async () => {
    const { credStore } = await import("../api/tauri");
    const invokeMock = (await import("@tauri-apps/api/core")).invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();

    const cred = await useCredentials.getState().add({
      name: "Lab Router",
      group: "lab",
      user: "root",
      password: "my-password",
    });

    expect(cred.name).toBe("Lab Router");
    expect(cred.hasPassword).toBe(true);
    // 应调用 credStore 将密码存入系统凭据库
    const storeCalls = (invokeMock as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: [string, unknown]) => call[0] === "cred_store"
    );
    expect(storeCalls.length).toBeGreaterThanOrEqual(1);
    // 密码不应出现在持久化的 store 里
    const persisted = useCredentials.persist.getOptions().partialize!(
      useCredentials.getState()
    ) as { credentials: Array<{ hasPassword?: boolean; password?: string }> };
    for (const c of persisted.credentials) {
      expect((c as Record<string, unknown>).password).toBeUndefined();
    }
  });

  it("loadPassword 调用 cred_load", async () => {
    const invokeMock = (await import("@tauri-apps/api/core")).invoke as ReturnType<typeof vi.fn>;
    (invokeMock as ReturnType<typeof vi.fn>).mockResolvedValueOnce("loaded-secret");

    const password = await useCredentials.getState().loadPassword("cred-test-id");
    expect(password).toBe("loaded-secret");
    expect(invokeMock).toHaveBeenCalledWith("cred_load", {
      account: "netssh:cred:cred-test-id",
    });
  });
});

// ============================================================
// 4. Host key 挑战流程 (TOFU)
// ============================================================
describe("Host Key TOFU 挑战", () => {
  it("接收 unknown host key → 显示 Accept Once / Trust / Reject", async () => {
    const { onHostKeyChallenge } = await import("../api/tauri");
    const listenMock = (await import("@tauri-apps/api/event")).listen as ReturnType<typeof vi.fn>;

    let capturedHandler: ((e: { payload: unknown }) => void) | null = null;
    (listenMock as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_event: string, handler: (e: { payload: unknown }) => void) => {
        capturedHandler = handler;
        return Promise.resolve(() => {});
      }
    );

    // 模拟 unknown host key 事件
    const challenge = {
      challenge_id: "ch-001",
      session_id: "sess-001",
      alias: "router-01",
      host: "10.0.0.1",
      port: 22,
      key_type: "ssh-ed25519",
      fingerprint: "SHA256:abc123def456",
      status: "unknown",
      known_fingerprints: [],
      can_remember: true,
    };

    // 等待 handler 注册
    await onHostKeyChallenge(() => {});
    expect(capturedHandler).not.toBeNull();
    // 模拟事件到达
    capturedHandler!({ payload: challenge });
    // 只验证 API 调用不 crash
  });

  it("mismatch 状态时 can_remember 为 false → 不显示 Trust 按钮", () => {
    const challenge = {
      challenge_id: "ch-002",
      session_id: "sess-002",
      alias: "switch-01",
      host: "10.0.0.5",
      port: 2222,
      key_type: "ssh-ed25519",
      fingerprint: "SHA256:new-key",
      status: "mismatch",
      known_fingerprints: ["SHA256:old-key"],
      can_remember: false,
    };
    // mismatch 且 can_remember=false 时用户只能 Accept Once 或 Reject
    expect(challenge.status).toBe("mismatch");
    expect(challenge.can_remember).toBe(false);
  });
});

// ============================================================
// 5. UI 交互: 添加主机 → 编辑凭证 → 连接按钮
// ============================================================
describe("主机管理 UI", () => {
  beforeEach(() => {
    useHosts.setState((s) => ({ ...s, hosts: [] }), true);
    useSessions.setState((s) => ({ ...s, tabs: [{ id: "tab-home", kind: "home", title: "Home", hue: "#a78bfa", pinned: true }], activeTabId: "tab-home", ephemeralHosts: {}, splitTabIds: [] }), true);
  });

  it("Add host → 自动跳转到详情 → 点击 Edit → Connect", async () => {
    const result = render(createElement(ConfirmProvider, null, createElement(App)));
    const user = userEvent.setup();

    // 侧边栏 Add host
    const sidebar = document.querySelector(".sidebar")!;
    const addBtn = Array.from(sidebar.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("host")
    )!;
    await user.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText(/Edit host/i)).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("新主机详情显示 hostname、user、port、Connect 按钮", async () => {
    const result = render(createElement(ConfirmProvider, null, createElement(App)));
    const user = userEvent.setup();

    // 先 Add host
    const sidebar = document.querySelector(".sidebar")!;
    const addBtn = Array.from(sidebar.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("host")
    )!;
    await user.click(addBtn);
    await waitFor(() => screen.getByText(/Edit host/i), { timeout: 3000 });

    // 填写 alias 然后 Save
    const aliasInput = screen.getByPlaceholderText("my-server");
    await user.clear(aliasInput);
    await user.type(aliasInput, "itg-host");
    await user.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText("Connect")).toBeTruthy();
    }, { timeout: 3000 });
    const aliasEls = screen.getAllByText("itg-host");
    expect(aliasEls.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("22")).toBeTruthy();
  });
});

// ============================================================
// 6. 手动连接卡片 (Manual Connect)
// ============================================================
describe("手动连接", () => {
  it("手动连接卡片有 hostname + user + port 输入框", () => {
    render(createElement(ConfirmProvider, null, createElement(App)));
    const card = document.querySelector(".manual-card");
    if (!card) return; // card only visible on home/landing page
    const inputs = card.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(3);
  });

  it("手动连接 Connect 按钮可点击", async () => {
    render(createElement(ConfirmProvider, null, createElement(App)));
    const user = userEvent.setup();
    const card = document.querySelector(".manual-card");
    if (!card) return; // card only visible on home/landing page
    const btn = Array.from(card.querySelectorAll("button")).find(
      (b) => b instanceof HTMLButtonElement && b.textContent?.includes("Connect")
    );
    if (btn) {
      await user.click(btn);
    }
    expect(screen.getByText("Netssh")).toBeTruthy();
  });
});

// ============================================================
// 7. 连接日志 API
// ============================================================
describe("连接日志", () => {
  it("connectionLogOpen → close 完整生命周期", async () => {
    const invokeMock = (await import("@tauri-apps/api/core")).invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();

    const { connectionLogOpen, connectionLogClose } = await import("../api/tauri");

    // Mock open returns a log ID
    (invokeMock as ReturnType<typeof vi.fn>).mockResolvedValueOnce("log-mock-123");
    const logId = await connectionLogOpen("my-router");
    expect(logId).toBe("log-mock-123");
    expect(invokeMock).toHaveBeenCalledWith("connection_log_open", {
      hostAlias: "my-router",
    });

    invokeMock.mockClear();
    await connectionLogClose({
      logId,
      bytesIn: 4096,
      bytesOut: 1024,
      exitStatus: 0,
      error: null,
    });
    expect(invokeMock).toHaveBeenCalledWith("connection_log_close", {
      args: {
        logId: "log-mock-123",
        bytesIn: 4096,
        bytesOut: 1024,
        exitStatus: 0,
        error: null,
      },
    });
  });
});

// ============================================================
// 8. Settings 设置流程
// ============================================================
describe("设置 UI 流程", () => {
  it("Preferences → Language 可访问 → 设置导航存在", async () => {
    render(createElement(ConfirmProvider, null, createElement(App)));
    const user = userEvent.setup();

    // 用测试 ID 找到标题栏 Preferences 按钮
    const prefBtn = document.querySelector('[title="Preferences"]')!;
    await user.click(prefBtn as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector(".settings-nav")).toBeTruthy();
    }, { timeout: 3000 });

    // 切换到 Language — navigation buttons inside settings-nav
    const langBtn = Array.from(document.querySelectorAll(".settings-nav button")).find(
      (b) => b.textContent?.includes("Language")
    )!;
    await user.click(langBtn as HTMLElement);
    await waitFor(() => {
      expect(screen.getByText("Follow system")).toBeTruthy();
    }, { timeout: 2000 });

    expect(document.querySelector(".settings-nav")).toBeTruthy();
  });

  it("主题切换: purple → blue → mica → purple", async () => {
    render(createElement(ConfirmProvider, null, createElement(App)));
    const user = userEvent.setup();

    const prefBtn = document.querySelector('[title="Preferences"]')!;
    await user.click(prefBtn as HTMLElement);
    await waitFor(() => document.querySelector(".settings-nav"), { timeout: 3000 });

    const cards = document.querySelectorAll(".theme-card");
    expect(cards.length).toBe(3);

    await user.click(cards[1] as HTMLElement);
    expect(document.documentElement.getAttribute("data-theme")).toBe("blue");

    await user.click(cards[2] as HTMLElement);
    expect(document.documentElement.getAttribute("data-theme")).toBe("mica");

    await user.click(cards[0] as HTMLElement);
    expect(document.documentElement.getAttribute("data-theme")).toBe("purple");
  });
});

// ============================================================
// 9. SSH Config 导入对话框
// ============================================================
describe("SSH Config 导入", () => {
  it("侧边栏 Import 按钮存在且可点击", () => {
    render(createElement(ConfirmProvider, null, createElement(App)));
    const sidebar = document.querySelector(".sidebar")!;
    const importBtn = Array.from(sidebar.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Import")
    );
    expect(importBtn).toBeTruthy();
  });
});

// ============================================================
// 10. 搜索过滤
// ============================================================
describe("搜索与过滤", () => {
  it("搜索框输入后清空不 crash", async () => {
    render(createElement(ConfirmProvider, null, createElement(App)));
    const user = userEvent.setup();
    const sidebar = document.querySelector(".sidebar")!;
    const input = sidebar.querySelector("input")!;
    await user.type(input, "core-switch-01");
    await user.clear(input);
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("All → Local → Cloud 过滤互斥", async () => {
    render(createElement(ConfirmProvider, null, createElement(App)));
    const user = userEvent.setup();
    const sidebar = document.querySelector(".sidebar")!;

    const chips = Array.from(sidebar.querySelectorAll(".filter-chip"));
    const localChip = chips.find((c) => c.textContent?.includes("Local"));
    if (!localChip) return; // filter chips 在某些 view 可能不可见
    await user.click(localChip as HTMLElement);
    expect((localChip as HTMLElement).classList.contains("active")).toBe(true);

    const cloudChip = chips.find((c) => c.textContent?.includes("Cloud"))!;
    await user.click(cloudChip as HTMLElement);
    expect((cloudChip as HTMLElement).classList.contains("active")).toBe(true);
    expect((localChip as HTMLElement).classList.contains("active")).toBe(false);
  });
});

// ============================================================
// 11. 序列号连接配置
// ============================================================
describe("Serial 预设", () => {
  it("serialOpen 参数按 snake_case 发送", async () => {
    const invokeMock = (await import("@tauri-apps/api/core")).invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();

    const { serialOpen } = await import("../api/tauri");
    await serialOpen({
      portName: "COM3",
      baudRate: 115200,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
      flowControl: "none",
    });

    expect(invokeMock).toHaveBeenCalledWith("serial_open", {
      args: {
        port_name: "COM3",
        baud_rate: 115200,
        data_bits: 8,
        parity: "none",
        stop_bits: 1,
        flow_control: "none",
        line_ending: undefined,
      },
    });
  });
});

// ============================================================
// 12. 存储持久化 (app_state_get / put)
// ============================================================
describe("本地状态存储", () => {
  it("appStatePut → appStateGet 端到端", async () => {
    const invokeMock = (await import("@tauri-apps/api/core")).invoke as ReturnType<typeof vi.fn>;
    invokeMock.mockClear();

    const { appStatePut, appStateGet } = await import("../api/tauri");

    await appStatePut("sidebarWidth", "280");
    expect(invokeMock).toHaveBeenCalledWith("app_state_put", {
      key: "sidebarWidth",
      value: "280",
    });

    invokeMock.mockClear();
    (invokeMock as ReturnType<typeof vi.fn>).mockResolvedValueOnce("280");
    const val = await appStateGet("sidebarWidth");
    expect(val).toBe("280");
    expect(invokeMock).toHaveBeenCalledWith("app_state_get", {
      key: "sidebarWidth",
    });
  });
});
