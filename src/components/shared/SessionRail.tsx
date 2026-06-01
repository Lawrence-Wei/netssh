import type { CSSProperties } from "react";
import { t } from "../../services/i18n";
import type { Lang } from "../../types";
import { Icon } from "./Icons";

export interface RailSession {
  id: string;
  title: string;
  alias: string;
  hue?: string;
  status?: "ok" | "warn" | "off";
}

interface SessionRailProps {
  lang: Lang;
  sessions: RailSession[];
  activeId: string;
  onPick: (id: string) => void;
  onAdd: () => void;
}

export function SessionRail({ lang, sessions, activeId, onPick, onAdd }: SessionRailProps) {
  return (
    <aside className="rail">
      <span className="eyebrow">{t("rail.eyebrow", lang)}</span>
      {sessions.map((session) => (
        <button
          key={session.id}
          className={"session-pill " + (session.id === activeId ? "active" : "")}
          style={{ "--host-color": session.hue || "var(--accent)" } as CSSProperties}
          onClick={() => onPick(session.id)}
          title={session.title}
        >
          <span className="hue" />
          <span className="alias">{session.alias || session.title}</span>
          <span className={"latency " + (session.status === "ok" ? "ok" : session.status === "warn" ? "warn" : "off")} />
        </button>
      ))}
      <div className="rail-divider" />
      <button className="rail-add" onClick={onAdd} title={t("rail.add", lang)}>
        {Icon.plus}
      </button>
    </aside>
  );
}
