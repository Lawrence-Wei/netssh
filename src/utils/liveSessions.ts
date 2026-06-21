// Track live background SSH sessions so the frontend can reattach
// to a running session when the user reopens a host tab.
//
// h o s t I d  →  s e s s i o n I d
const liveSessions = new Map<string, string>();

export function registerLiveSession(hostId: string, sessionId: string) {
  liveSessions.set(hostId, sessionId);
}

export function getLiveSession(hostId: string): string | undefined {
  return liveSessions.get(hostId);
}

export function removeLiveSession(hostId: string) {
  liveSessions.delete(hostId);
}

export function moveLiveSession(fromHostId: string, toHostId: string) {
  if (fromHostId === toHostId) return;
  const sessionId = liveSessions.get(fromHostId);
  if (!sessionId) return;
  liveSessions.delete(fromHostId);
  liveSessions.set(toHostId, sessionId);
}

export function listLiveSessions(): ReadonlyMap<string, string> {
  return liveSessions;
}

/** Clear all tracked sessions — intended for test teardown. */
export function resetLiveSessions() {
  liveSessions.clear();
}
