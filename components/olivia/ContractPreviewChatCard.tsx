"use client";

import { useEffect, useState } from "react";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";

function formatWon(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

type ContractPreviewData = { hospitalName: string; totalAmount: number };

// 채팅 안 계약서 미리보기 카드 — QuotePreviewChatCard.tsx와 달리 공유 Zustand 스토어를
// 구독하지 않는다. ContractBuilder.tsx는 폼 스토어 없이 로컬 state + "olivia-resource-refresh"
// 이벤트 재구독(전체 재조회)만으로 실시간 반영을 처리하는 구조라(PHASE 3 조사, 2026-08-30),
// 이 카드도 같은 방식(자체 fetch + 같은 이벤트 재구독)을 그대로 따른다 — 폼 스토어를 새로
// 만들지 않고도 "채팅 수정 → 즉시 반영"이 동일하게 동작한다. flowId는 계약서 resourceId다.
export default function ContractPreviewChatCard({ flowId }: { flowId: string }) {
  const [data, setData] = useState<ContractPreviewData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => fetch(`/api/contracts/${flowId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok) return;
        const row = json.data ?? {};
        const quoteData = (row.quote_data && typeof row.quote_data === "object") ? row.quote_data : {};
        setData({
          hospitalName: row.hospital_name || quoteData.hospitalName || "",
          totalAmount: Number(quoteData.totalAmount) || 0,
        });
      })
      .catch(() => {});
    void load();
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ resource?: string; resourceId?: string }>).detail;
      if ((!detail?.resource || detail.resource === "contract") && (!detail?.resourceId || detail.resourceId === flowId)) void load();
    };
    window.addEventListener("olivia-resource-refresh", onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener("olivia-resource-refresh", onRefresh);
    };
  }, [flowId]);

  if (!data) return null;

  return (
    <div className="olivia-quote-preview-card">
      <div className="olivia-quote-preview-card__label">계약서 Preview</div>
      <div className="olivia-quote-preview-card__client">{data.hospitalName || "고객명 미입력"}</div>
      <div className="olivia-quote-preview-card__title">{data.hospitalName ? `${data.hospitalName} 촬영 계약서` : "제목 없음"}</div>
      <div className="olivia-quote-preview-card__total">{formatWon(data.totalAmount)}</div>
      <button
        type="button"
        onClick={() => executeOliviaAction({ type: "SWITCH_WORKSPACE", workspace: "contract", resourceId: flowId })}
      >
        크게 보기
      </button>
    </div>
  );
}
