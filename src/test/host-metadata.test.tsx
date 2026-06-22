import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { Sidebar } from "../layouts/Sidebar";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { useHosts } from "../store/hosts";
import { canonicalGroupId, displayGroupName, groupHostsForDisplay } from "../utils/groups";
import { sortHostsForSidebar } from "../utils/hostFilters";
import { deployScopeLabel, deviceTypeFromHost } from "../utils/deployScope";
import { brandLabel } from "../components/BrandIcons";
import type { Group, Host } from "../config/types";

const groups: Group[] = [{ id: "unassigned", name: "Unassigned", color: "#897e6e" }];
const HOST_DRAG_TYPE = "text/netssh-host";

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
  const onReorderHost = vi.fn();
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
        onReorderHost={onReorderHost}
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
        onReorderHost={vi.fn()}
        onAddHostQuick={vi.fn()}
        onRemoveHosts={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    </ConfirmProvider>
  );
}

function hostDragDataTransfer(hostId: string) {
  const data = new Map<string, string>([
    [HOST_DRAG_TYPE, hostId],
    ["text/plain", hostId],
  ]);
  const dataTransfer = {
    types: [HOST_DRAG_TYPE, "text/plain"],
    effectAllowed: "move",
    dropEffect: "move",
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
      if (!dataTransfer.types.includes(type)) dataTransfer.types.push(type);
    }),
    getData: vi.fn((type: string) => data.get(type) || ""),
  };
  return dataTransfer as unknown as DataTransfer;
}

function textOnlyHostDragDataTransfer(hostId: string) {
  const data = new Map<string, string>([["text/plain", hostId]]);
  const dataTransfer = {
    types: ["text/plain"],
    effectAllowed: "move",
    dropEffect: "move",
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
      if (!dataTransfer.types.includes(type)) dataTransfer.types.push(type);
    }),
    getData: vi.fn((type: string) => data.get(type) || ""),
  };
  return dataTransfer as unknown as DataTransfer;
}

function hiddenTypesHostDragDataTransfer(hostId: string) {
  const data = new Map<string, string>([["text/plain", hostId]]);
  return {
    types: [] as string[],
    effectAllowed: "move",
    dropEffect: "move",
    setData: vi.fn((type: string, value: string) => data.set(type, value)),
    getData: vi.fn((type: string) => data.get(type) || ""),
  } as unknown as DataTransfer;
}

describe("host metadata", () => {
  const initialState = useHosts.getState();

  beforeEach(() => {
    useHosts.setState(initialState, true);
  });

  it("groups sidebar assets by inferred type and runs fixed batch check ids", async () => {
    const onRunReadonlyCheck = vi.fn();
    render(
      <ConfirmProvider>
        <Sidebar
          lang="en"
          hosts={[
            host("router-1", "edge-router", { role: "gateway" }),
            host("linux-1", "ops-linux", { iconOverride: "ubuntu" }),
          ]}
          groups={groups}
          onPickHost={vi.fn()}
          onDoubleClickHost={vi.fn()}
          onContextMenu={vi.fn()}
          onOpenImport={vi.fn()}
          onAddGroup={vi.fn()}
          onRenameGroup={vi.fn()}
          onRemoveGroup={vi.fn()}
          onMoveHostToGroup={vi.fn()}
          onReorderHost={vi.fn()}
          onAddHostQuick={vi.fn()}
          onRemoveHosts={vi.fn()}
          onToggleFavorite={vi.fn()}
          onRunReadonlyCheck={onRunReadonlyCheck}
        />
      </ConfirmProvider>
    );

    expect(screen.getByText("Router / gateway")).toBeTruthy();
    expect(screen.getByText("Linux server")).toBeTruthy();

    await userEvent.click(screen.getByText("Batch"));
    await userEvent.click(screen.getByText("edge-router"));
    await userEvent.click(screen.getByText("Identity"));

    expect(onRunReadonlyCheck).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "router-1" })],
      "identity"
    );
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

  it("exposes manual up/down ordering for sidebar hosts", async () => {
    const user = userEvent.setup();
    const onPickHost = vi.fn();
    const onReorderHost = vi.fn();
    render(
      <ConfirmProvider>
        <Sidebar
          lang="en"
          hosts={[
            host("a", "alpha"),
            host("b", "beta"),
            host("c", "gamma"),
          ]}
          groups={groups}
          onPickHost={onPickHost}
          onDoubleClickHost={vi.fn()}
          onContextMenu={vi.fn()}
          onOpenImport={vi.fn()}
          onAddGroup={vi.fn()}
          onRenameGroup={vi.fn()}
          onRemoveGroup={vi.fn()}
          onMoveHostToGroup={vi.fn()}
          onReorderHost={onReorderHost}
          onAddHostQuick={vi.fn()}
          onRemoveHosts={vi.fn()}
          onToggleFavorite={vi.fn()}
        />
      </ConfirmProvider>
    );

    const moveUpButtons = screen.getAllByTitle("Move up");
    await user.click(moveUpButtons[1]);

    expect(onReorderHost).toHaveBeenCalledWith("b", 0, "unassigned", ["b", "a", "c"]);
    expect(onPickHost).not.toHaveBeenCalled();
  });

  it("sorts explicit manual order against unordered neighbors", () => {
    const sorted = sortHostsForSidebar([
      host("a", "alpha"),
      host("m", "macbook", { order: 2.5 }),
      host("z", "zulu"),
    ], "all");

    expect(sorted.map((item) => item.alias)).toEqual(["alpha", "zulu", "macbook"]);
  });

  it("renumbers the whole target group when reordering a host", () => {
    useHosts.setState((state) => ({
      ...state,
      hosts: [
        host("wxgw", "wxgw", { group: "wuxi" }),
        host("win11", "win11", { group: "wuxi" }),
        host("mac", "macbook", { group: "wuxi", order: 3.5 }),
      ],
      groups: [{ id: "wuxi", name: "Wuxi", color: "#6f7f95" }],
    }), true);

    useHosts.getState().reorderHost("mac", 1, "wuxi", ["wxgw", "mac", "win11"]);

    const sorted = sortHostsForSidebar(useHosts.getState().hosts, "all");
    expect(sorted.map((item) => item.alias)).toEqual(["wxgw", "macbook", "win11"]);
    expect(sorted.map((item) => item.order)).toEqual([0, 1, 2]);
  });

  it("moves a sidebar host into another site when dropped on the site bucket", () => {
    const onMoveHostToGroup = vi.fn();
    const onReorderHost = vi.fn();
    render(
      <ConfirmProvider>
        <Sidebar
          lang="en"
          hosts={[
            host("shgw", "shgw", { group: "shanghai" }),
            host("wxgw", "wxgw", { group: "wuxi" }),
          ]}
          groups={[
            { id: "shanghai", name: "Shanghai", color: "#8f7a65" },
            { id: "wuxi", name: "Wuxi", color: "#6f7f95" },
          ]}
          onPickHost={vi.fn()}
          onDoubleClickHost={vi.fn()}
          onContextMenu={vi.fn()}
          onOpenImport={vi.fn()}
          onAddGroup={vi.fn()}
          onRenameGroup={vi.fn()}
          onRemoveGroup={vi.fn()}
          onMoveHostToGroup={onMoveHostToGroup}
          onReorderHost={onReorderHost}
          onAddHostQuick={vi.fn()}
          onRemoveHosts={vi.fn()}
          onToggleFavorite={vi.fn()}
        />
      </ConfirmProvider>
    );

    const sourceRow = screen.getByText("shgw").closest(".host-row")!;
    const targetGroup = screen.getByText("Wuxi").closest(".host-group")!;
    const dataTransfer = hostDragDataTransfer("shgw");

    act(() => {
      fireEvent.dragStart(sourceRow, { dataTransfer });
      fireEvent.dragOver(targetGroup, { dataTransfer });
      fireEvent.drop(targetGroup, { dataTransfer });
    });

    expect(onReorderHost).toHaveBeenCalledWith("shgw", 1, "wuxi", ["wxgw", "shgw"]);
    expect(onMoveHostToGroup).not.toHaveBeenCalled();
  });

  it("moves a sidebar host into the Wuxi site when only plain text drag data is available", () => {
    const onMoveHostToGroup = vi.fn();
    const onReorderHost = vi.fn();
    render(
      <ConfirmProvider>
        <Sidebar
          lang="zh"
          hosts={[host("macbook", "macbook", { group: "unassigned" })]}
          groups={[
            { id: "unassigned", name: "Unassigned", color: "#897e6e" },
            { id: "wuxi", name: "Wuxi", color: "#6f7f95", subnet: "192.168.66.0/24" },
          ]}
          onPickHost={vi.fn()}
          onDoubleClickHost={vi.fn()}
          onContextMenu={vi.fn()}
          onOpenImport={vi.fn()}
          onAddGroup={vi.fn()}
          onRenameGroup={vi.fn()}
          onRemoveGroup={vi.fn()}
          onMoveHostToGroup={onMoveHostToGroup}
          onReorderHost={onReorderHost}
          onAddHostQuick={vi.fn()}
          onRemoveHosts={vi.fn()}
          onToggleFavorite={vi.fn()}
        />
      </ConfirmProvider>
    );

    const targetGroup = screen.getByText("无锡").closest(".host-group")!;
    const dataTransfer = textOnlyHostDragDataTransfer("macbook");

    act(() => {
      fireEvent.dragEnter(targetGroup, { dataTransfer });
      fireEvent.dragOver(targetGroup, { dataTransfer });
      fireEvent.drop(targetGroup, { dataTransfer });
    });

    expect(onReorderHost).toHaveBeenCalledWith("macbook", 0, "wuxi", ["macbook"]);
    expect(onMoveHostToGroup).not.toHaveBeenCalled();
  });

  it("accepts a Wuxi site drop when dragover hides dataTransfer types", () => {
    const onMoveHostToGroup = vi.fn();
    const onReorderHost = vi.fn();
    render(
      <ConfirmProvider>
        <Sidebar
          lang="zh"
          hosts={[host("macbook", "macbook", { group: "unassigned" })]}
          groups={[
            { id: "unassigned", name: "Unassigned", color: "#897e6e" },
            { id: "wuxi", name: "Wuxi", color: "#6f7f95", subnet: "192.168.66.0/24" },
          ]}
          onPickHost={vi.fn()}
          onDoubleClickHost={vi.fn()}
          onContextMenu={vi.fn()}
          onOpenImport={vi.fn()}
          onAddGroup={vi.fn()}
          onRenameGroup={vi.fn()}
          onRemoveGroup={vi.fn()}
          onMoveHostToGroup={onMoveHostToGroup}
          onReorderHost={onReorderHost}
          onAddHostQuick={vi.fn()}
          onRemoveHosts={vi.fn()}
          onToggleFavorite={vi.fn()}
        />
      </ConfirmProvider>
    );

    const targetGroup = screen.getByText("无锡").closest(".host-group")!;
    const dataTransfer = hiddenTypesHostDragDataTransfer("macbook");

    act(() => {
      fireEvent.dragEnter(targetGroup, { dataTransfer });
      fireEvent.dragOver(targetGroup, { dataTransfer });
      fireEvent.drop(targetGroup, { dataTransfer });
    });

    expect(onReorderHost).toHaveBeenCalledWith("macbook", 0, "wuxi", ["macbook"]);
    expect(onMoveHostToGroup).not.toHaveBeenCalled();
  });

  it("keeps Pirelli-like custom sites independent and accepts drops while empty", () => {
    expect(canonicalGroupId("pirelli")).toBeUndefined();
    expect(canonicalGroupId("倍耐力")).toBeUndefined();

    const onMoveHostToGroup = vi.fn();
    const onReorderHost = vi.fn();
    render(
      <ConfirmProvider>
        <Sidebar
          lang="zh"
          hosts={[host("edge-router", "edge-router", { group: "unassigned" })]}
          groups={[
            { id: "unassigned", name: "Unassigned", color: "#897e6e" },
            { id: "pirelli", name: "倍耐力", color: "#60a5fa" },
          ]}
          onPickHost={vi.fn()}
          onDoubleClickHost={vi.fn()}
          onContextMenu={vi.fn()}
          onOpenImport={vi.fn()}
          onAddGroup={vi.fn()}
          onRenameGroup={vi.fn()}
          onRemoveGroup={vi.fn()}
          onMoveHostToGroup={onMoveHostToGroup}
          onReorderHost={onReorderHost}
          onAddHostQuick={vi.fn()}
          onRemoveHosts={vi.fn()}
          onToggleFavorite={vi.fn()}
        />
      </ConfirmProvider>
    );

    const sourceRow = screen.getByText("edge-router").closest(".host-row")!;
    const targetGroup = screen.getByText("倍耐力").closest(".host-group")!;
    expect(within(targetGroup as HTMLElement).getByText("拖拽主机到这里")).toBeTruthy();

    const dataTransfer = hostDragDataTransfer("edge-router");
    act(() => {
      fireEvent.dragStart(sourceRow, { dataTransfer });
      fireEvent.dragOver(targetGroup, { dataTransfer });
      fireEvent.drop(targetGroup, { dataTransfer });
    });

    expect(onReorderHost).toHaveBeenCalledWith("edge-router", 0, "pirelli", ["edge-router"]);
    expect(onMoveHostToGroup).not.toHaveBeenCalled();
  });

  it("allows an open unsaved session payload to be dropped onto a site bucket", () => {
    const onMoveHostToGroup = vi.fn();
    const onReorderHost = vi.fn();
    render(
      <ConfirmProvider>
        <Sidebar
          lang="en"
          hosts={[host("wxgw", "wxgw", { group: "wuxi" })]}
          groups={[
            { id: "shanghai", name: "Shanghai", color: "#8f7a65" },
            { id: "wuxi", name: "Wuxi", color: "#6f7f95" },
          ]}
          onPickHost={vi.fn()}
          onDoubleClickHost={vi.fn()}
          onContextMenu={vi.fn()}
          onOpenImport={vi.fn()}
          onAddGroup={vi.fn()}
          onRenameGroup={vi.fn()}
          onRemoveGroup={vi.fn()}
          onMoveHostToGroup={onMoveHostToGroup}
          onReorderHost={onReorderHost}
          onAddHostQuick={vi.fn()}
          onRemoveHosts={vi.fn()}
          onToggleFavorite={vi.fn()}
        />
      </ConfirmProvider>
    );

    const targetGroup = screen.getByText("Wuxi").closest(".host-group")!;
    const dataTransfer = hostDragDataTransfer("draft-session");

    act(() => {
      fireEvent.dragOver(targetGroup, { dataTransfer });
      fireEvent.drop(targetGroup, { dataTransfer });
    });

    expect(onMoveHostToGroup).toHaveBeenCalledWith("draft-session", "wuxi");
    expect(onReorderHost).not.toHaveBeenCalled();
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

  it("materializes inferred site groups so they can be moved to and renamed", () => {
    useHosts.setState((state) => ({
      ...state,
      hosts: [
        host("shgw", "shgw", { group: "shanghai" }),
        host("prgw", "prgw-lan", { group: "pr-office" }),
        host("wxgw", "wxgw", { group: "wuxi" }),
      ],
      groups: [
        { id: "unassigned", name: "Unassigned", color: "#897e6e" },
        { id: "wuxi", name: "Wuxi", color: "#6f7f95" },
      ],
    }), true);

    const persisted = useHosts.persist.getOptions().partialize?.(useHosts.getState()) as {
      hosts: Host[];
      groups: Group[];
    };
    expect(persisted.groups.map((group) => group.id)).toEqual([
      "unassigned",
      "wuxi",
      "shanghai",
      "pr-office",
    ]);

    useHosts.getState().renameGroup("shanghai", "上海核心", "192.168.100.0/24");

    const state = useHosts.getState();
    expect(state.groups.find((group) => group.id === "shanghai")).toMatchObject({
      name: "上海核心",
      subnet: "192.168.100.0/24",
    });
    expect(state.groups.some((group) => group.id === "pr-office")).toBe(true);

    const shanghaiBucket = groupHostsForDisplay(state.hosts, state.groups, "未分配")
      .find((bucket) => bucket.group.id === "shanghai");
    expect(shanghaiBucket).toBeTruthy();
    expect(displayGroupName(shanghaiBucket!.group, "zh")).toBe("上海核心");

    useHosts.getState().renameGroup("pr-office", "PR / Lab", undefined);
    const persistedAfterRename = useHosts.persist.getOptions().partialize?.(useHosts.getState()) as {
      groups: Group[];
    };
    expect(persistedAfterRename.groups.find((group) => group.id === "pr-office")).toMatchObject({
      name: "PR / Lab",
    });
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

  it("saves and displays custom names for built-in site buckets", async () => {
    const onRenameGroup = vi.fn();
    const hosts = [host("prgw", "prgw-lan", { group: "pr-office" })];
    const initialGroups: Group[] = [
      { id: "unassigned", name: "Unassigned", color: "#897e6e" },
      { id: "pr-office", name: "PR / E20C", color: "#7f7395" },
    ];
    const renamedGroups: Group[] = [
      { id: "unassigned", name: "Unassigned", color: "#897e6e" },
      { id: "pr-office", name: "PR / Lab", color: "#7f7395" },
    ];
    const props = {
      lang: "zh" as const,
      hosts,
      onPickHost: vi.fn(),
      onDoubleClickHost: vi.fn(),
      onContextMenu: vi.fn(),
      onOpenImport: vi.fn(),
      onAddGroup: vi.fn(),
      onRenameGroup,
      onRemoveGroup: vi.fn(),
      onMoveHostToGroup: vi.fn(),
      onReorderHost: vi.fn(),
      onAddHostQuick: vi.fn(),
      onRemoveHosts: vi.fn(),
      onToggleFavorite: vi.fn(),
    };
    const { rerender } = render(
      <ConfirmProvider>
        <Sidebar {...props} groups={initialGroups} />
      </ConfirmProvider>
    );

    await userEvent.click(screen.getByTitle("重命名"));
    const nameInput = screen.getByDisplayValue("PR / E20C");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "PR / Lab");
    await userEvent.click(screen.getByText("保存"));

    expect(onRenameGroup).toHaveBeenCalledWith("pr-office", "PR / Lab", undefined);

    rerender(
      <ConfirmProvider>
        <Sidebar {...props} groups={renamedGroups} />
      </ConfirmProvider>
    );

    const sidebarNode = document.querySelector(".sidebar")!;
    expect(within(sidebarNode).getByText("PR / Lab")).toBeTruthy();
    expect(within(sidebarNode).queryByText("PR / E20C")).toBeFalsy();
  });

  it("localizes deployment scope labels", () => {
    expect(deployScopeLabel("local", "zh")).toBe("本地");
    expect(deployScopeLabel("cloud", "zh")).toBe("云端");
  });

  it("recognizes Luckfox devices for brand icons", () => {
    const luckfoxHost = host("luckfox", "luckfox-picokvm", {
      tags: ["Luckfox PicoKVM"],
    });
    expect(deviceTypeFromHost(luckfoxHost)).toBe("luckfox");
    expect(brandLabel(luckfoxHost)).toBe("Luckfox");
  });

  it("recognizes ASUS routers before generic Linux icons", () => {
    const asusHost = host("asus", "asus-router", {
      tags: ["linux", "router"],
    });
    expect(deviceTypeFromHost(asusHost)).toBe("asus");
    expect(brandLabel(asusHost)).toBe("ASUS Router");
    expect(brandLabel(host("asus-override", "router", { iconOverride: "asus" }))).toBe("ASUS Router");
    expect(brandLabel(host("asus-generic-router", "asus-router", { iconOverride: "router" }))).toBe("ASUS Router");
    expect(brandLabel(host("asus-linux-router", "asus-router", { iconOverride: "linux", tags: ["router"] }))).toBe("ASUS Router");
  });

  it("maps explicit and inferred device icons to brand labels", () => {
    expect(brandLabel(host("huawei", "core-s5700"))).toBe("Huawei Switch");
    expect(brandLabel(host("cisco", "lab-catalyst"))).toBe("Cisco Switch");
    expect(brandLabel(host("mac", "operator-laptop", { iconOverride: "macos" }))).toBe("macOS");
    expect(brandLabel(host("nas", "storage-box", { iconOverride: "nas" }))).toBe("NAS / Storage");
    expect(brandLabel(host("qnap", "qnap-nas"))).toBe("QNAP");
    expect(brandLabel(host("metrics", "metrics", { tags: ["ubuntu", "observability"] }))).toBe("Ubuntu");
  });

  it("keeps Zabbix service identity ahead of generic OS detection", () => {
    const zabbix = host("zabbix", "zabbix", {
      iconOverride: "proxmox",
      tags: ["ubuntu", "observability"],
    });
    expect(deviceTypeFromHost(zabbix)).toBe("zabbix");
    expect(brandLabel(zabbix)).toBe("Zabbix");
  });

  it("recognizes PR gateway aliases as routers instead of generic initials", () => {
    const prgw = host("prgw", "prgw-lan", {
      iconOverride: "proxmox",
      tags: ["linux"],
    });
    expect(deviceTypeFromHost(prgw)).toBe("router");
    expect(brandLabel(prgw)).toBe("Router / Gateway");
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
