"use client";

import { useCallback, useEffect, useState } from "react";

import type { CustomerSelectionMatchResult } from "@/lib/select-gallery/customerBridge";
import type { PublicPhotoQualityResult } from "@/lib/photo-quality/types";

export type OliviaBridgeQualityResponse = {
  ok?: boolean;
  results?: PublicPhotoQualityResult[];
  job?: Record<string, unknown>;
  error?: string;
};

type UseOliviaBridgeQualityAnalysisOptions = {
  eventId?: string;
  match?: CustomerSelectionMatchResult;
};

function mapQualityResults(
  results: readonly PublicPhotoQualityResult[],
  match: CustomerSelectionMatchResult,
) {
  return Object.fromEntries(results.flatMap((result) => {
    const bridgeId = match.bridgeIdByImageId[result.imageId];
    return bridgeId ? [[bridgeId, result]] : [];
  }));
}

export function useOliviaBridgeQualityAnalysis({
  eventId,
  match,
}: UseOliviaBridgeQualityAnalysisOptions) {
  const [qualityByBridgeId, setQualityByBridgeId] = useState<Record<string, PublicPhotoQualityResult>>({});
  const [qualityJob, setQualityJob] = useState<Record<string, unknown> | null>(null);
  const [qualityMessage, setQualityMessage] = useState("");

  const installQualitySnapshot = useCallback((
    results: readonly PublicPhotoQualityResult[],
    job: Record<string, unknown> | null,
    snapshotMatch: CustomerSelectionMatchResult,
  ) => {
    setQualityByBridgeId(mapQualityResults(results, snapshotMatch));
    setQualityJob(job);
    setQualityMessage("");
  }, []);

  const installQualityError = useCallback((message: string) => {
    setQualityByBridgeId({});
    setQualityJob(null);
    setQualityMessage(message);
  }, []);

  const startLinkedQualityAnalysis = useCallback(async () => {
    if (!eventId) return;
    if (!window.confirm("AI 품질 검사를 위해 1024px 이하 경량 미리보기를 OpenAI API로 전송합니다. 원본 파일은 전송하지 않습니다. 계속할까요?")) return;
    setQualityMessage("AI 품질 검사를 준비하는 중입니다.");
    const response = await fetch(`/api/person-select/${eventId}/quality`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consentAccepted: true }),
    });
    const body = await response.json().catch(() => ({})) as OliviaBridgeQualityResponse;
    if (!response.ok || !body.ok) {
      setQualityMessage(body.error || "AI 품질 검사를 시작하지 못했습니다.");
      return;
    }
    setQualityJob(body.job ?? null);
    setQualityMessage("Mac Studio에서 검사를 시작했습니다. 다른 앱을 사용해도 계속 진행됩니다.");
  }, [eventId]);

  const controlLinkedQualityAnalysis = useCallback(async (action: "pause" | "resume" | "retry") => {
    if (!eventId) return;
    const response = await fetch(`/api/person-select/${eventId}/quality`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await response.json().catch(() => ({})) as OliviaBridgeQualityResponse;
    if (!response.ok || !body.ok) {
      setQualityMessage(body.error || "AI 검사 상태를 바꾸지 못했습니다.");
      return;
    }
    setQualityJob(body.job ?? null);
    setQualityMessage(action === "pause"
      ? "AI 검사를 일시정지했습니다."
      : action === "resume"
        ? "AI 검사를 이어서 진행합니다."
        : "실패한 사진만 다시 검사합니다.");
  }, [eventId]);

  useEffect(() => {
    if (!eventId || !match || !qualityJob || !["queued", "running"].includes(String(qualityJob.status ?? ""))) return;
    let stopped = false;
    let inFlight = false;
    const refresh = async () => {
      if (stopped || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const response = await fetch(`/api/person-select/${eventId}/quality?jobOnly=1`, { cache: "no-store" });
        const body = await response.json().catch(() => ({})) as OliviaBridgeQualityResponse;
        if (!response.ok || !body.ok) return;
        setQualityJob(body.job ?? null);
        if (["queued", "running"].includes(String(body.job?.status ?? ""))) return;

        const resultResponse = await fetch(`/api/person-select/${eventId}/quality`, { cache: "no-store" });
        const resultBody = await resultResponse.json().catch(() => ({})) as OliviaBridgeQualityResponse;
        if (!resultResponse.ok || !resultBody.ok) return;
        setQualityByBridgeId(mapQualityResults(resultBody.results ?? [], match));
        setQualityJob(resultBody.job ?? null);
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [eventId, match, qualityJob]);

  return {
    qualityByBridgeId,
    qualityJob,
    qualityMessage,
    installQualitySnapshot,
    installQualityError,
    startLinkedQualityAnalysis,
    controlLinkedQualityAnalysis,
  };
}
