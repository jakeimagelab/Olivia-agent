"use client";

import { useState } from "react";
import GlobalHeader from "@/components/GlobalHeader";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import ContiCreateScreen from "@/components/conti/v2/ContiCreateScreen";
import ContiResultTable from "@/components/conti/v2/ContiResultTable";
import ContiFieldView from "@/components/conti/v2/ContiFieldView";

type ResultView = "table" | "field";

// 신규 결정론적 콘티 생성 시스템의 임시 진입점. 기존 /conti(ContiBuilder, 자유생성 GPT)는
// 그대로 둔 채 별도 경로에서 검증한다 — 확인되면 이 화면이 /conti를 대체한다.
export default function ContiV2Page() {
  const [runId, setRunId] = useState<string | null>(null);
  const [view, setView] = useState<ResultView>("table");

  return (
    <div style={{ minHeight: "100vh", background: "#F4F1EB" }}>
      <GlobalHeader title="콘티 (신규)" description="체크 → AI 초안 → 사람이 마무리하는 콘티 생성 — 검증용 임시 경로입니다." />
      <div style={{ padding: "20px 24px 60px" }}>
        {runId ? (
          <>
            <div style={{ marginBottom: 14 }}>
              <SegmentedTabs
                ariaLabel="결과 보기 방식"
                value={view}
                onChange={setView}
                items={[
                  { value: "table", label: "결과 표" },
                  { value: "field", label: "현장뷰" },
                ]}
              />
            </div>
            {view === "table" ? (
              <ContiResultTable runId={runId} onBack={() => setRunId(null)} />
            ) : (
              <ContiFieldView runId={runId} onBack={() => setView("table")} />
            )}
          </>
        ) : (
          <ContiCreateScreen onGenerated={setRunId} />
        )}
      </div>
    </div>
  );
}
