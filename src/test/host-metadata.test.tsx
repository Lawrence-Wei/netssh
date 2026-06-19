import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "../layouts/Sidebar";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { useHosts } from "../store/hosts";
import { displayGroupName, groupHostsForDisplay } from "../utils/groups";
import { deployScopeLabel } from "../utils/deployScope";
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

function renderSidebarWithGroups(hosts: Host[], sidebarGroups: Group[], lang: "en" | "zh" = "en") {
  return render(
    <ConfirmProvider>
      <Sidebar
        lang={lang}
        hosts={hosts}
        groups={sidebarGroups}
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

  it("hides the empty built-in unassigned group in the sidebar", () => {
    renderSidebar([]);
    expect(within(document.querySelector(".sidebar")!).queryByText("Unassigned")).toBeFalsy();
    expect(document.querySelector(".host-group")).toBeFalsy();
  });

  it("canonicalizes damaged site labels without changing the preferred site buckets", () => {
    const damagedGroups: Group[] = [
      { id: "shanghai", name: "SHANGHAI / ????", color: "#8f7a65" },
      { id: "pr-e20c", name: "PR / E20C ??", color: "#7f7395" },
      { id: "wx", name: "WX / ????", color: "#6f7f95" },
      { id: "cloudcone", name: "CloudCone ???", color: "#5f7fb0" },
    ];
    const damagedHosts = [
      host("sh", "shgw", { group: "SHANGHAI / ????" }),
      host("pr", "prgw-lan", { group: "PR / E20C ??" }),
      host("wx", "wxgw", { group: "WX / ????" }),
      host("cloud", "ecs", { group: "CloudCone ???", deployScope: "cloud" }),
    ];

    const buckets = groupHostsForDisplay(damagedHosts, damagedGroups, "未分配");
    expect(buckets.map((bucket) => bucket.group.id)).toEqual([
      "shanghai",
      "pr-office",
      "wuxi",
      "cloud",
    ]);
    expect(buckets.map((bucket) => displayGroupName(bucket.group, "zh"))).toEqual([
      "上海",
      "PR / E20C",
      "无锡",
      "Cloud",
    ]);

    renderSidebarWithGroups(damagedHosts, damagedGroups, "zh");
    const sidebarNode = document.querySelector(".sidebar")!;
    expect(within(sidebarNode).getByText("上海")).toBeTruthy();
    expect(within(sidebarNode).getByText("PR / E20C")).toBeTruthy();
    expect(within(sidebarNode).getByText("无锡")).toBeTruthy();
    expect(within(sidebarNode).getByText("Cloud")).toBeTruthy();
    expect(sidebarNode.textContent).not.toContain("????");
    expect(sidebarNode.textContent).not.toContain("??");
  });

  it("localizes deployment scope labels", () => {
    expect(deployScopeLabel("local", "zh")).toBe("本地");
    expect(deployScopeLabel("cloud", "zh")).toBe("云端");
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
