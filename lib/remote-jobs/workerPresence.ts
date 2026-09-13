export const REMOTE_WORKER_ONLINE_WINDOW_MS = 15_000;

export type RemoteWorkerPresence = {
  workerId: string;
  online: boolean | null;
  lastSeenAt: string | null;
  nasConnected: boolean | null;
  workerStatus: string | null;
};

export function isRemoteWorkerOnline(
  lastSeenAt: string | null | undefined,
  nowMs = Date.now(),
  onlineWindowMs = REMOTE_WORKER_ONLINE_WINDOW_MS,
): boolean | null {
  if (!lastSeenAt) return null;
  const seenAt = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(seenAt)) return null;
  return nowMs - seenAt <= onlineWindowMs;
}
