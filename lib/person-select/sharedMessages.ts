import { PublicSelectionRequestError } from "@/lib/select-gallery/publicSelection";

export const PERSON_SELECT_PROJECT_MESSAGE_LIMIT = 2_000;

export type PersonSelectProjectMessage = {
  id: string;
  body: string;
  authorName: string;
  authorRole: string;
  own: boolean;
  createdAt: string;
};

export function parsePersonSelectProjectMessage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PublicSelectionRequestError("메시지 형식이 올바르지 않습니다.");
  }
  const bodyValue = (value as Record<string, unknown>).body;
  const requestValue = (value as Record<string, unknown>).requestId;
  const body = typeof bodyValue === "string" ? bodyValue.trim() : "";
  const requestId = typeof requestValue === "string" ? requestValue.trim() : "";
  if (!body) throw new PublicSelectionRequestError("메시지를 입력해 주세요.");
  if (body.length > PERSON_SELECT_PROJECT_MESSAGE_LIMIT) {
    throw new PublicSelectionRequestError(`메시지는 ${PERSON_SELECT_PROJECT_MESSAGE_LIMIT}자까지 적을 수 있습니다.`);
  }
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(requestId)) {
    throw new PublicSelectionRequestError("메시지 요청 키가 올바르지 않습니다.");
  }
  return { body, requestId };
}

export function publicPersonSelectProjectMessage(
  row: Record<string, any>,
  currentReviewerId?: string | null,
): PersonSelectProjectMessage {
  const reviewer = row.person_select_shared_reviewers as { display_name?: string; role_label?: string } | null;
  return {
    id: String(row.id),
    body: String(row.body ?? ""),
    authorName: reviewer?.display_name || String(row.admin_actor || "관리자"),
    authorRole: reviewer?.role_label || (row.admin_actor ? "관리자" : ""),
    own: Boolean(currentReviewerId && row.reviewer_id === currentReviewerId),
    createdAt: String(row.created_at),
  };
}
