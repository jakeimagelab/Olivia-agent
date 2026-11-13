"use client";

import { useCallback, useState } from "react";

import { resolveRemoteJobResult, useRemoteJobPoller } from "@/components/person-select/admin/hooks/useRemoteJobPoller";
import { readApiResponse } from "@/lib/http/apiResponse";

export function personSelectDeliveryAssignmentPayload(isShared: boolean, value: string) {
  return isShared ? { groupLabel: value } : { personId: value };
}

export function personSelectDeliveryOwnerPayload(action: "reopen" | "extend", personId?: string) {
  return action === "reopen" ? { action: "reopen", personId } : { personId };
}

export function usePersonSelectDeliveryImportController({
  eventId,
  isShared,
  path,
  load,
  setMessage,
}: {
  eventId: string;
  isShared: boolean;
  path: string;
  load: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [deliveryJobId, setDeliveryJobId] = useState("");
  const [deliveryResult, setDeliveryResult] = useState<Record<string, unknown> | null>(null);
  const [deliveryAssignments, setDeliveryAssignments] = useState<Record<string, string>>({});

  useRemoteJobPoller({
    jobId: deliveryJobId,
    label: "보정본 가져오기 상태",
    onTerminal: async (job) => {
      const nextResult = resolveRemoteJobResult(job, "보정본 가져오기에 실패했습니다.");
      setDeliveryResult(nextResult);
      if (job.status !== "COMPLETED") {
        setMessage(`보정본 가져오기 실패: ${String(nextResult.error ?? job.error ?? "작업 결과를 확인해 주세요.")}`);
      }
      setDeliveryJobId("");
      await load();
    },
  });

  const startDeliveryImport = useCallback(async () => {
    if (!path) {
      setMessage("Mac Studio의 보정본 폴더를 선택해 주세요.");
      return;
    }
    setMessage("");
    setDeliveryResult(null);
    try {
      const response = await fetch(`/api/person-select/${eventId}/deliveries/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: path }),
      });
      const body = await readApiResponse<{ job?: { id?: string } }>(response, "보정본 가져오기");
      setDeliveryJobId(body.job?.id ?? "");
      setDeliveryResult({ message: "보정본 원본과 미리보기를 안전하게 올리고 있어요." });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "보정본 가져오기를 시작하지 못했습니다.");
    }
  }, [eventId, path, setMessage]);

  const assignDelivery = useCallback(async (deliveryId: string) => {
    const value = deliveryAssignments[deliveryId]?.trim() ?? "";
    if (!value) {
      setMessage(isShared ? "연결할 폴더 이름을 입력해 주세요." : "연결할 고객을 선택해 주세요.");
      return;
    }
    try {
      const response = await fetch(`/api/person-select/${eventId}/deliveries/${deliveryId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(personSelectDeliveryAssignmentPayload(isShared, value)),
      });
      await readApiResponse(response, "보정본 연결");
      setDeliveryAssignments((current) => {
        const next = { ...current };
        delete next[deliveryId];
        return next;
      });
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "보정본 연결을 저장하지 못했습니다.");
    }
  }, [deliveryAssignments, eventId, isShared, load, setMessage]);

  const changeDeliveryOwner = useCallback(async (action: "reopen" | "extend", personId?: string) => {
    try {
      const endpoint = action === "reopen" ? "state" : "retention";
      const response = await fetch(`/api/person-select/${eventId}/deliveries/${endpoint}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(personSelectDeliveryOwnerPayload(action, personId)),
      });
      await readApiResponse(response, action === "reopen" ? "보정본 다시 열기" : "보관 기간 연장");
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "보정본 상태를 바꾸지 못했습니다.");
    }
  }, [eventId, load, setMessage]);

  const updateDeliveryAssignment = useCallback((deliveryId: string, value: string) => {
    setDeliveryAssignments((current) => ({ ...current, [deliveryId]: value }));
  }, []);

  return {
    deliveryJobId,
    deliveryResult,
    deliveryAssignments,
    startDeliveryImport,
    assignDelivery,
    changeDeliveryOwner,
    updateDeliveryAssignment,
  };
}
