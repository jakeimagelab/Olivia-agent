"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicPhotoQualityResult } from "@/lib/photo-quality/types";

export type CustomerBridgeQualityAction = "pause" | "resume" | "cancel" | "retry";
export type CustomerBridgeQualityReviewStatus = "confirmed_issue" | "confirmed_normal";

export function customerBridgeQualityControlMessage(action: CustomerBridgeQualityAction) {
  if (action === "pause") return "AI 검사를 일시정지했습니다.";
  if (action === "resume") return "AI 검사를 이어서 진행합니다.";
  if (action === "retry") return "실패한 사진만 다시 검사합니다.";
  return "AI 검사를 취소했습니다.";
}

export function useCustomerBridgeQuality({
  qualityApi,
  canManageQuality,
}: {
  qualityApi?: string;
  canManageQuality: boolean;
}) {
  const [qualityResults, setQualityResults] = useState<Record<string, PublicPhotoQualityResult>>({});
  const [qualityJob, setQualityJob] = useState<Record<string, unknown> | null>(null);
  const [qualityState, setQualityState] = useState("");
  const refreshInFlightRef = useRef<Promise<{ job?: Record<string, unknown>; results?: PublicPhotoQualityResult[] } | undefined> | null>(null);

  const loadQuality = useCallback(async (options?: { quiet?: boolean; jobOnly?: boolean }) => {
    if (!qualityApi) return undefined;
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const request = (async () => {
      try {
        const separator = qualityApi.includes("?") ? "&" : "?";
        const response = await fetch(options?.jobOnly ? `${qualityApi}${separator}jobOnly=1` : qualityApi, { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.error || "AI 품질 결과를 불러오지 못했습니다.");
        if (!options?.jobOnly) {
          const next = Object.fromEntries((Array.isArray(result.results) ? result.results : []).map((entry: PublicPhotoQualityResult) => [entry.imageId, entry]));
          setQualityResults(next);
        }
        setQualityJob(result.job ?? null);
        if (!options?.quiet) setQualityState("");
        return result as { job?: Record<string, unknown>; results?: PublicPhotoQualityResult[] };
      } catch (error) {
        if (!options?.quiet) setQualityState(error instanceof Error ? error.message : "AI 품질 결과를 불러오지 못했습니다.");
        return undefined;
      }
    })();
    refreshInFlightRef.current = request;
    try {
      return await request;
    } finally {
      if (refreshInFlightRef.current === request) refreshInFlightRef.current = null;
    }
  }, [qualityApi]);

  useEffect(() => {
    void loadQuality();
  }, [loadQuality]);

  const qualityJobStatus = String(qualityJob?.status ?? "");
  useEffect(() => {
    if (!qualityApi || !["queued", "running"].includes(qualityJobStatus)) return;
    let stopped = false;
    const refresh = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      const result = await loadQuality({ quiet: true, jobOnly: true });
      const status = String(result?.job?.status ?? "");
      if (status && !["queued", "running"].includes(status)) await loadQuality({ quiet: true });
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [loadQuality, qualityApi, qualityJobStatus]);

  const startQuality = useCallback(async () => {
    if (!qualityApi || !canManageQuality) return;
    if (!window.confirm("AI 품질 검사를 위해 1024px 이하 경량 미리보기를 OpenAI API로 전송합니다. 원본 파일은 전송하지 않습니다. 계속할까요?")) return;
    setQualityState("AI 검사를 준비하는 중입니다.");
    try {
      const response = await fetch(qualityApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentAccepted: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "AI 검사를 시작하지 못했습니다.");
      setQualityJob(result.job ?? null);
      setQualityState("AI 검사를 시작했습니다. 다른 화면을 사용해도 Worker에서 계속 진행됩니다.");
    } catch (error) {
      setQualityState(error instanceof Error ? error.message : "AI 검사를 시작하지 못했습니다.");
    }
  }, [canManageQuality, qualityApi]);

  const controlQuality = useCallback(async (action: CustomerBridgeQualityAction) => {
    if (!qualityApi || !canManageQuality) return;
    try {
      const response = await fetch(qualityApi, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "AI 검사 상태를 바꾸지 못했습니다.");
      setQualityJob(result.job ?? null);
      setQualityState(customerBridgeQualityControlMessage(action));
    } catch (error) {
      setQualityState(error instanceof Error ? error.message : "AI 검사 상태를 바꾸지 못했습니다.");
    }
  }, [canManageQuality, qualityApi]);

  const reviewQuality = useCallback(async (imageId: string, reviewStatus: CustomerBridgeQualityReviewStatus) => {
    if (!qualityApi || !canManageQuality) return;
    try {
      const response = await fetch(qualityApi, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, reviewStatus }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "AI 판정 검토를 저장하지 못했습니다.");
      setQualityResults((current) => ({ ...current, [imageId]: result.result }));
    } catch (error) {
      setQualityState(error instanceof Error ? error.message : "AI 판정 검토를 저장하지 못했습니다.");
    }
  }, [canManageQuality, qualityApi]);

  return { qualityResults, qualityJob, qualityState, startQuality, controlQuality, reviewQuality };
}
