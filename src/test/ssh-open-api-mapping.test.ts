import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { sshOpen } from "../api/tauri";

describe("sshOpen payload mapping", () => {
  it("maps frontend host/user/port/password into Rust invoke arguments", async () => {
    const invokeSpy = vi.mocked(invoke);

    await sshOpen({
      alias: "lab-switch-1",
      host: "10.1.20.5",
      user: "ops",
      port: 2222,
      identityFile: "/home/ops/.ssh/id_rsa",
      password: "P@ssw0rd",
      passphrase: "secret",
      terminalLocale: "en_US.UTF-8",
      terminalTimezone: "UTC",
      deviceHint: "huawei",
    });

    expect(invokeSpy).toHaveBeenCalledWith("ssh_open", expect.objectContaining({
      args: expect.objectContaining({
        alias: "lab-switch-1",
        host: "10.1.20.5",
        user: "ops",
        port: 2222,
        identity_file: "/home/ops/.ssh/id_rsa",
        password: "P@ssw0rd",
        passphrase: "secret",
        terminal_locale: "en_US.UTF-8",
        terminal_timezone: "UTC",
        device_hint: "huawei",
      }),
    }));
  });
});

