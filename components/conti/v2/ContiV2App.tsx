"use client";

import { useEffect, useState } from "react";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import ContiCreateScreen from "@/components/conti/v2/ContiCreateScreen";
import ContiResultTable from "@/components/conti/v2/ContiResultTable";
import ContiFieldView from "@/components/conti/v2/ContiFieldView";
import styles from "@/components/conti/v2/ContiV2.module.css";

type ResultView = "table" | "field";

// /conti와 OLIVIA OS 창이 함께 쓰는 단일 콘티 화면.
export interface ContiV2AppProps {
  clientId?: string;
  workflowRunId?: string;
  resourceId?: string;
  onClose?: () => void;
  onPublished?: () => void;
  registerRequestClose?: (fn: () => void) => void;
}

export default function ContiV2App({ clientId, workflowRunId, resourceId, onClose, onPublished, registerRequestClose }: ContiV2AppProps = {}) {
  const [runId, setRunId] = useState<string | null>(null);
  const [view, setView] = useState<ResultView>("table");

  useEffect(() => { if (registerRequestClose && onClose) registerRequestClose(onClose); }, [onClose, registerRequestClose]);

  useEffect(() => {
    if (!resourceId && !workflowRunId) return;
    const query = new URLSearchParams();
    if (resourceId) query.set("resourceId", resourceId);
    if (workflowRunId) query.set("workflowRunId", workflowRunId);
    if (clientId) query.set("clientId", clientId);
    fetch(`/api/conti/runs?${query.toString()}`).then((response) => response.json()).then((data) => {
      if (data.ok && data.run?.id) setRunId(data.run.id);
    }).catch(() => {});
  }, [clientId, resourceId, workflowRunId]);

  const handleGenerated = (id: string) => { setRunId(id); onPublished?.(); };

  return (
    <div className={styles.appShell}>
      {runId ? (
        <>
          <div className={styles.tabsDock}>
            <SegmentedTabs
              ariaLabel="결과 보기 방식"
              value={view}
              onChange={setView}
              items={[
                { value: "table", label: "결과 표" },
                { value: "field", label: "현장 모드" },
              ]}
            />
          </div>
          {view === "table" ? (
            <ContiResultTable runId={runId} onBack={() => setRunId(null)} onOpenField={() => setView("field")} />
          ) : (
            <ContiFieldView runId={runId} onBack={() => setView("table")} />
          )}
        </>
      ) : (
        <ContiCreateScreen onGenerated={handleGenerated} initialClientId={clientId} workflowRunId={workflowRunId} resourceId={resourceId} />
      )}
    </div>
  );
}
