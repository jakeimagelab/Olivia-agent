import type { WorkspacePublication } from "./types";
import { PUBLICATION_TYPE_LABEL, type PublicationType } from "./publications";
import { buildStepAppLink } from "@/lib/clientAppLinks";
import { getWorkflowDisplayStepKey } from "@/lib/workflow";

export type ClientWorkspaceNextAction =
  | {
      kind: "publish_pending";
      publicationId: string;
      relatedType: string;
      title: string;
      description: string;
    }
  | {
      kind: "tool_link";
      stepKey: "quote" | "contract" | "conti";
      title: string;
      ctaHref: string;
    }
  | {
      kind: "legacy_card";
      stepKey: string;
    }
  | {
      kind: "none";
    };

const TOOL_LINK_STEPS: Record<string, { title: string }> = {
  quote: { title: "견적서 작성하기" },
  contract: { title: "계약서 작성하기" },
  conti: { title: "콘티 작성하기" },
};

// 고객관리 2열 단순화(2026-08-09) — "다음 할 일" 히어로에 무엇을 보여줄지 결정한다.
// 공개 대기 자료가 있으면 워크플로우 다음 할 일보다 항상 우선한다(설계 문서 4.3절).
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
  if (stepKey === "quote" || stepKey === "contract" || stepKey === "conti") {
    return {
      kind: "tool_link",
      stepKey,
      title: TOOL_LINK_STEPS[stepKey].title,
      ctaHref: buildStepAppLink({ stepKey, clientId, workflowRunId: activeProject.id }),
    };
  }

  return { kind: "legacy_card", stepKey };
}
