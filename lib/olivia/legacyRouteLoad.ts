export type LegacyRouteTimer = ReturnType<typeof setTimeout>;

export function createLegacyRouteLoadController(
  timeoutMs: number,
  timers: {
    set: (callback: () => void, delay: number) => LegacyRouteTimer;
    clear: (timer: LegacyRouteTimer) => void;
  } = { set: (callback, delay) => setTimeout(callback, delay), clear: (timer) => clearTimeout(timer) },
) {
  let currentAttempt = 0;
  let timer: LegacyRouteTimer | null = null;

  const clear = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };

  return {
    begin(onTimeout: (attemptId: number) => void) {
      clear();
      const attemptId = ++currentAttempt;
      timer = timers.set(() => {
        if (attemptId !== currentAttempt) return;
        timer = null;
        onTimeout(attemptId);
      }, timeoutMs);
      return attemptId;
    },
    settle(attemptId: number) {
      if (attemptId !== currentAttempt) return false;
      clear();
      return true;
    },
    cancel(attemptId: number) {
      if (attemptId !== currentAttempt) return;
      clear();
      currentAttempt += 1;
    },
    dispose() {
      clear();
      currentAttempt += 1;
    },
  };
}
