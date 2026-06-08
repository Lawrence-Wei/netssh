import { describe, expect, it } from "vitest";
import { describeConnectionError } from "../pages/TerminalPane";

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
  ])("classifies %s", (raw, expected) => {
    expect(describeConnectionError(new Error(raw))).toContain(expected);
  });
});
