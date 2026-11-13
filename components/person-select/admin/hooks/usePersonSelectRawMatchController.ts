"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { resolveRemoteJobResult, useRemoteJobPoller } from "@/components/person-select/admin/hooks/useRemoteJobPoller";
import type { PersonSelectAdminData } from "@/lib/person-select/adminData";
import {
  PERSON_SELECT_RAW_LABEL_NAMES,
  resolvePersonSelectRawMatchPathPlan,
  type PersonSelectRawLabelNames,
  type PersonSelectRawMatchMode,
  type PersonSelectRawMatchSource,
} from "@/lib/person-select/rawMatch";
import { resolvePersonSelectAdminRawMatchModel } from "@/lib/person-select/rawMatchAdmin";
import { readApiResponse } from "@/lib/http/apiResponse";

export function usePersonSelectRawMatchController({
  eventId,
  data,
  isShared,
  workerOnline,
  load,
  setMessage,
}: {
  eventId: string;
  data: PersonSelectAdminData | null;
  isShared: boolean;
  workerOnline: boolean | null;
  load: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [rawJobId, setRawJobId] = useState("");
  const [rawResult, setRawResult] = useState<Record<string, unknown> | null>(null);
  const [rawDialogOpen, setRawDialogOpen] = useState(false);
  const [rawMode, setRawMode] = useState<PersonSelectRawMatchMode>("copy");
  const [rawSource, setRawSource] = useState<PersonSelectRawMatchSource>("submitted");
  const [rawLabelNames, setRawLabelNames] = useState<PersonSelectRawLabelNames>({ ...PERSON_SELECT_RAW_LABEL_NAMES });
  const [rawReviewerScope, setRawReviewerScope] = useState("all");
  const rawOptionsLoadedRef = useRef(false);
  const rawOptionsSkipFirstWriteRef = useRef(true);
  const rawSourceSavedRef = useRef(false);

  useEffect(() => {
    rawOptionsLoadedRef.current = false;
    rawOptionsSkipFirstWriteRef.current = true;
    rawSourceSavedRef.current = false;
    try {
      const raw = localStorage.getItem(`olivia-person-select-raw-options:${eventId}`);
      const stored = JSON.parse(raw ?? "{}") as {
        mode?: PersonSelectRawMatchMode;
        source?: PersonSelectRawMatchSource;
        labelNames?: Partial<Record<"6" | "7" | "8" | "9", string>>;
      };
      if (stored.mode === "copy" || stored.mode === "mark") setRawMode(stored.mode);
      if (stored.source === "submitted" || stored.source === "current") {
        setRawSource(stored.source);
        rawSourceSavedRef.current = true;
      }
      if (stored.labelNames) setRawLabelNames({
        6: stored.labelNames[6]?.trim() || PERSON_SELECT_RAW_LABEL_NAMES[6],
        7: stored.labelNames[7]?.trim() || PERSON_SELECT_RAW_LABEL_NAMES[7],
        8: stored.labelNames[8]?.trim() || PERSON_SELECT_RAW_LABEL_NAMES[8],
        9: stored.labelNames[9]?.trim() || PERSON_SELECT_RAW_LABEL_NAMES[9],
      });
    } catch {
      // 브라우저 저장소가 막힌 환경에서도 기본값으로 계속 진행한다.
    } finally {
      rawOptionsLoadedRef.current = true;
    }
  }, [eventId]);

  useEffect(() => {
    if (!rawOptionsLoadedRef.current) return;
    if (rawOptionsSkipFirstWriteRef.current) {
      rawOptionsSkipFirstWriteRef.current = false;
      return;
    }
    try {
      localStorage.setItem(
        `olivia-person-select-raw-options:${eventId}`,
        JSON.stringify({ mode: rawMode, source: rawSource, labelNames: rawLabelNames }),
      );
    } catch {
      // 저장소 접근 실패는 실행 자체를 막지 않는다.
    }
  }, [eventId, rawLabelNames, rawMode, rawSource]);

  useRemoteJobPoller({
    jobId: rawJobId,
    label: "RAW 매칭 상태",
    onTerminal: async (job) => {
      setRawJobId("");
      setRawResult(resolveRemoteJobResult(job));
      await load();
    },
  });

  const rawMatchModel = useMemo(() => resolvePersonSelectAdminRawMatchModel({
    data,
    isShared,
    source: rawSource,
    reviewerScope: rawReviewerScope,
  }), [data, isShared, rawReviewerScope, rawSource]);
  const rawPreview = rawMatchModel.preview;
  const rawSubmittedAll = rawMatchModel.submittedAll;
  const rawCurrentAll = rawMatchModel.currentAll;
  const hasRawSelection = rawMatchModel.hasSelection;
  const rawBusy = Boolean(rawJobId);
  const rawDisabledReason = !hasRawSelection
    ? "고른 사진이 없어요."
    : !data?.event.source_relative_path
      ? "원본 폴더를 Mac Studio 위치로 연결해 주세요."
      : workerOnline === null
        ? "Mac Studio 상태를 확인하고 있어요."
        : workerOnline === false
          ? "Mac Studio가 꺼져 있어요."
          : "";
  const rawDisabled = rawBusy || Boolean(rawDisabledReason);
  const rawPathPlan = resolvePersonSelectRawMatchPathPlan(
    data?.event.source_relative_path ?? "",
    isShared ? "프로젝트" : "<이름>",
  );
  const displayedRawResult = rawResult ?? data?.event.raw_match_result ?? null;

  function openRawMatchDialog() {
    const defaultSource = rawSubmittedAll.targets.length === 0 && rawCurrentAll.targets.length > 0 ? "current" : "submitted";
    if (!rawSourceSavedRef.current) setRawSource(defaultSource);
    setRawReviewerScope("all");
    setRawDialogOpen(true);
  }

  function changeRawSource(source: PersonSelectRawMatchSource) {
    rawSourceSavedRef.current = true;
    setRawSource(source);
  }

  async function startRawMatch(clearMark = false) {
    setMessage("");
    setRawResult(null);
    const payload = {
      event_id: eventId,
      mode: clearMark ? "mark" : rawMode,
      source: rawSource,
      labelNames: rawLabelNames,
      ...(clearMark ? { clear_mark: true } : {}),
      ...(isShared && rawReviewerScope !== "all" ? { reviewerIds: [rawReviewerScope] } : {}),
    };
    let body: { job?: { id?: string }; id?: string };
    try {
      const response = await fetch("/api/remote-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PERSON_SELECT_RAW_MATCH", payload }),
      });
      body = await readApiResponse(response, "RAW 매칭");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "RAW 매칭을 시작하지 못했습니다.");
      return;
    }
    setRawDialogOpen(false);
    setRawJobId(body.job?.id || body.id || "");
    setRawResult({
      message: clearMark
        ? "로우 셀렉 표시를 이전 값으로 복원하고 있어요."
        : rawMode === "mark"
          ? "고객 별점과 컬러를 원본 RAW의 XMP에 기록하고 있어요."
          : rawSource === "current"
            ? "제출 전 선택을 포함해 RAW 매칭을 시작했어요."
            : "최종 제출본 RAW 매칭을 시작했어요.",
    });
  }

  return {
    rawDialogOpen,
    setRawDialogOpen,
    rawMode,
    setRawMode,
    rawSource,
    changeRawSource,
    rawLabelNames,
    setRawLabelNames,
    rawReviewerScope,
    setRawReviewerScope,
    rawPreview,
    rawBusy,
    rawDisabledReason,
    rawDisabled,
    rawPathPlan,
    displayedRawResult,
    rawResult,
    openRawMatchDialog,
    startRawMatch,
  };
}
