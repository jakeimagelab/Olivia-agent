"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import DynamicWorkspace from "@/components/workspace/DynamicWorkspace";
import OliviaWorkspaceSkeleton from "@/components/workspace/OliviaWorkspaceSkeleton";
import { useWorkspaceStore } from "@/lib/store/workspaceStore";

export function getWorkspaceTransitionKey(type?: string | null, resourceId?: string) {
  return `${type ?? "workspace"}:${resourceId ?? "new"}`;
}

// OPEN_WORKSPACE(ui_action)와 그 전환 애니메이션을 한 곳에 묶는다 — 새 워크스페이스 도구가
// 추가돼도(Phase 1의 갤러리/진단 등) uiActionResolvers.ts에 매핑만 되어 있으면 이 컴포넌트가
// 자동으로 같은 스켈레톤 → 크로스페이드 연출을 태운다. Phase 4.
export default function WorkspaceMorphTransition({
  hasWorkspace,
  pendingWorkspaceOpen,
  pendingLabel,
}: {
  hasWorkspace: boolean;
  pendingWorkspaceOpen: boolean;
  pendingLabel?: string;
}) {
  const type = useWorkspaceStore((state) => state.type);
  const resourceId = useWorkspaceStore((state) => state.resourceId);
  const reduceMotion = useReducedMotion();
  const key = getWorkspaceTransitionKey(type, resourceId);

  return (
    <AnimatePresence initial={false} mode="sync">
      {hasWorkspace ? (
        <motion.div
          key={key}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
          transition={{ duration: reduceMotion ? 0.06 : 0.22, ease: [0.32, 0.72, 0, 1] }}
          style={{ position: "absolute", inset: 0 }}
        >
          <DynamicWorkspace />
        </motion.div>
      ) : pendingWorkspaceOpen ? (
        <motion.div
          key="skeleton"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
          transition={{ duration: reduceMotion ? 0.06 : 0.22, ease: [0.32, 0.72, 0, 1] }}
          style={{ position: "absolute", inset: 0 }}
        >
          <OliviaWorkspaceSkeleton label={pendingLabel} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
