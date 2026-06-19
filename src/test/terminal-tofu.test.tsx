import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { TerminalPane } from "../pages/TerminalPane";
import type { Host } from "../config/types";

vi.mock("../utils/liveSessions", () => ({
  registerLiveSession: vi.fn(),
  getLiveSession: vi.fn(() => undefined),
  removeLiveSession: vi.fn(),
  resetLiveSessions: vi.fn(),
}));

const host: Host = {
  id: "host-tofu",
  alias: "switch-core",
  hostname: "192.168.10.2",
  user: "admin",
  port: 22,
  identityFile: "C:\\Users\\lawrence\\.ssh\\id_ed25519",
  group: "lab",
  status: "off",
};

interface TauriTestGlobal {
  __netsshEmitTauriEvent: (event: string, payload: unknown) => void;
  __netsshClearTauriEvents: () => void;
}

function emitTauriEvent(event: string, payload: unknown) {
  (globalThis as typeof globalThis & TauriTestGlobal).__netsshEmitTauriEvent(event, payload);
}

describe("TerminalPane TOFU host key challenge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & TauriTestGlobal).__netsshClearTauriEvents();
  });

  it("subscribes before handling unknown host key challenge and can trust it", async () => {
    const user = userEvent.setup();
    render(<TerminalPane lang="en" host={host} />);

    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith("ssh:host-key-challenge", expect.any(Function));
    });

    act(() => emitTauriEvent("ssh:host-key-challenge", {
      challenge_id: "challenge-1",
      session_id: "mock-ssh-id",
      alias: host.alias,
      host: host.hostname,
      port: host.port,
      key_type: "ssh-ed25519",
      fingerprint: "SHA256:abc123",
      status: "unknown",
      known_fingerprints: [],
      can_remember: true,
    }));

    expect(await screen.findByText("New Host Key")).toBeTruthy();
    expect(screen.getByText(/entry for 192\.168\.10\.2, port 22/)).toBeTruthy();
    expect(screen.getByText("SHA256:abc123")).toBeTruthy();
    expect(screen.getAllByText("Host key pending").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Connected")).toBeFalsy();

    expect(screen.queryByRole("button", { name: "Accept once" })).toBeFalsy();
    await user.click(screen.getByText("Accept and Save"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("ssh_host_key_decide", {
        challengeId: "challenge-1",
        decision: "accept_and_remember",
      });
    });
  });

  it("shows mismatch as dangerous without any accept action", async () => {
    const user = userEvent.setup();
    render(<TerminalPane lang="en" host={host} />);

    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith("ssh:host-key-challenge", expect.any(Function));
    });

    act(() => emitTauriEvent("ssh:host-key-challenge", {
      challenge_id: "challenge-2",
      session_id: "mock-ssh-id",
      alias: host.alias,
      host: host.hostname,
      port: host.port,
      key_type: "ssh-ed25519",
      fingerprint: "SHA256:new",
      status: "mismatch",
      known_fingerprints: ["SHA256:old"],
      can_remember: false,
    }));

    expect(await screen.findByText("Host key changed")).toBeTruthy();
    expect(screen.getAllByText("Host key blocked").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Connected")).toBeFalsy();
    expect(screen.queryByRole("button", { name: "Accept and Save" })).toBeFalsy();
    expect(screen.queryByRole("button", { name: "Accept once" })).toBeFalsy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    const forget = screen.getByRole("button", { name: "Forget saved key and retry" });
    expect(forget).toBeTruthy();

    await user.click(forget);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("ssh_host_key_decide", {
        challengeId: "challenge-2",
        decision: "reject",
      });
      expect(invoke).toHaveBeenCalledWith("ssh_forget_trusted_host_key", {
        host: host.hostname,
        port: host.port,
      });
      expect(invoke).toHaveBeenCalledWith("ssh_open", {
        args: expect.objectContaining({
          host: host.hostname,
          port: host.port,
          skip_open_ssh_known_hosts: true,
        }),
      });
    });

    act(() => emitTauriEvent("ssh:host-key-challenge", {
      challenge_id: "challenge-3",
      session_id: "mock-ssh-id",
      alias: host.alias,
      host: host.hostname,
      port: host.port,
      key_type: "ssh-ed25519",
      fingerprint: "SHA256:new",
      status: "unknown",
      known_fingerprints: [],
      can_remember: true,
    }));

    expect(await screen.findByText("New Host Key")).toBeTruthy();
    await user.click(screen.getByText("Accept and Save"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("ssh_host_key_decide", {
        challengeId: "challenge-3",
        decision: "accept_and_remember",
      });
    });
  });

  it("retries and reapplies accept-and-save when the host key challenge expired", async () => {
    const user = userEvent.setup();
    const invokeMock = vi.mocked(invoke);
    const defaultInvoke = invokeMock.getMockImplementation();
    invokeMock.mockImplementation((cmd: string, args?: unknown) => {
      if (
        cmd === "ssh_host_key_decide" &&
        args &&
        typeof args === "object" &&
        "challengeId" in args &&
        args.challengeId === "challenge-expired"
      ) {
        return Promise.reject(new Error("host_key_challenge_not_found"));
      }
      return defaultInvoke ? defaultInvoke(cmd, args) : Promise.resolve(null);
    });

    render(<TerminalPane lang="en" host={host} />);

    try {
      await waitFor(() => {
        expect(listen).toHaveBeenCalledWith("ssh:host-key-challenge", expect.any(Function));
      });

      act(() => emitTauriEvent("ssh:host-key-challenge", {
        challenge_id: "challenge-expired",
        session_id: "mock-ssh-id",
        alias: host.alias,
        host: host.hostname,
        port: host.port,
        key_type: "ssh-ed25519",
        fingerprint: "SHA256:stable",
        status: "unknown",
        known_fingerprints: [],
        can_remember: true,
      }));

      expect(await screen.findByText("New Host Key")).toBeTruthy();
      await user.click(screen.getByText("Accept and Save"));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("ssh_open", {
          args: expect.objectContaining({
            host: host.hostname,
            port: host.port,
            skip_open_ssh_known_hosts: true,
          }),
        });
      });

      act(() => emitTauriEvent("ssh:host-key-challenge", {
        challenge_id: "challenge-retry",
        session_id: "mock-ssh-id",
        alias: host.alias,
        host: host.hostname,
        port: host.port,
        key_type: "ssh-ed25519",
        fingerprint: "SHA256:stable",
        status: "unknown",
        known_fingerprints: [],
        can_remember: true,
      }));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("ssh_host_key_decide", {
          challengeId: "challenge-retry",
          decision: "accept_and_remember",
        });
      });
    } finally {
      if (defaultInvoke) invokeMock.mockImplementation(defaultInvoke);
    }
  });
});
