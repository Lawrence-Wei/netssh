import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { HostEditorFull } from "../components/HostForm";
import { useIdentities } from "../store/identities";
import type { Group, Host } from "../config/types";

const groups: Group[] = [{ id: "unassigned", name: "Unassigned", color: "#897e6e" }];
const invokeMock = vi.mocked(invoke);
const baseInvoke = invokeMock.getMockImplementation();
const scannedSerialPorts = [
  {
    port_name: "COM3",
    transport: "usb",
    manufacturer: "FTDI",
    product: "USB Serial Converter",
    serial_number: "FT123",
  },
  {
    port_name: "COM4",
    transport: "usb",
    manufacturer: "WCH",
    product: "USB-SERIAL CH340",
    serial_number: "CH340-1",
  },
];

function buildHost(patch: Partial<Host> = {}): Host {
  return {
    id: "host-1",
    alias: "core-sw",
    hostname: "10.0.0.5",
    user: "admin",
    port: 22,
    group: "unassigned",
    status: "off",
    latency: null,
    ...patch,
  };
}

describe("HostEditorFull connection type switching", () => {
  const identitiesState = useIdentities.getState();

  beforeEach(() => {
    useIdentities.setState(identitiesState, true);
    invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "serial_list_ports") return Promise.resolve(scannedSerialPorts);
      return baseInvoke?.(cmd, args) ?? Promise.resolve(null);
    });
  });

  it("switches to serial fields and saves a normalized serial profile", async () => {
    const onSave = vi.fn();
    render(
      <HostEditorFull
        lang="en"
        host={buildHost()}
        groups={groups}
        onSave={onSave}
        onCancel={vi.fn()}
        onRemove={vi.fn()}
        onAddGroup={vi.fn((name: string) => ({ id: name, name, color: "#000" }))}
      />
    );

    expect(screen.getByRole("button", { name: /SSH login/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Serial console/i })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /Serial console/i }));

    expect(screen.queryByLabelText("Hostname")).toBeNull();
    expect(screen.getByText("Console login settings")).toBeTruthy();
    const serialPort = screen.getByLabelText("COM port") as HTMLSelectElement;
    await waitFor(() => {
      expect(Array.from(serialPort.options).some((option) => option.value === "COM4" && option.textContent?.includes("CH340"))).toBe(true);
    });
    await userEvent.selectOptions(serialPort, "COM4");
    const baudRate = screen.getByLabelText("Baud rate") as HTMLInputElement;
    expect(baudRate.value).toBe("9600");
    expect((screen.getByLabelText("Data bits") as HTMLSelectElement).value).toBe("8");
    expect((screen.getByLabelText("Parity") as HTMLSelectElement).value).toBe("none");
    expect((screen.getByLabelText("Stop bits") as HTMLSelectElement).value).toBe("1");
    expect((screen.getByLabelText("Flow control") as HTMLSelectElement).value).toBe("none");
    expect((screen.getByLabelText("Line ending") as HTMLSelectElement).value).toBe("crlf");
    await userEvent.selectOptions(screen.getByLabelText("Serial preset"), "openwrt-115200-8n1");
    expect((screen.getByLabelText("Baud rate") as HTMLInputElement).value).toBe("115200");

    await userEvent.click(screen.getByText("Save"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionType: "serial",
          serialProfile: expect.objectContaining({
            portName: "COM4",
            baudRate: 115200,
            dataBits: 8,
            parity: "none",
            stopBits: 1,
            flowControl: "none",
            lineEnding: "lf",
            presetId: "openwrt-115200-8n1",
          }),
        })
      );
  });

  it("restores ssh fields when switched back from a serial host", async () => {
    render(
      <HostEditorFull
        lang="en"
        host={buildHost({
          connectionType: "serial",
          serialProfile: {
            portName: "COM7",
            baudRate: 115200,
            dataBits: 8,
            parity: "none",
            stopBits: 1,
            flowControl: "none",
            lineEnding: "lf",
          },
        })}
        groups={groups}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onRemove={vi.fn()}
        onAddGroup={vi.fn((name: string) => ({ id: name, name, color: "#000" }))}
      />
    );

    expect((screen.getByLabelText("COM port") as HTMLSelectElement).value).toBe("__custom__");
    expect((screen.getByLabelText("Manual COM port") as HTMLInputElement).value).toBe("COM7");
    await userEvent.click(screen.getByRole("button", { name: /SSH login/i }));

    expect((screen.getByLabelText("Hostname") as HTMLInputElement).value).toBe("10.0.0.5");
    expect((screen.getByLabelText("User") as HTMLInputElement).value).toBe("admin");
    expect(screen.queryByLabelText("COM port")).toBeNull();
  });

  it("saves a single-hop jump host and excludes invalid jump candidates", async () => {
    const onSave = vi.fn();
    const target = buildHost({ id: "target", alias: "target" });
    const jump = buildHost({ id: "jump", alias: "bastion", hostname: "10.0.0.10", identityFile: "C:\\keys\\jump" });
    const chained = buildHost({ id: "chained", alias: "chained", hostname: "10.0.0.11", jumpHostId: "jump" });
    render(
      <HostEditorFull
        lang="en"
        host={target}
        hosts={[target, jump, chained]}
        groups={groups}
        onSave={onSave}
        onCancel={vi.fn()}
        onRemove={vi.fn()}
        onAddGroup={vi.fn((name: string) => ({ id: name, name, color: "#000" }))}
      />
    );

    const jumpSelect = screen.getByLabelText("Jump host") as HTMLSelectElement;
    const optionLabels = Array.from(jumpSelect.options).map((option) => option.textContent || "");
    expect(optionLabels.some((label) => label.includes("bastion"))).toBe(true);
    expect(optionLabels.some((label) => label.includes("target"))).toBe(false);
    expect(optionLabels.some((label) => label.includes("chained"))).toBe(false);

    await userEvent.selectOptions(jumpSelect, jump.id);
    await userEvent.click(screen.getByText("Save"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ jumpHostId: jump.id }));
  });

  it("offers Huawei switch as a device type override", async () => {
    const onSave = vi.fn();
    render(
      <HostEditorFull
        lang="zh"
        host={buildHost({ alias: "switch" })}
        groups={groups}
        onSave={onSave}
        onCancel={vi.fn()}
        onRemove={vi.fn()}
        onAddGroup={vi.fn((name: string) => ({ id: name, name, color: "#000" }))}
      />
    );

    const deviceTypeSelect = screen
      .getAllByLabelText("设备类型")
      .find((element) => element.tagName === "SELECT") as HTMLSelectElement;
    expect(deviceTypeSelect).toBeTruthy();
    expect(Array.from(deviceTypeSelect.options).some((option) => option.value === "huawei" && option.textContent === "华为交换机")).toBe(true);

    await userEvent.selectOptions(deviceTypeSelect, "huawei");
    await userEvent.click(screen.getByText("保存"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ iconOverride: "huawei" }));
  });

  it("offers ASUS router as a device type override", async () => {
    const onSave = vi.fn();
    render(
      <HostEditorFull
        lang="zh"
        host={buildHost({ alias: "asus-router" })}
        groups={groups}
        onSave={onSave}
        onCancel={vi.fn()}
        onRemove={vi.fn()}
        onAddGroup={vi.fn((name: string) => ({ id: name, name, color: "#000" }))}
      />
    );

    const deviceTypeSelect = screen
      .getAllByLabelText("设备类型")
      .find((element) => element.tagName === "SELECT") as HTMLSelectElement;
    expect(deviceTypeSelect).toBeTruthy();
    expect(Array.from(deviceTypeSelect.options).some((option) => option.value === "asus" && option.textContent === "华硕路由器")).toBe(true);

    await userEvent.selectOptions(deviceTypeSelect, "asus");
    await userEvent.click(screen.getByText("保存"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ iconOverride: "asus" }));
  });

  it("offers Cisco switch as a device type override", async () => {
    const onSave = vi.fn();
    render(
      <HostEditorFull
        lang="zh"
        host={buildHost({ alias: "switch" })}
        groups={groups}
        onSave={onSave}
        onCancel={vi.fn()}
        onRemove={vi.fn()}
        onAddGroup={vi.fn((name: string) => ({ id: name, name, color: "#000" }))}
      />
    );

    const deviceTypeSelect = screen
      .getAllByLabelText("设备类型")
      .find((element) => element.tagName === "SELECT") as HTMLSelectElement;
    expect(deviceTypeSelect).toBeTruthy();
    expect(Array.from(deviceTypeSelect.options).some((option) => option.value === "cisco" && option.textContent === "思科交换机")).toBe(true);

    await userEvent.selectOptions(deviceTypeSelect, "cisco");
    await userEvent.click(screen.getByText("保存"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ iconOverride: "cisco" }));
  });
});

