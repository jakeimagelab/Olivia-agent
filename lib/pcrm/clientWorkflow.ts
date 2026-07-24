import { getWorkflowDisplayStepKey } from "@/lib/workflow";

export const CLIENT_WORKFLOW_STAGES = [
  { key: "registered", label: "고객등록" },
  { key: "quote", label: "견적서" },
  { key: "contract", label: "계약서" },
  { key: "preparation", label: "촬영 준비" },
  { key: "conti", label: "콘티 확인" },
  { key: "shooting", label: "촬영" },
  { key: "gallery", label: "갤러리" },
  { key: "revision", label: "수정/승인" },
  { key: "delivery", label: "최종 납품" },
  { key: "review", label: "리뷰" },
] as const;

export type ClientWorkflowStageKey = (typeof CLIENT_WORKFLOW_STAGES)[number]["key"];

const INTERNAL_TO_CLIENT: Record<string, ClientWorkflowStageKey> = {
  consult_meeting: "registered",
  quote: "quote",
  contract: "contract",
  payment_confirm: "preparation",
  conti: "conti",
  shooting: "shooting",
  backup_sorting: "gallery",
  original_delivery: "gallery",
  client_selection: "gallery",
  raw_matching: "gallery",
  retouching: "revision",
  revision: "revision",
  seo_delivery: "delivery",
  final_delivery: "delivery",
  review_content: "review",
  reward: "review",
  customer_care: "review",
};

export function getClientWorkflowStage(stepKey?: string | null): ClientWorkflowStageKey {
  if (!stepKey) return "registered";
  const displayKey = getWorkflowDisplayStepKey(stepKey) ?? stepKey;
  return INTERNAL_TO_CLIENT[displayKey] ?? INTERNAL_TO_CLIENT[stepKey] ?? "registered";
}

export function getClientWorkflowProgress(
  stepKey?: string | null,
  workflowStatus?: string | null,
) {
  if (workflowStatus === "completed") return 100;
  const stage = getClientWorkflowStage(stepKey);
  const index = CLIENT_WORKFLOW_STAGES.findIndex((item) => item.key === stage);
  return Math.max(0, Math.round(((index + 1) / CLIENT_WORKFLOW_STAGES.length) * 100));
}

export function getClientNextAction(stepKey?: string | null) {
  const stage = getClientWorkflowStage(stepKey);
  const actions: Record<ClientWorkflowStageKey, { title: string; href: string }> = {
    registered: { title: "담당 매니저가 프로젝트를 준비하고 있습니다.", href: "/client-portal/dashboard" },
    quote: { title: "견적서를 확인해 주세요.", href: "/client-portal/documents" },
    contract: { title: "계약서를 확인하고 서명해 주세요.", href: "/client-portal/documents" },
    preparation: { title: "촬영 준비사항과 일정을 확인해 주세요.", href: "/client-portal/preparation" },
    conti: { title: "촬영 콘티를 확인해 주세요.", href: "/client-portal/conti" },
    shooting: { title: "촬영 일정과 준비사항을 확인해 주세요.", href: "/client-portal/dashboard" },
    gallery: { title: "촬영 갤러리와 사진 선택 상태를 확인해 주세요.", href: "/client-portal/gallery" },
    revision: { title: "수정 결과를 확인하거나 의견을 남겨주세요.", href: "/client-portal/revision" },
    delivery: { title: "최종 납품 자료를 확인해 주세요.", href: "/client-portal/documents" },
    review: { title: "프로젝트 경험을 리뷰로 남겨주세요.", href: "/client-portal/review" },
  };
  return actions[stage];
}

export function getClientVisibleMenus(stepKey?: string | null) {
  const progress = getClientWorkflowProgress(stepKey);
  return {
    dashboard: true,
    documents: progress >= 20,
    progress: true,
    preparation: progress >= 40,
    conti: progress >= 50,
    gallery: progress >= 70,
    revision: progress >= 80,
    review: progress >= 100,
    per: true,
  };
}
