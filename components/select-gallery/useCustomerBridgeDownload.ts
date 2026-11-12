"use client";

import { useCallback, useState } from "react";

export type CustomerBridgeDownloadFormat = "jpg" | "raw";

export function customerBridgeDownloadProgress(completed: unknown, total: unknown) {
  return `${Number(completed ?? 0).toLocaleString("ko-KR")} / ${Number(total ?? 0).toLocaleString("ko-KR")}장 준비`;
}

function createDownloadRequestKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `download_${crypto.randomUUID()}`;
  return `download_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function useCustomerBridgeDownload({
  endpointBase,
  readOnly,
  pendingCount,
  selectedIds,
}: {
  endpointBase: string;
  readOnly: boolean;
  pendingCount: number;
  selectedIds: ReadonlySet<string>;
}) {
  const [downloadState, setDownloadState] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);

  const downloadSelected = useCallback(async (format: CustomerBridgeDownloadFormat) => {
    if (readOnly || downloadBusy || pendingCount || !selectedIds.size) return;
    setDownloadBusy(true);
    setDownloadState(`${format.toUpperCase()} 원본 다운로드를 준비하는 중입니다.`);
    try {
      const response = await fetch(`${endpointBase}/downloads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: [...selectedIds], format, requestKey: createDownloadRequestKey() }),
      });
      const created = await response.json().catch(() => ({}));
      if (!response.ok || !created.ok) throw new Error(created.error || "다운로드 작업을 만들지 못했습니다.");
      const jobId = String(created.job?.id ?? "");
      if (!jobId) throw new Error("다운로드 작업 ID가 없습니다.");
      for (let attempt = 0; attempt < 600; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const statusResponse = await fetch(`${endpointBase}/downloads?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" });
        const status = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok || !status.ok) throw new Error(status.error || "다운로드 상태를 확인하지 못했습니다.");
        setDownloadState(customerBridgeDownloadProgress(
          status.job?.completed_count,
          status.job?.total_count ?? selectedIds.size,
        ));
        if (status.downloadUrl) {
          window.location.assign(String(status.downloadUrl));
          setDownloadState("다운로드를 시작했습니다.");
          return;
        }
        if (["failed", "canceled", "expired"].includes(String(status.job?.status ?? ""))) {
          throw new Error(status.job?.error || "다운로드 준비에 실패했습니다.");
        }
      }
      throw new Error("다운로드 준비 시간이 초과됐습니다. 잠시 뒤 다시 시도해 주세요.");
    } catch (error) {
      setDownloadState(error instanceof Error ? error.message : "다운로드에 실패했습니다.");
    } finally {
      setDownloadBusy(false);
    }
  }, [downloadBusy, endpointBase, pendingCount, readOnly, selectedIds]);

  return { downloadState, downloadBusy, downloadSelected };
}
