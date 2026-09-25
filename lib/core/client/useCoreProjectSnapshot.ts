"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoreProjectSnapshot } from "@/lib/core/readModels/types";
import {
  coreSnapshotUpdatedWorkflowRunId,
  OLIVIA_CORE_SNAPSHOT_UPDATED_EVENT,
} from "@/lib/core/client/projectSnapshotEvents";

export type UseCoreProjectSnapshotResult = {
  snapshot?: CoreProjectSnapshot;
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
};

type SnapshotResponse = {
  ok?: boolean;
  snapshot?: CoreProjectSnapshot;
  error?: string;
};

export function useCoreProjectSnapshot(
  workflowRunId?: string,
): UseCoreProjectSnapshotResult {
  const [snapshot, setSnapshot] = useState<CoreProjectSnapshot>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const requestRef = useRef<{ sequence: number; controller?: AbortController }>({ sequence: 0 });

  const refresh = useCallback(async () => {
    const targetId = workflowRunId?.trim();
    requestRef.current.controller?.abort();
    const sequence = requestRef.current.sequence + 1;
    if (!targetId) {
      requestRef.current = { sequence };
      setSnapshot(undefined);
      setLoading(false);
      setError(undefined);
      return;
    }

    const controller = new AbortController();
    requestRef.current = { sequence, controller };
    setSnapshot((current) => current?.project.workflowRunId === targetId ? current : undefined);
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/core/workflows/${encodeURIComponent(targetId)}/snapshot`,
        { cache: "no-store", signal: controller.signal },
      );
      const body = await response.json().catch(() => null) as SnapshotResponse | null;
      if (!response.ok || !body?.ok || !body.snapshot) {
        throw new Error(body?.error || "프로젝트 상태를 불러오지 못했습니다.");
      }
      if (requestRef.current.sequence !== sequence || controller.signal.aborted) return;
      setSnapshot(body.snapshot);
    } catch (caught) {
      if (controller.signal.aborted || requestRef.current.sequence !== sequence) return;
      setError(caught instanceof Error ? caught.message : "프로젝트 상태를 불러오지 못했습니다.");
    } finally {
      if (requestRef.current.sequence === sequence && !controller.signal.aborted) setLoading(false);
    }
  }, [workflowRunId]);

  useEffect(() => {
    void refresh();
    return () => requestRef.current.controller?.abort();
  }, [refresh]);

  useEffect(() => {
    const targetId = workflowRunId?.trim();
    if (!targetId) return;
    const onUpdated = (event: Event) => {
      if (coreSnapshotUpdatedWorkflowRunId(event) === targetId) void refresh();
    };
    window.addEventListener(OLIVIA_CORE_SNAPSHOT_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(OLIVIA_CORE_SNAPSHOT_UPDATED_EVENT, onUpdated);
  }, [refresh, workflowRunId]);

  return { snapshot, loading, error, refresh };
}
