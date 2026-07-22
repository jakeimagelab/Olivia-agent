export function isNewerSequence(incoming: unknown, lastAccepted: number) {
  return typeof incoming !== "number" || !Number.isFinite(incoming) || incoming > lastAccepted;
}

export function extendInteractionLease(previousUntil: number, now: number, durationMs: number) {
  return Math.max(previousUntil, now + durationMs);
}
