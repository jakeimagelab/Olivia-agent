import type { WorkspacePublication } from "./types";
import { PUBLICATION_TYPE_LABEL, type PublicationType } from "./publications";
import { buildStepAppLink } from "@/lib/clientAppLinks";
import { getWorkflowDisplayStepKey, isToolOnlyStep, STEP_NAME, type ToolOnlyStepKey } from "@/lib/workflow";

export type ClientWorkspaceNextAction =
  | {
      kind: "publish_pending";
      publicationId: string;
      relatedType: string;
      title: string;
      description: string;
    }
  | {
      kind: "step_ready";
      stepKey: string;
      title: string;
      ctaHref: string;
    }
  | {
      kind: "none";
    };

// 문서형 단계(견적/계약/콘티)는 팝업 빌더를 여는 액션 문구, 그 외 단계는 상태명 그대로
// "OOO 열기"로 통일한다 — 코드 요청서 4차: 단계별로 다른 카드/문구를 쓰지 않는다.
const TOOL_LINK_TITLES: Record<ToolOnlyStepKey, string> = {
  quote: "견적서 작성하기",
  contract: "계약서 작성하기",
  conti: "콘티 작성하기",
};

// 고객관리 2열 단순화(2026-08-09) — "다음 할 일" 히어로에 무엇을 보여줄지 결정한다.
// 공개 대기 자료가 있으면 워크플로우 다음 할 일보다 항상 우선한다(설계 문서 4.3절).
// 코드 요청서 4차(2026-08-16) — 견적/계약/콘티(tool_link)와 그 외 단계(legacy_card)를
// 화면 레벨에서 다르게 취급하던 걸 없애고 step_ready 하나로 합쳤다. 모든 단계가
// "스텝 클릭 → 즉시 처리 화면 진입" 패턴 하나만 따른다.
export function computeClientWorkspaceNextAction({
  activeProject,
  publications,
  clientId,
}: {
  activeProject: Record<string, any> | null;
  publications: WorkspacePublication[];
  clientId: string;
}): ClientWorkspaceNextAction {
  if (!activeProject) return { kind: "none" };

  const pending = publications.filter((p) => p.displayStatus === "pending_publish");
  if (pending.length > 0) {
    const oldest = [...pending].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )[0];
    const label = PUBLICATION_TYPE_LABEL[oldest.relatedType as PublicationType] ?? oldest.relatedType;
    return {
      kind: "publish_pending",
      publicationId: oldest.id,
      relatedType: oldest.relatedType,
      title: `${label} 고객 공개`,
      description: `${label}가 작성되어 공개 대기 중입니다.`,
    };
  }

  const stepKey = getWorkflowDisplayStepKey(activeProject.current_step_key) || activeProject.current_step_key;
  const title = isToolOnlyStep(stepKey) ? TOOL_LINK_TITLES[stepKey] : `${STEP_NAME[stepKey] ?? stepKey} 열기`;
  return {
    kind: "step_ready",
    stepKey,
    title,
    ctaHref: buildStepAppLink({ stepKey, clientId, workflowRunId: activeProject.id }),
  };
}
