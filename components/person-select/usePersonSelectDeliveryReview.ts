"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  loadPersonSelectDeliveries,
  loadPersonSelectDeliveryDownloadUrls,
  submitPersonSelectDeliveries,
  updatePersonSelectDelivery,
} from "@/components/person-select/personSelectDeliveryClient";
import type { PersonSelectDeliveryResponse } from "@/components/person-select/personSelectDeliveryTypes";

function savePersonSelectDeliveryBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function usePersonSelectDeliveryReview({
  apiBase,
  title,
}: {
  apiBase: string;
  title: string;
}) {
  const [data, setData] = useState<PersonSelectDeliveryResponse | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [downloadState, setDownloadState] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadPersonSelectDeliveries(apiBase);
      setData(next);
      setFocusedId((current) => (
        current && next.items.some((item) => item.id === current)
          ? current
          : next.items[0]?.id ?? null
      ));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "보정본을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { void load(); }, [load]);
  const focused = data?.items.find((item) => item.id === focusedId) ?? null;
  useEffect(() => { setMemo(focused?.customer_memo ?? ""); }, [focused?.customer_memo, focused?.id]);

  const counts = useMemo(() => {
    const items = data?.items ?? [];
    return {
      total: items.length,
      approved: items.filter((item) => item.status === "approved").length,
      revision: items.filter((item) => item.status === "revision_requested").length,
    };
  }, [data?.items]);

  const updateItem = useCallback(async (action: "approve" | "request_revision") => {
    if (!focused || !data || data.access.state === "approved") return;
    if (action === "request_revision" && !memo.trim()) {
      setError("수정 요청 내용을 적어 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updatePersonSelectDelivery({ apiBase, deliveryId: focused.id, action, memo });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "검토 상태를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, [apiBase, data, focused, load, memo]);

  const submit = useCallback(async (action: "submit_revisions" | "finalize") => {
    const prompt = action === "finalize"
      ? "모든 보정본을 최종 확인할까요? 최종 확인 후에는 수정 요청을 바꿀 수 없습니다."
      : `수정 요청 ${counts.revision}장을 포토클리닉에 보낼까요?`;
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    try {
      await submitPersonSelectDeliveries(apiBase, action);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "제출하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, [apiBase, counts.revision, load]);

  const downloadOne = useCallback(async () => {
    if (!focused) return;
    setBusy(true);
    setError("");
    setDownloadState("원본 주소를 준비하고 있어요.");
    try {
      const result = await loadPersonSelectDeliveryDownloadUrls(apiBase);
      const file = result.files.find((item) => item.id === focused.id);
      if (!file) throw new Error("이 사진의 원본을 찾지 못했습니다.");
      const response = await fetch(file.url);
      if (!response.ok) throw new Error("원본 사진을 내려받지 못했습니다.");
      savePersonSelectDeliveryBlob(await response.blob(), file.fileName);
      setDownloadState("다운로드를 시작했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "다운로드하지 못했습니다.");
      setDownloadState("");
    } finally {
      setBusy(false);
    }
  }, [apiBase, focused]);

  const downloadZip = useCallback(async () => {
    setBusy(true);
    setError("");
    setDownloadState("전체 보정본을 준비하고 있어요.");
    try {
      const result = await loadPersonSelectDeliveryDownloadUrls(apiBase);
      const files: Record<string, Uint8Array> = {};
      const usedNames = new Set<string>();
      for (let index = 0; index < result.files.length; index += 1) {
        const file = result.files[index];
        setDownloadState(`${index + 1} / ${result.files.length}장 받는 중`);
        const response = await fetch(file.url);
        if (!response.ok) throw new Error(`${file.fileName} 다운로드에 실패했습니다.`);
        const dot = file.fileName.lastIndexOf(".");
        const stem = dot > 0 ? file.fileName.slice(0, dot) : file.fileName;
        const extension = dot > 0 ? file.fileName.slice(dot) : "";
        let zipName = file.fileName;
        let suffix = 2;
        while (usedNames.has(zipName.toLocaleLowerCase("ko-KR"))) {
          zipName = `${stem} (${suffix++})${extension}`;
        }
        usedNames.add(zipName.toLocaleLowerCase("ko-KR"));
        files[zipName] = new Uint8Array(await response.arrayBuffer());
      }
      const { zipSync } = await import("fflate");
      savePersonSelectDeliveryBlob(
        new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: "application/zip" }),
        `${data?.event.title || title}_보정본.zip`,
      );
      setDownloadState("전체 다운로드를 시작했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "전체 파일을 다운로드하지 못했습니다.");
      setDownloadState("");
    } finally {
      setBusy(false);
    }
  }, [apiBase, data?.event.title, title]);

  return {
    data,
    focusedId,
    setFocusedId,
    focused,
    memo,
    setMemo,
    loading,
    busy,
    error,
    fullscreen,
    setFullscreen,
    downloadState,
    counts,
    load,
    updateItem,
    submit,
    downloadOne,
    downloadZip,
  };
}
