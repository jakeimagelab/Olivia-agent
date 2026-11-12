"use client";

import { useCallback, useEffect, useRef } from "react";

export const SELECTION_VISIBLE_REFRESH_INTERVAL_MS = 5_000;

export function useVisibleSelectionRefresh({
  enabled = true,
  refresh,
  intervalMs = SELECTION_VISIBLE_REFRESH_INTERVAL_MS,
}: {
  enabled?: boolean;
  refresh: () => Promise<unknown>;
  intervalMs?: number;
}) {
  const refreshRef = useRef(refresh);
  const inFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  const refreshVisible = useCallback(() => {
    if (document.visibilityState !== "visible" || inFlightRef.current) return;
    let request: Promise<void>;
    request = Promise.resolve(refreshRef.current())
      .catch(() => undefined)
      .then(() => undefined)
      .finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
      });
    inFlightRef.current = request;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(refreshVisible, intervalMs);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [enabled, intervalMs, refreshVisible]);
}
