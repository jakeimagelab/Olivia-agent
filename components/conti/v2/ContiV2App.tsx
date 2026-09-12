"use client";

import { useEffect, useState } from "react";
import ContiCreateScreen from "@/components/conti/v2/ContiCreateScreen";
import ContiEditorWorkspace from "@/components/conti/v2/ContiEditorWorkspace";
import ContiFieldView from "@/components/conti/v2/ContiFieldView";
import { useContiStudio } from "@/components/conti/v2/useContiStudio";
import styles from "@/components/conti/v2/ContiV2.module.css";

type ResultView = "table" | "field";
type RetainedWorkspaceState = { runId: string; view: ResultView };

// DynamicWorkspace는 split/fullscreen 전환 때 Builder를 다른 트리로 옮기며 다시 마운트한다.
// 같은 브라우저 작업 중인 활성 콘티만 모듈 메모리에 보존하고, 명시적으로 닫거나 입력
// 화면으로 돌아갈 때 지운다. DB와 별개의 두 번째 문서 상태를 만들지는 않는다.
const retainedWorkspaces = new Map<string, RetainedWorkspaceState>();

function workspaceKey(clientId?: string, workflowRunId?: string, resourceId?: string) {
  return [clientId || "new-client", workflowRunId || "new-workflow", resourceId || "new-resource"].join(":");
}

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
  const persistenceKey = workspaceKey(clientId, workflowRunId, resourceId);
  const retained = retainedWorkspaces.get(persistenceKey);
  const [runId, setRunId] = useState<string | null>(() => retained?.runId ?? null);
  const [view, setView] = useState<ResultView>(() => retained?.view ?? "table");
  const [legacyResourceId, setLegacyResourceId] = useState<string | undefined>(resourceId);
  const [resolvingInitial, setResolvingInitial] = useState(Boolean(!retained && (resourceId || workflowRunId)));
  const controller = useContiStudio(runId);

  useEffect(() => {
    if (!registerRequestClose || !onClose) return;
    registerRequestClose(() => {
      retainedWorkspaces.delete(persistenceKey);
      onClose();
    });
  }, [onClose, persistenceKey, registerRequestClose]);

  useEffect(() => {
    if (runId) retainedWorkspaces.set(persistenceKey, { runId, view });
  }, [persistenceKey, runId, view]);

  useEffect(() => {
    if (retainedWorkspaces.has(persistenceKey)) { setResolvingInitial(false); return; }
    if (!resourceId && !workflowRunId) { setResolvingInitial(false); return; }
    const query = new URLSearchParams();
    if (resourceId) query.set("resourceId", resourceId);
    if (workflowRunId) query.set("workflowRunId", workflowRunId);
    if (clientId) query.set("clientId", clientId);
    fetch(`/api/conti/runs?${query.toString()}`).then((response) => response.json()).then((data) => {
      if (data.ok && data.run?.id) {
        setLegacyResourceId(undefined);
        setRunId(data.run.id);
      }
    }).catch(() => {}).finally(() => setResolvingInitial(false));
  }, [clientId, persistenceKey, resourceId, workflowRunId]);

  const handleGenerated = (id: string) => {
    retainedWorkspaces.set(persistenceKey, { runId: id, view: "table" });
    setLegacyResourceId(undefined);
    setRunId(id);
    setView("table");
    onPublished?.();
  };

  const openRun = (id: string) => {
    retainedWorkspaces.set(persistenceKey, { runId: id, view: "table" });
    setLegacyResourceId(undefined);
    setRunId(id);
    setView("table");
  };

  const returnToCreate = () => {
    void controller.flushSave();
    retainedWorkspaces.delete(persistenceKey);
    setRunId(null);
    setView("table");
  };

  if (resolvingInitial || (runId && controller.loading)) return <div className={styles.studioLoading}>콘티 스튜디오를 준비하는 중…</div>;

  return (
    <div className={styles.appShell}>
      {runId ? (
        <>
          {view === "table" ? (
            <ContiEditorWorkspace
              controller={controller}
              clientId={clientId}
              workflowRunId={workflowRunId}
              onBack={returnToCreate}
              onOpenField={() => setView("field")}
              onOpenRun={(id) => { void controller.flushSave(); openRun(id); }}
              onPublished={onPublished}
            />
          ) : (
            <ContiFieldView controller={controller} onBack={() => setView("table")} />
          )}
        </>
      ) : (
        <ContiCreateScreen onGenerated={handleGenerated} onOpenExisting={openRun} initialClientId={clientId} workflowRunId={workflowRunId} resourceId={legacyResourceId} />
      )}
    </div>
  );
}
