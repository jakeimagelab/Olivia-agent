"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type AnalysisExecutionStatus = "idle" | "running" | "completed" | "failed";

type AnalysisExecutionState = {
  status: AnalysisExecutionStatus;
  message: string;
  progress: number | null;
  lastCompletedAt: string | null;
  actionLabel: string;
  actionAvailable: boolean;
};

type AnalysisExecutionValue = AnalysisExecutionState & {
  registerAction: (label: string, action: () => void | Promise<void>) => () => void;
  runRegisteredAction: () => void;
  reportRunning: (message: string, progress?: number | null) => void;
  reportProgress: (progress: number | null, message?: string) => void;
  reportCompleted: (message?: string) => void;
  reportFailed: (message: string) => void;
  resetExecution: () => void;
};

const AnalysisExecutionContext = createContext<AnalysisExecutionValue | null>(null);

function clampProgress(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function AnalysisExecutionProvider({ workspaceId, children }: {
  workspaceId: string;
  children: ReactNode;
}) {
  const storageKey = `olivia:analysis-workspace:${workspaceId}:last-completed-at`;
  const actionRef = useRef<(() => void | Promise<void>) | null>(null);
  const [state, setState] = useState<AnalysisExecutionState>({
    status: "idle",
    message: "분석을 시작할 준비가 되었습니다.",
    progress: null,
    lastCompletedAt: null,
    actionLabel: "분석 시작",
    actionAvailable: false,
  });

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) setState((current) => ({ ...current, lastCompletedAt: stored }));
    } catch (error) {
      console.error("[AnalysisWorkspace] 마지막 실행 시각을 불러오지 못했습니다.", error);
    }
  }, [storageKey]);

  const registerAction = useCallback((label: string, action: () => void | Promise<void>) => {
    actionRef.current = action;
    setState((current) => ({ ...current, actionLabel: label, actionAvailable: true }));
    return () => {
      if (actionRef.current !== action) return;
      actionRef.current = null;
      setState((current) => ({ ...current, actionAvailable: false }));
    };
  }, []);

  const runRegisteredAction = useCallback(() => {
    if (!actionRef.current) return;
    void actionRef.current();
  }, []);

  const reportRunning = useCallback((message: string, progress?: number | null) => {
    setState((current) => ({
      ...current,
      status: "running",
      message,
      progress: clampProgress(progress),
    }));
  }, []);

  const reportProgress = useCallback((progress: number | null, message?: string) => {
    setState((current) => ({
      ...current,
      status: "running",
      message: message ?? current.message,
      progress: clampProgress(progress),
    }));
  }, []);

  const reportCompleted = useCallback((message = "분석이 완료되었습니다.") => {
    const completedAt = new Date().toISOString();
    setState((current) => ({
      ...current,
      status: "completed",
      message,
      progress: 100,
      lastCompletedAt: completedAt,
    }));
    try {
      window.localStorage.setItem(storageKey, completedAt);
    } catch (error) {
      console.error("[AnalysisWorkspace] 마지막 실행 시각을 저장하지 못했습니다.", error);
    }
  }, [storageKey]);

  const reportFailed = useCallback((message: string) => {
    setState((current) => ({ ...current, status: "failed", message, progress: null }));
  }, []);

  const resetExecution = useCallback(() => {
    setState((current) => ({
      ...current,
      status: "idle",
      message: "분석을 시작할 준비가 되었습니다.",
      progress: null,
    }));
  }, []);

  const value = useMemo<AnalysisExecutionValue>(() => ({
    ...state,
    registerAction,
    runRegisteredAction,
    reportRunning,
    reportProgress,
    reportCompleted,
    reportFailed,
    resetExecution,
  }), [
    registerAction,
    reportCompleted,
    reportFailed,
    reportProgress,
    reportRunning,
    resetExecution,
    runRegisteredAction,
    state,
  ]);

  return <AnalysisExecutionContext.Provider value={value}>{children}</AnalysisExecutionContext.Provider>;
}

export function useAnalysisExecution(): AnalysisExecutionValue {
  const context = useContext(AnalysisExecutionContext);
  if (!context) throw new Error("AnalysisExecutionProvider 안에서 사용해야 합니다.");
  return context;
}
