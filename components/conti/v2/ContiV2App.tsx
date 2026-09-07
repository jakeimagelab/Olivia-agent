"use client";

import { useState } from "react";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import ContiCreateScreen from "@/components/conti/v2/ContiCreateScreen";
import ContiResultTable from "@/components/conti/v2/ContiResultTable";
import ContiFieldView from "@/components/conti/v2/ContiFieldView";

type ResultView = "table" | "field";

// 실제 화면 내용. 페이지 제목은 넣지 않는다 — OS 창 안에서는 창 타이틀바가, 독립 페이지에서는
// app/conti-v2/page.tsx의 GlobalHeader가 이름을 보여준다.
export default function ContiV2App() {
  const [runId, setRunId] = useState<string | null>(null);
  const [view, setView] = useState<ResultView>("table");

  return (
    <div style={{ minHeight: "100%", background: "#F4F1EB", padding: "20px 24px 60px" }}>
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
  );
}
