"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type HomeCalendarTask = {
  id: string;
  title: string;
  category?: string | null;
  completed: boolean;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  memo?: string | null;
};

export type HomeDashboardPayload = {
  ok: boolean;
  todayTasks: HomeCalendarTask[];
  mailing?: { pending?: unknown[]; failed?: unknown[]; recent?: unknown[] };
  clients?: {
    quoteFollowUp?: unknown[];
    contractPending?: unknown[];
    galleryPending?: unknown[];
    reviewPending?: unknown[];
    snsPending?: unknown[];
  };
};

type DashboardState = "loading" | "ready" | "empty" | "error";

type HomeDashboardContextValue = {
  data: HomeDashboardPayload | null;
  state: DashboardState;
  refreshing: boolean;
  error: string;
  savingTaskIds: Set<string>;
  refresh: () => Promise<void>;
  setTaskCompleted: (taskId: string, completed: boolean) => Promise<boolean>;
};

const HomeDashboardContext = createContext<HomeDashboardContextValue | null>(null);
let inFlightDashboardRequest: Promise<HomeDashboardPayload> | null = null;

function requestDashboard() {
  if (!inFlightDashboardRequest) {
    inFlightDashboardRequest = fetch("/api/dashboard", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "홈 데이터를 불러오지 못했습니다.");
        return payload as HomeDashboardPayload;
      })
      .finally(() => {
        inFlightDashboardRequest = null;
      });
  }
  return inFlightDashboardRequest;
}

function hasBriefingData(data: HomeDashboardPayload) {
  const clients = data.clients ?? {};
  const mailing = data.mailing ?? {};
  return Boolean(
    data.todayTasks.length ||
    mailing.pending?.length ||
    clients.quoteFollowUp?.length ||
    clients.contractPending?.length ||
    clients.galleryPending?.length ||
    clients.reviewPending?.length ||
    clients.snsPending?.length
  );
}

export function HomeDashboardDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<HomeDashboardPayload | null>(null);
  const [state, setState] = useState<DashboardState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(() => new Set());
  const savingTaskIdsRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const dataRef = useRef<HomeDashboardPayload | null>(null);

  const applyData = useCallback((payload: HomeDashboardPayload) => {
    dataRef.current = payload;
    setData(payload);
    setState(hasBriefingData(payload) ? "ready" : "empty");
    setError("");
  }, []);

  const refresh = useCallback(async () => {
    const hasData = Boolean(dataRef.current);
    if (hasData) setRefreshing(true);
    else setState("loading");
    try {
      const payload = await requestDashboard();
      if (mountedRef.current) applyData(payload);
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "홈 데이터를 불러오지 못했습니다.");
      if (!dataRef.current) setState("error");
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [applyData]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const setTaskCompleted = useCallback(async (taskId: string, completed: boolean) => {
    const current = dataRef.current;
    if (!current || savingTaskIdsRef.current.has(taskId)) return false;
    const previousCompleted = current.todayTasks.find((task) => task.id === taskId)?.completed;
    if (previousCompleted == null) return false;
    savingTaskIdsRef.current.add(taskId);
    const optimistic = {
      ...current,
      todayTasks: current.todayTasks.map((task) => task.id === taskId ? { ...task, completed } : task),
    };
    applyData(optimistic);
    setSavingTaskIds((ids) => new Set(ids).add(taskId));
    try {
      const response = await fetch("/api/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, completed }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error || "완료 상태를 저장하지 못했습니다.");
      return true;
    } catch (saveError) {
      const latest = dataRef.current;
      if (latest) {
        applyData({
          ...latest,
          todayTasks: latest.todayTasks.map((task) => (
            task.id === taskId ? { ...task, completed: previousCompleted } : task
          )),
        });
      }
      setError(saveError instanceof Error ? saveError.message : "완료 상태를 저장하지 못했습니다.");
      return false;
    } finally {
      savingTaskIdsRef.current.delete(taskId);
      setSavingTaskIds((ids) => {
        const next = new Set(ids);
        next.delete(taskId);
        return next;
      });
    }
  }, [applyData]);

  return (
    <HomeDashboardContext.Provider value={{ data, state, refreshing, error, savingTaskIds, refresh, setTaskCompleted }}>
      {children}
    </HomeDashboardContext.Provider>
  );
}

export function useHomeDashboardData() {
  const value = useContext(HomeDashboardContext);
  if (!value) throw new Error("useHomeDashboardData must be used inside HomeDashboardDataProvider");
  return value;
}
