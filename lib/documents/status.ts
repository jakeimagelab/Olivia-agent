export type DocumentStage = "draft" | "review" | "final";

/** 임시인지 최종인지. 화면 구분의 기준은 이것 하나다. */
export function documentStage(status?: string | null): DocumentStage {
  if (!status) return "draft";
  const value = status.trim().toLowerCase();
  if (["final", "completed", "signed", "published", "contracted", "확정", "완료", "서명완료"].includes(value)) return "final";
  if (["pending_review", "content_approved", "pending_client", "검토중", "대기", "서명대기"].includes(value)) return "review";
  return "draft";
}

/** 문서 상태 한글 표기는 모바일·데스크톱 문서함이 함께 쓴다. */
export const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  pending_review: "검토 중",
  content_approved: "검토 완료",
  pending_client: "고객등록 대기",
  linked: "작성 중",
  published: "발송 완료",
  final: "최종본",
  completed: "최종본",
  signed: "최종본",
  "서명완료": "최종본",
  "서명대기": "검토 중",
  failed: "연결 실패",
  paused: "보류",
  deferred: "보류",
  contracted: "최종본",
  cancelled: "취소됨",
  canceled: "취소됨",
  archived: "보관됨",
  "작성 중": "작성 중",
  "진행중": "진행 중",
  "검토중": "검토 중",
  "대기": "대기",
  "확정": "최종본",
  "완료": "최종본",
  "승인": "승인됨",
  "취소": "취소됨",
  "거절": "거절됨",
  "반려": "반려됨",
};

export function documentStatusLabel(status?: string | null): string {
  if (!status) return "작성 중";
  const value = status.trim();
  const label = DOCUMENT_STATUS_LABEL[value] ?? DOCUMENT_STATUS_LABEL[value.toLowerCase()];
  if (label) return label;
  console.warn("[documents/status] 라벨 없는 상태", status);
  return value;
}
