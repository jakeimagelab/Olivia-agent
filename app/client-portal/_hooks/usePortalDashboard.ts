"use client";

import { useEffect, useState } from "react";
import { usePortalSession } from "./usePortalSession";

export function usePortalDashboard() {
  const sessionState = usePortalSession();
  const [data, setData] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (sessionState.loading) return;
    if (!sessionState.token) {
      setDataLoading(false);
      return;
    }
    const controller = new AbortController();
    setDataError("");
    fetch("/api/client-portal/dashboard", {
      headers: { "x-portal-token": sessionState.token },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "프로젝트 정보를 불러오지 못했습니다.");
        setData(payload);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDataError(error instanceof Error ? error.message : "프로젝트 정보를 불러오지 못했습니다.");
      })
      .finally(() => setDataLoading(false));
    return () => controller.abort();
  }, [sessionState.loading, sessionState.token, refreshKey]);

  return {
    ...sessionState,
    data,
    dataLoading,
    dataError,
    loading: sessionState.loading || dataLoading,
    refresh: () => setRefreshKey((value) => value + 1),
  };
}
