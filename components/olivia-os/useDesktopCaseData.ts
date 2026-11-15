"use client";

import { useEffect, useState } from "react";
import { useOliviaDesktopStore, type WindowContext } from "@/lib/store/useOliviaDesktopStore";

const DESKTOP_CASE_APPS = new Set(["quote", "conti", "select-galleries"]);

export type DesktopCasePayload = {
  ok?: boolean;
  client?: { id?: string; name?: string; hospital_name?: string; department?: string };
  workflowRun?: { id?: string; project_name?: string; current_step_key?: string; status?: string };
  workflowCheckProgress?: { done?: number; total?: number } | null;
  resourceIds?: { quote?: string | null; conti?: string | null };
};

export type DesktopCaseGallery = {
  id: string;
  title?: string | null;
  workflow_run_id?: string | null;
};

type DesktopCaseLoadState = "idle" | "loading" | "ready" | "error";

export function resolveDesktopCaseTarget(appId: string, context?: WindowContext) {
  const clientId = context?.clientId;
  const workflowRunId = context?.workflowRunId ?? context?.projectId;
  const requested = Boolean(
    clientId
    && workflowRunId
    && DESKTOP_CASE_APPS.has(appId)
    && (context?.launchIntent === "client-new" || context?.launchIntent === "document" || context?.targetVerified),
  );
  return { clientId, workflowRunId, requested };
}

export function useDesktopCaseData(appId: string, context?: WindowContext) {
  const updateWindowContext = useOliviaDesktopStore((state) => state.updateWindowContext);
  const [detail, setDetail] = useState<DesktopCasePayload | null>(null);
  const [galleries, setGalleries] = useState<DesktopCaseGallery[]>([]);
  const [loadState, setLoadState] = useState<DesktopCaseLoadState>("idle");
  const { clientId, workflowRunId, requested } = resolveDesktopCaseTarget(appId, context);

  useEffect(() => {
    if (!requested || !clientId || !workflowRunId) {
      setDetail(null);
      setGalleries([]);
      setLoadState("idle");
      return;
    }

    let active = true;
    setDetail(null);
    setGalleries([]);
    setLoadState("loading");

    Promise.all([
      fetch(`/api/clients/${encodeURIComponent(clientId)}?workflowRunId=${encodeURIComponent(workflowRunId)}&strictWorkflowRunId=1`, { cache: "no-store" })
        .then((response) => response.json() as Promise<DesktopCasePayload>),
      fetch(`/api/select-galleries?workflowRunId=${encodeURIComponent(workflowRunId)}`, { cache: "no-store" })
        .then((response) => response.json() as Promise<{ ok?: boolean; galleries?: DesktopCaseGallery[] }>),
    ]).then(([clientPayload, galleryPayload]) => {
      if (!active) return;
      const clientMatches = clientPayload.client?.id === clientId;
      const runMatches = clientPayload.workflowRun?.id === workflowRunId;
      if (!clientPayload.ok || !clientMatches || !runMatches) {
        setLoadState("error");
        return;
      }

      setDetail(clientPayload);
      setGalleries((galleryPayload.ok ? galleryPayload.galleries ?? [] : [])
        .filter((gallery) => gallery.workflow_run_id === workflowRunId));
      setLoadState("ready");

      const latest = useOliviaDesktopStore.getState().windows[appId]?.context;
      const latestRunId = latest?.workflowRunId ?? latest?.projectId;
      if (latest?.clientId === clientId && latestRunId === workflowRunId && !latest.targetVerified) {
        updateWindowContext(appId, {
          ...latest,
          targetVerified: true,
          clientName: clientPayload.client?.name ?? clientPayload.client?.hospital_name ?? latest.clientName,
          projectName: clientPayload.workflowRun?.project_name ?? latest.projectName,
        });
      }
    }).catch(() => {
      if (active) setLoadState("error");
    });

    return () => {
      active = false;
    };
  }, [appId, clientId, requested, updateWindowContext, workflowRunId]);

  return {
    clientId,
    workflowRunId,
    detail,
    galleries,
    loadState,
    enabled: requested && loadState === "ready",
  };
}
