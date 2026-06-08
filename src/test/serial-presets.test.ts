import { describe, expect, it } from "vitest";
import { SERIAL_PRESETS } from "../config/defaults";
import type { Host, SerialProfile } from "../config/types";

describe("serial console presets", () => {
  it("defines common 8N1 console presets for network and homelab devices", () => {
    const ids = SERIAL_PRESETS.map((preset) => preset.id);
    expect(ids).toEqual([
      "cisco-9600-8n1",
      "huawei-9600-8n1",
      "h3c-9600-8n1",
      "openwrt-115200-8n1",
      "generic-9600-8n1",
    ]);
    expect(SERIAL_PRESETS.every((preset) => preset.profile.dataBits === 8)).toBe(true);
    expect(SERIAL_PRESETS.every((preset) => preset.profile.parity === "none")).toBe(true);
    expect(SERIAL_PRESETS.every((preset) => preset.profile.stopBits === 1)).toBe(true);
  });

  it("allows a host to carry a local serial profile", () => {
    const profile: SerialProfile = {
      portName: "COM3",
      baudRate: 115200,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
      flowControl: "none",
      lineEnding: "lf",
      presetId: "openwrt-115200-8n1",
    };
    const host: Host = {
      id: "serial-openwrt",
      alias: "bench-openwrt",
      hostname: "local-console",
      user: "root",
      port: 22,
      group: "unassigned",
      connectionType: "serial",
      serialProfile: profile,
    };

    expect(host.serialProfile?.portName).toBe("COM3");
    expect(host.serialProfile?.baudRate).toBe(115200);
  });
});
