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
    });

    expect(invokeSpy).toHaveBeenCalledWith("ssh_open", {
      args: {
        alias: "lab-switch-1",
        host: "10.1.20.5",
        user: "ops",
        port: 2222,
        identity_file: "/home/ops/.ssh/id_rsa",
        password: "P@ssw0rd",
        passphrase: "secret",
      },
    });
  });
});

