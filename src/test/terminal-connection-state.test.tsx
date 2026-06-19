import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { TerminalPane } from "../pages/TerminalPane";
import type { Host } from "../config/types";

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

describe("TerminalPane connection state", () => {
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
});
