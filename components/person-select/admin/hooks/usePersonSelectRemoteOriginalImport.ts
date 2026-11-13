"use client";

import { useCallback, useState } from "react";

import { resolveRemoteJobResult, useRemoteJobPoller } from "@/components/person-select/admin/hooks/useRemoteJobPoller";
import { readApiResponse } from "@/lib/http/apiResponse";
import type { PersonSelectImportLayout } from "@/lib/person-select/localImport";

export function usePersonSelectRemoteOriginalImport({
  eventId,
  layout,
  path,
  load,
  onComplete,
  setMessage,
  setResult,
}: {
  eventId: string;
  layout: PersonSelectImportLayout;
  path: string;
  load: () => Promise<void>;
  onComplete: () => void;
  setMessage: (message: string) => void;
  setResult: (result: Record<string, unknown> | null) => void;
}) {
  const [jobId, setJobId] = useState("");

  useRemoteJobPoller({
    jobId,
    label: "사진 가져오기 상태",
    onTerminal: async (job) => {
      setResult(resolveRemoteJobResult(job));
      setJobId("");
      await load();
      if (job.status === "COMPLETED") onComplete();
    },
  });

  const startRemoteImport = useCallback(async () => {
    if (!path) {
      setMessage(layout === "school" ? "학교전달 폴더를 선택해 주세요." : "촬영 폴더를 선택해 주세요.");
      return;
    }
    setMessage("");
    setResult(null);
    try {
      const payload = layout === "school"
        ? {
            event_id: eventId,
            source_relative_path: path,
            mappings: [
              { folder: "선생님프로필", category: "profile", owner: "person" },
              { folder: "담임선생님", category: "homeroom", owner: "group" },
            ],
          }
        : { event_id: eventId, source_relative_path: path, layout };
      const response = await fetch("/api/remote-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PERSON_SELECT_IMPORT", payload }),
      });
      const body = await readApiResponse<{ job?: { id?: string }; id?: string }>(response, "사진 가져오기");
      setJobId(body.job?.id || body.id || "");
      setResult({ message: "사진 가져오기를 시작했어요." });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "사진 가져오기를 시작하지 못했습니다.");
    }
  }, [eventId, layout, path, setMessage, setResult]);

  return { jobId, startRemoteImport };
}
