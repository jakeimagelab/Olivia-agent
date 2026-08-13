"use client";

import { AnimatePresence, motion } from "framer-motion";
import DynamicWorkspace from "@/components/workspace/DynamicWorkspace";
import OliviaWorkspaceSkeleton from "@/components/workspace/OliviaWorkspaceSkeleton";

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
  return (
    <AnimatePresence initial={false}>
      {hasWorkspace ? (
        <motion.div
          key="workspace"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          style={{ position: "absolute", inset: 0 }}
        >
          <DynamicWorkspace />
        </motion.div>
      ) : pendingWorkspaceOpen ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          style={{ position: "absolute", inset: 0 }}
        >
          <OliviaWorkspaceSkeleton label={pendingLabel} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
