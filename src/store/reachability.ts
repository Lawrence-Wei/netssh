// Polls reachability for the hosts in the sidebar and surfaces a status/latency.
//
// Uses the Rust host_ping command (TCP connect on the SSH port). When the
// backend is unavailable (vite dev without Tauri) we fall back to a stable
// "unknown" state without throwing.

import { useEffect, useMemo, useState } from "react";
import { hostPing } from "../api/tauri";
import type { Host, HostStatus } from "../config/types";

export interface Reachability {
  status: HostStatus;
  latency: number | null;
  lastChecked: number;
}

const POLL_INTERVAL_MS = 30_000;

/** Stable identity string for a host — used as the effect dependency. */
function hostKey(host: Host) {
  return `${host.id}:${host.hostname}:${host.port}`;
}

export function useReachability(hosts: Host[]): Record<string, Reachability> {
  const [map, setMap] = useState<Record<string, Reachability>>({});
  const dep = useMemo(() => hosts.map(hostKey).join("|"), [hosts]);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      await Promise.all(
        hosts.map(async (host) => {
          try {
            const result = await hostPing(host.hostname, host.port || 22);
            if (cancelled) return;
            setMap((prev) => ({
              ...prev,
              [host.id]: {
                status: result.ok ? "ok" : "off",
                latency: result.latency_ms,
                lastChecked: Date.now(),
              },
            }));
          } catch {
            if (cancelled) return;
            setMap((prev) => ({
              ...prev,
              [host.id]: { status: "off", latency: null, lastChecked: Date.now() },
            }));
          }
        })
      );
    };

    tick();
    const handle = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [dep]);

  return map;
}
