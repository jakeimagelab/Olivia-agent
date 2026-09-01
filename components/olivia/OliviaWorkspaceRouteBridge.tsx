"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import DynamicWorkspace from "@/components/workspace/DynamicWorkspace";
import { useOliviaChatDockStore } from "@/lib/store/useOliviaChatDockStore";
import { getWorkspaceLayoutWeight, useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import { useWorkspaceStore, type WorkspaceType } from "@/lib/store/workspaceStore";

const spring = { type: "spring" as const, stiffness: 230, damping: 28, mass: 0.85 };

// Olivia Agent 2.0 Phase 1 — /photoclinic, /contract, /conti(그리고 sync 전용으로
// /photo-sorting)가 렌더링하는 얇은 다리. 두 가지 일을 한다:
// (1) URL 쿼리를 useWorkspaceStore에 동기화해서 채팅으로 연 것과 똑같은 store 상태를 만든다
//     (app/admin/tools/[tool]/page.tsx가 이미 clientId/workflowRunId/projectId/stepKey를
//     이 쿼리 파라미터로 넘겨준다).
// (2) renderSplitView가 true면 홈의 워크스페이스 모드와 시각적으로 동일한 70/30 스플릿
//     (DynamicWorkspace + 채팅 슬롯)을 이 페이지 트리 안에서 직접 그린다 — 루트 레이아웃이
//     아니라 여기서 그려야 GlobalFeatureSidebar가 이미 그리고 있는 사이드바와 겹치거나
//     중복되지 않는다. 채팅 자체는 OliviaWorkspaceShell이 소유한 단일 인스턴스를 이 슬롯
//     노드에 portal로 꽂아 넣는다(useOliviaChatDockStore) — 그래서 홈 ↔ 이 라우트를 오가도
//     채팅이 재마운트되지 않는다.
export default function OliviaWorkspaceRouteBridge({
  workspaceType,
  renderSplitView = true,
}: {
  workspaceType: Exclude<WorkspaceType, null>;
  renderSplitView?: boolean;
}) {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("clientId") ?? undefined;
  const workflowRunId = searchParams.get("workflowRunId") ?? searchParams.get("projectId") ?? undefined;
  const resourceId = searchParams.get("resourceId") ?? searchParams.get("stepKey") ?? undefined;
  const layoutMode = useOliviaLayoutStore((s) => s.mode);
  const setDockNode = useOliviaChatDockStore((s) => s.setNode);

  useEffect(() => {
    const store = useWorkspaceStore.getState();
    // 전체화면 중이면 방해하지 않는다 — 이미 이 워크스페이스를 전체화면으로 보고 있는데
    // 쿼리 파라미터가 살짝 바뀌었다고 다시 split 모드로 되돌리면 안 된다.
    if (store.type === workspaceType && store.mode === "fullscreen") return;
    if (store.type === workspaceType) {
      store.switchWorkspace(workspaceType, { clientId, workflowRunId, resourceId, openedBy: "route" });
    } else {
      store.openWorkspace(workspaceType, { clientId, workflowRunId, resourceId, openedBy: "route" });
    }
  }, [workspaceType, clientId, workflowRunId, resourceId]);

  if (!renderSplitView) return null;

  const weights = getWorkspaceLayoutWeight({ mode: layoutMode, chatFocused: false, workspaceFocused: false, streaming: false });

  return (
    <div className="olivia-workspace-shell">
      <motion.div layout transition={spring} className="olivia-workspace-shell__viewport" style={{ flexGrow: weights.workspace }}>
        <DynamicWorkspace />
      </motion.div>
      <motion.div layout transition={spring} className="olivia-workspace-shell__chat" style={{ flexGrow: weights.chat }}>
        <div className="olivia-workspace-shell__chat-slot" ref={(el) => setDockNode(el)} />
      </motion.div>
    </div>
  );
}
