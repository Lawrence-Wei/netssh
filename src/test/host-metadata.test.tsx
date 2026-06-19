import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "../layouts/Sidebar";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { useHosts } from "../store/hosts";
import type { Group, Host } from "../config/types";

const groups: Group[] = [{ id: "unassigned", name: "Unassigned", color: "#897e6e" }];

function host(id: string, alias: string, patch: Partial<Host> = {}): Host {
  return {
    id,
    alias,
    hostname: `${id}.example.com`,
    user: "root",
    port: 22,
    group: "unassigned",
    status: "off",
    latency: null,
    ...patch,
  };
}

function renderSidebar(hosts: Host[]) {
  return render(
    <ConfirmProvider>
      <Sidebar
        lang="en"
        hosts={hosts}
        groups={groups}
        onPickHost={vi.fn()}
        onDoubleClickHost={vi.fn()}
        onContextMenu={vi.fn()}
        onOpenImport={vi.fn()}
        onAddGroup={vi.fn()}
        onRenameGroup={vi.fn()}
        onRemoveGroup={vi.fn()}
        onMoveHostToGroup={vi.fn()}
        onAddHostQuick={vi.fn()}
        onRemoveHosts={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    </ConfirmProvider>
  );
}

describe("host metadata", () => {
  const initialState = useHosts.getState();

  beforeEach(() => {
    useHosts.setState(initialState, true);
  });

  it("stores favorites and last connection timestamps on hosts", () => {
    const created = useHosts.getState().addHost({
      alias: "core-sw",
      hostname: "10.0.0.2",
      user: "admin",
      port: 22,
      group: "unassigned",
    });

    useHosts.getState().toggleFavorite(created.id);
    useHosts.getState().markConnected(created.id, 1_800_000_000_000);

    const updated = useHosts.getState().hosts.find((item) => item.id === created.id);
    expect(updated?.favorite).toBe(true);
    expect(updated?.pinned).toBe(true);
    expect(updated?.lastConnectedAt).toBe(1_800_000_000_000);
    expect(updated?.status).toBe("ok");
  });

  it("normalizes uppercase unassigned groups during import and persistence", () => {
    const created = useHosts.getState().importHosts([
      {
        alias: "prgw-lan",
        hostname: "192.168.77.1",
        user: "root",
        port: 22,
        group: "UNASSIGNED",
      },
    ]);

    expect(created).toHaveLength(1);
    expect(created[0].group).toBe("unassigned");
    expect(useHosts.getState().groups.filter((group) => group.id === "unassigned")).toHaveLength(1);
    expect(useHosts.getState().groups.some((group) => group.name === "UNASSIGNED")).toBe(false);

    useHosts.setState((state) => ({
      ...state,
      hosts: [
        host("legacy", "legacy-router", { group: "unassigned-legacy" }),
      ],
      groups: [
        { id: "unassigned", name: "Unassigned", color: "#897e6e" },
        { id: "unassigned-legacy", name: "UNASSIGNED", color: "#776655" },
      ],
    }), true);

    const persisted = useHosts.persist.getOptions().partialize?.(useHosts.getState()) as {
      hosts: Host[];
      groups: Group[];
    };
    expect(persisted.groups).toEqual([{ id: "unassigned", name: "Unassigned", color: "#897e6e" }]);
    expect(persisted.hosts[0].group).toBe("unassigned");
  });

  it("filters sidebar hosts by favorites and recent connections", async () => {
    renderSidebar([
      host("favorite", "favorite-sw", { favorite: true }),
      host("recent", "recent-fw", { lastConnectedAt: Date.now() - 120_000 }),
      host("plain", "plain-nas"),
    ]);

    await userEvent.click(screen.getByText("Favorites"));
    expect(within(document.querySelector(".sidebar")!).getByText("favorite-sw")).toBeTruthy();
    expect(within(document.querySelector(".sidebar")!).queryByText("plain-nas")).toBeFalsy();

    await userEvent.click(screen.getByText("Recent"));
    expect(within(document.querySelector(".sidebar")!).getByText("recent-fw")).toBeTruthy();
    expect(within(document.querySelector(".sidebar")!).queryByText("plain-nas")).toBeFalsy();
  });
});
