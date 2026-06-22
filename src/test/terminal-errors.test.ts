import { describe, expect, it } from "vitest";
import { describeConnectionError, isPasswordRecoverableError } from "../pages/TerminalPane";

describe("describeConnectionError", () => {
  it.each([
    [
      "failed to lookup address information: Name or service not known",
      "DNS resolution failed",
    ],
    [
      "No route to host (os error 113)",
      "Route unavailable",
    ],
    [
      "connect ECONNREFUSED 10.0.0.2:2222",
      "SSH service or port rejected",
    ],
    [
      "Permission denied (publickey,password)",
      "Authentication failed",
    ],
    [
      "encrypted private key: invalid passphrase",
      "SSH key passphrase required",
    ],
    [
      "key_load_failed",
      "SSH key could not be loaded",
    ],
    [
      "password_required: SSH key was not accepted and no password is available",
      "Password required",
    ],
    [
      "auth_timeout: password authentication timed out for lawrence@192.168.100.253",
      "Authentication timed out",
    ],
    [
      "network_unreachable: No common algorithm",
      "SSH algorithm negotiation failed",
    ],
    [
      "kex_no_common_algorithm: server offered [diffie-hellman-group-exchange-sha1,diffie-hellman-group14-sha1]",
      "SSH algorithm negotiation failed",
    ],
    [
      "Unable to negotiate: no matching MAC found. Their offer: hmac-sha1,hmac-sha1-96",
      "SSH algorithm negotiation failed",
    ],
  ])("classifies %s", (raw, expected) => {
    expect(describeConnectionError(new Error(raw))).toContain(expected);
  });

  it("localizes password-required diagnostics", () => {
    expect(describeConnectionError("password_required", "zh")).toContain("需要密码");
  });

  it("treats authentication timeout as password-recoverable", () => {
    expect(isPasswordRecoverableError("auth_timeout: keyboard-interactive authentication timed out")).toBe(true);
  });
});
