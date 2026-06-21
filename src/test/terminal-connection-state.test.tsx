import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { TerminalPane } from "../pages/TerminalPane";
import type { Host } from "../config/types";
import { useCredentials } from "../store/credentials";
import { resetLiveSessions } from "../utils/liveSessions";

const host: Host = {
  id: "host-pending",
  alias: "srv",
  hostname: "192.168.77.234",
  user: "lawrence",
  port: 22,
  group: "lab",
  status: "off",
};

const keyHost: Host = {
  ...host,
  identityFile: "C:\\Users\\lawrence\\.ssh\\id_ed25519",
};

const defaultInvoke = vi.mocked(invoke).getMockImplementation();

describe("TerminalPane connection state", () => {
  beforeEach(() => {
    cleanup();
    if (defaultInvoke) vi.mocked(invoke).mockImplementation(defaultInvoke);
    vi.mocked(invoke).mockClear();
    useCredentials.setState({ credentials: [] });
    resetLiveSessions();
    window.localStorage.clear();
  });

  it("shows Connecting while ssh_open is still pending", async () => {
    const invokeMock = vi.mocked(invoke);
    const defaultInvoke = invokeMock.getMockImplementation();

    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "ssh_open") return new Promise(() => {});
      return defaultInvoke ? defaultInvoke(cmd, args) : Promise.resolve(null);
    });

    try {
      render(<TerminalPane lang="en" host={keyHost} />);

      await waitFor(() => {
        expect(screen.getAllByText("Connecting").length).toBeGreaterThanOrEqual(1);
      });
      expect(screen.queryByText("Connected")).toBeFalsy();
    } finally {
      if (defaultInvoke) invokeMock.mockImplementation(defaultInvoke);
    }
  });

  it("passes a Huawei device hint to SSH open", async () => {
    const invokeMock = vi.mocked(invoke);
    const defaultInvoke = invokeMock.getMockImplementation();
    if (defaultInvoke) invokeMock.mockImplementation(defaultInvoke);
    invokeMock.mockClear();

    render(<TerminalPane lang="en" host={{ ...keyHost, iconOverride: "huawei" }} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("ssh_open", {
        args: expect.objectContaining({
          host: keyHost.hostname,
          device_hint: "huawei",
        }),
      });
    });
  });

  it("passes single-hop jump args to SSH open", async () => {
    const invokeMock = vi.mocked(invoke);
    const defaultInvoke = invokeMock.getMockImplementation();
    if (defaultInvoke) invokeMock.mockImplementation(defaultInvoke);
    invokeMock.mockClear();
    const jumpHost: Host = {
      ...keyHost,
      id: "jump-1",
      alias: "bastion",
      hostname: "10.0.0.10",
      identityFile: "C:\\Users\\lawrence\\.ssh\\jump_ed25519",
    };
    const target: Host = {
      ...keyHost,
      id: "target-1",
      alias: "behind-bastion",
      hostname: "10.0.0.20",
      jumpHostId: jumpHost.id,
    };

    render(<TerminalPane lang="en" host={target} hosts={[target, jumpHost]} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("ssh_open", {
        args: expect.objectContaining({
          host: target.hostname,
          identity_file: target.identityFile,
          jump: expect.objectContaining({
            alias: jumpHost.alias,
            host: jumpHost.hostname,
            user: jumpHost.user,
            identity_file: jumpHost.identityFile,
          }),
        }),
      });
    });
  });

  it("blocks jump sessions when the jump host has no usable credentials", async () => {
    const invokeMock = vi.mocked(invoke);
    const defaultInvoke = invokeMock.getMockImplementation();
    if (defaultInvoke) invokeMock.mockImplementation(defaultInvoke);
    invokeMock.mockClear();
    const jumpHost: Host = {
      ...host,
      id: "jump-empty",
      alias: "empty-bastion",
      hostname: "10.0.0.30",
    };
    const target: Host = {
      ...keyHost,
      id: "target-blocked",
      alias: "blocked-target",
      hostname: "10.0.0.31",
      jumpHostId: jumpHost.id,
    };

    render(<TerminalPane lang="en" host={target} hosts={[target, jumpHost]} />);

    await waitFor(() => {
      expect(screen.getByText(/Jump host needs credentials/i)).toBeTruthy();
    });
    expect(invokeMock.mock.calls.some(([cmd]) => cmd === "ssh_open")).toBe(false);
    expect(screen.queryByPlaceholderText("Enter password")).toBeNull();
  });

  it("prompts for a password before opening SSH when no credential or key is available", async () => {
    const invokeMock = vi.mocked(invoke);
    const defaultInvoke = invokeMock.getMockImplementation();
    if (defaultInvoke) invokeMock.mockImplementation(defaultInvoke);
    invokeMock.mockClear();

    render(<TerminalPane lang="en" host={host} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Enter password")).toBeTruthy();
    });
    expect(screen.getByText(/Password required/i)).toBeTruthy();
    expect(invokeMock.mock.calls.some(([cmd]) => cmd === "ssh_open")).toBe(false);
  });

  it("remembers a retry password in the credential vault and binds it to the host", async () => {
    const invokeMock = vi.mocked(invoke);
    const defaultInvoke = invokeMock.getMockImplementation();
    const secrets = new Map<string, string>();
    invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "cred_store") {
        secrets.set(String(args?.account), String(args?.secret));
        return Promise.resolve();
      }
      if (cmd === "cred_load") {
        return Promise.resolve(secrets.get(String(args?.account)) || "");
      }
      if (cmd === "cred_delete") {
        secrets.delete(String(args?.account));
        return Promise.resolve();
      }
      return defaultInvoke ? defaultInvoke(cmd, args) : Promise.resolve(null);
    });

    try {
      const onRememberCredential = vi.fn();
      const user = userEvent.setup();

      render(<TerminalPane lang="en" host={host} onRememberCredential={onRememberCredential} />);

      const passwordInput = await screen.findByPlaceholderText("Enter password");
      const rememberToggle = screen.getByLabelText("Remember password on this device") as HTMLInputElement;
      expect(rememberToggle.checked).toBe(true);

      await user.type(passwordInput, "cisco-secret");
      await user.click(screen.getByRole("button", { name: /Retry with password/i }));

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith("ssh_open", {
          args: expect.objectContaining({
            host: host.hostname,
            user: host.user,
            password: "cisco-secret",
          }),
        });
      });
      await waitFor(() => {
        expect(onRememberCredential).toHaveBeenCalledWith(host.id, expect.stringMatching(/^cred-/));
      });

      const [credential] = useCredentials.getState().credentials;
      expect(credential).toEqual(expect.objectContaining({
        name: host.alias,
        user: host.user,
        hasPassword: true,
      }));
      expect(JSON.stringify(useCredentials.getState().credentials)).not.toContain("cisco-secret");
      expect(window.localStorage.getItem("netssh.credentials") || "").not.toContain("cisco-secret");
      expect(Array.from(secrets.values())).toContain("cisco-secret");
    } finally {
      if (defaultInvoke) invokeMock.mockImplementation(defaultInvoke);
    }
  });

  it("reuses a saved password for the same user host and port without prompting again", async () => {
    const invokeMock = vi.mocked(invoke);
    const defaultInvoke = invokeMock.getMockImplementation();
    const secrets = new Map<string, string>();
    invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "cred_store") {
        secrets.set(String(args?.account), String(args?.secret));
        return Promise.resolve();
      }
      if (cmd === "cred_load") {
        return Promise.resolve(secrets.get(String(args?.account)) || "");
      }
      if (cmd === "cred_delete") {
        secrets.delete(String(args?.account));
        return Promise.resolve();
      }
      return defaultInvoke ? defaultInvoke(cmd, args) : Promise.resolve(null);
    });

    try {
      await useCredentials.getState().add({
        name: "lab-cisco",
        group: "cisco",
        user: host.user,
        notes: host.hostname,
        tags: ["cisco", "switch"],
        password: "remembered-secret",
      });
      invokeMock.mockClear();

      render(<TerminalPane lang="en" host={{ ...host, id: "host-reimported", alias: "192.168.77.2" }} />);

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith("ssh_open", {
          args: expect.objectContaining({
            host: host.hostname,
            user: host.user,
            password: "remembered-secret",
          }),
        });
      });
      expect(screen.queryByPlaceholderText("Enter password")).toBeNull();
    } finally {
      if (defaultInvoke) invokeMock.mockImplementation(defaultInvoke);
    }
  });
});
