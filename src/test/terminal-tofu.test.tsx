import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { TerminalPane } from "../pages/TerminalPane";
import type { Host } from "../config/types";

const host: Host = {
  id: "host-tofu",
  alias: "switch-core",
  hostname: "192.168.10.2",
  user: "admin",
  port: 22,
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

    expect(await screen.findByText("Trust this SSH host?")).toBeTruthy();
    expect(screen.getByText("SHA256:abc123")).toBeTruthy();

    await user.click(screen.getByText("Trust and connect"));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("ssh_host_key_decide", {
        challengeId: "challenge-1",
        decision: "accept_and_remember",
      });
    });
  });

  it("shows mismatch as dangerous without trust-and-remember but has accept-once", async () => {
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
    expect(screen.queryByRole("button", { name: "Trust and connect" })).toBeFalsy();
    expect(screen.getByRole("button", { name: "Accept once" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel connection" })).toBeTruthy();
  });
});
