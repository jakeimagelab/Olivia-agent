"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parsePersistedSelectionSyncQueue } from "@/lib/person-select/selectionSync";
import { SELECTION_SYNC_STORAGE_EVENT } from "./useSelectionSyncBrowserPersistence";
import type { PersonSelectMeData } from "./personSelectPublicModel";

export async function personSelectJsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했어요.");
  return data as T;
}

export function usePersonSelectData(slug: string) {
  const router = useRouter();
  const [me, setMe] = useState<PersonSelectMeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const result = await personSelectJsonFetch<{ ok: true } & PersonSelectMeData>(`/api/pick/${slug}/me`);
      setMe(result);
      setError("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "사진을 불러오지 못했어요.";
      if (message.includes("로그인")) router.replace(`/pick/${slug}?reason=session`);
      else setError(message);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [router, slug]);

  useEffect(() => { void load(); }, [load]);
  return { me, loading, error, load };
}

export function personSelectionSyncStatus(sync: { status: string; pendingCount: number; lastSavedAt: string | null }) {
  if (sync.status === "saved") return sync.lastSavedAt ? "저장됨 · 방금" : "저장됨";
  if (sync.status === "saving") return "저장 중…";
  if (sync.status === "waiting") return `저장 안 된 변경 ${sync.pendingCount}건 · 잠시 후 저장`;
  if (sync.status === "retrying") return `저장 안 된 변경 ${sync.pendingCount}건 · 잠시 후 자동 저장`;
  return `저장 안 된 변경 ${sync.pendingCount}건 · 다시 시도`;
}

export function usePendingPersonChoiceSyncCount(slug: string) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    let next = 0;
    try {
      const prefix = `person-select-choice-sync:${slug}:`;
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        next += parsePersistedSelectionSyncQueue(localStorage.getItem(key))?.diffs.length ?? 0;
      }
    } catch {
      // 저장소 제한 환경에서는 현재 화면 큐 상태로만 제출을 보호한다.
    }
    setCount(next);
  }, [slug]);

  useEffect(() => {
    refresh();
    window.addEventListener(SELECTION_SYNC_STORAGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SELECTION_SYNC_STORAGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);
  return count;
}
