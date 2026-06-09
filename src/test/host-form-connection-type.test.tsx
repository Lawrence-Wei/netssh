import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HostEditorFull } from "../components/HostForm";
import { useIdentities } from "../store/identities";
import type { Group, Host } from "../config/types";

const groups: Group[] = [{ id: "unassigned", name: "Unassigned", color: "#897e6e" }];

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

    await userEvent.selectOptions(screen.getByLabelText("Connection type"), "serial");

    expect(screen.queryByLabelText("Hostname")).toBeNull();
    const serialPort = screen.getByLabelText("COM port");
    await userEvent.type(serialPort, "COM9");
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
            portName: "COM9",
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

    expect((screen.getByLabelText("COM port") as HTMLInputElement).value).toBe("COM7");
    await userEvent.selectOptions(screen.getByLabelText("Connection type"), "ssh");

    expect((screen.getByLabelText("Hostname") as HTMLInputElement).value).toBe("10.0.0.5");
    expect((screen.getByLabelText("User") as HTMLInputElement).value).toBe("admin");
    expect(screen.queryByLabelText("COM port")).toBeNull();
  });
});

