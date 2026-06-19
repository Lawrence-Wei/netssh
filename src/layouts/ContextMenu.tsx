import { useState } from "react";
import type { ReactNode } from "react";
import { useClickOutside } from "../hooks/useClickOutside";
import { t } from "../utils/i18n";
import type { Group, Host, Lang } from "../config/types";
import { Icon } from "../components/Icons";
import { displayGroupName } from "../utils/groups";

interface ContextMenuProps {
  lang: Lang;
  x: number;
  y: number;
  host: Host;
  groups?: Group[];
  onAction: (action: string, host: Host, extra?: string) => void;
  onClose: () => void;
}

export function ContextMenu({ lang, x, y, host, groups, onAction, onClose }: ContextMenuProps) {
  const ref = useClickOutside<HTMLDivElement>(onClose);
  const [moveOpen, setMoveOpen] = useState(false);

  const left = Math.min(x, window.innerWidth - 260);
  const top = Math.min(y, window.innerHeight - 280);
  /** Open submenus leftward when the context menu is near the right edge. */
  const submenuLeft = x < window.innerWidth * 0.6;
  const favorite = Boolean(host.favorite ?? host.pinned);

  const items: Array<
    | { id: string; icon: ReactNode; label: string; shortcut?: string; danger?: boolean; hasSub?: boolean }
    | { divider: true }
  > = [
    { id: "connect", icon: Icon.power, label: t("ctx.connect", lang), shortcut: "Enter" },
    {
      id: "favorite",
      icon: Icon.bookmark,
      label: favorite
        ? (lang === "zh" ? "取消收藏" : "Remove favorite")
        : (lang === "zh" ? "添加收藏" : "Add favorite"),
    },
    { id: "edit", icon: Icon.edit, label: t("ctx.edit", lang) },
    { id: "move", icon: Icon.chevron, label: lang === "zh" ? "移动到站点" : "Move to site", hasSub: true },
    { divider: true },
    { id: "delete", icon: Icon.trash, label: t("ctx.delete", lang), danger: true },
  ];

  return (
    <div ref={ref} className="context-menu" style={{ left, top }}>
      {items.map((item, index) =>
        "divider" in item ? (
          <div className="divider" key={`d-${index}`} />
        ) : (
          <div key={item.id} style={{ position: "relative" }}>
            <button
              className={item.danger ? "danger" : ""}
              onClick={() => {
                if (item.id === "move") {
                  setMoveOpen((v) => !v);
                  return;
                }
                onAction(item.id, host);
                onClose();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
              {item.hasSub && (
                <span className="shortcut" style={{ marginLeft: 4 }}>{moveOpen ? "▾" : "▸"}</span>
              )}
            </button>
            {item.id === "move" && moveOpen && groups && (
              <div className={"context-submenu" + (submenuLeft ? "" : " context-submenu--left")}>
                {groups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => {
                      onAction("move", host, group.id);
                      onClose();
                    }}
                  >
                    <span className="moon-dot" style={{ background: group.color }} />
                    <span>{displayGroupName(group, lang)}</span>
                    {group.subnet && <span className="shortcut">{group.subnet}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
