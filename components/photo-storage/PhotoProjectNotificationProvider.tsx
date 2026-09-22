"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PhotoStorageEvent, PhotoStorageProject } from "@/lib/photo-storage/types";
import { photoProjectPollDelayMs } from "@/lib/photo-storage/pollingPolicy";

type PhotoProjectNotificationContextValue = {
  projects: PhotoStorageProject[];
  events: PhotoStorageEvent[];
  loading: boolean;
  error: string | null;
  lastAction: { project: PhotoStorageProject; action: "APPROVED" | "DEFERRED" } | null;
  selectedProjectId: string | null;
  selectProject: (projectId: string | null) => void;
  refresh: () => Promise<void>;
  approve: (projectId: string) => Promise<PhotoStorageProject>;
  defer: (projectId: string) => Promise<PhotoStorageProject>;
  retry: (projectId: string) => Promise<PhotoStorageProject>;
};

const PhotoProjectNotificationContext = createContext<PhotoProjectNotificationContextValue | null>(null);

function isProject(value: unknown): value is PhotoStorageProject {
  return Boolean(value) && typeof value === "object" && typeof (value as PhotoStorageProject).id === "string";
}

export function PhotoProjectNotificationProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<PhotoStorageProject[]>([]);
  const [events, setEvents] = useState<PhotoStorageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<PhotoProjectNotificationContextValue["lastAction"]>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const mounted = useRef(true);
  const requestRef = useRef<AbortController | null>(null);
  const projectsRef = useRef<PhotoStorageProject[]>([]);

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/photo-storage/projects", { cache: "no-store", signal: controller.signal });
      if (response.status === 401) {
        if (mounted.current) setLoading(false);
        return;
      }
      if (!response.ok) throw new Error("촬영 프로젝트 알림을 불러오지 못했습니다.");
      const payload = await response.json() as { projects?: unknown; events?: unknown };
      if (!mounted.current) return;
      const nextProjects = Array.isArray(payload.projects) ? payload.projects.filter(isProject) : [];
      projectsRef.current = nextProjects;
      setProjects(nextProjects);
      setEvents(Array.isArray(payload.events) ? payload.events as PhotoStorageEvent[] : []);
      setError(null);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (mounted.current) setError(cause instanceof Error ? cause.message : "촬영 프로젝트 알림을 확인할 수 없습니다.");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    const schedule = () => {
      if (disposed || timer) return;
      const current = projectsRef.current;
      const delay = photoProjectPollDelayMs(current, document.visibilityState === "hidden");
      if (delay !== null) timer = setTimeout(async () => {
        timer = null;
        await refresh();
        schedule();
      }, delay);
    };
    const loadAndSchedule = async () => {
      if (timer) clearTimeout(timer);
      timer = null;
      await refresh();
      schedule();
    };
    void loadAndSchedule();
    const onRefresh = () => { if (document.visibilityState === "visible") void loadAndSchedule(); };
    window.addEventListener("focus", onRefresh);
    window.addEventListener("online", onRefresh);
    document.addEventListener("visibilitychange", onRefresh);
    return () => {
      disposed = true;
      mounted.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("online", onRefresh);
      document.removeEventListener("visibilitychange", onRefresh);
    };
  }, [refresh]);

  const transition = useCallback(async (projectId: string, action: "approve" | "defer" | "retry") => {
    const response = await fetch(`/api/photo-storage/projects/${projectId}/${action}`, { method: "POST" });
    const payload = await response.json().catch(() => ({})) as { project?: PhotoStorageProject; error?: string };
    if (!response.ok || !payload.project) throw new Error(payload.error || "프로젝트 상태를 변경하지 못했습니다.");
    if (mounted.current) {
      setProjects((current) => current.map((project) => project.id === payload.project!.id ? payload.project! : project));
      if (action !== "retry") setLastAction({ project: payload.project, action: action === "approve" ? "APPROVED" : "DEFERRED" });
      window.setTimeout(() => setLastAction((current) => current?.project.id === payload.project!.id ? null : current), 6000);
    }
    await refresh();
    return payload.project;
  }, [refresh]);

  const value = useMemo<PhotoProjectNotificationContextValue>(() => ({
    projects, events, loading, error, lastAction, selectedProjectId, selectProject: setSelectedProjectId, refresh,
    approve: (id) => transition(id, "approve"),
    defer: (id) => transition(id, "defer"),
    retry: (id) => transition(id, "retry"),
  }), [projects, events, loading, error, lastAction, selectedProjectId, refresh, transition]);

  return <PhotoProjectNotificationContext.Provider value={value}>{children}</PhotoProjectNotificationContext.Provider>;
}

export function usePhotoProjectNotifications(): PhotoProjectNotificationContextValue {
  const context = useContext(PhotoProjectNotificationContext);
  if (!context) throw new Error("usePhotoProjectNotifications는 PhotoProjectNotificationProvider 안에서 사용해야 합니다.");
  return context;
}
