export type PortraitConsentStatus = "draft" | "sent" | "signed";
export type PortraitConsentFieldType = "text" | "date" | "checklist";

export interface PortraitConsentField {
  label: string;
  value: string;
  type?: PortraitConsentFieldType;
  options?: string[];
}

export interface PortraitConsentDoc {
  id: string;
  client_id: string | null;
  workflow_run_id: string | null;
  title: string;
  intro_text: string;
  detail_fields: PortraitConsentField[];
  usage_items: PortraitConsentField[];
  consent_shoot: boolean | null;
  consent_usage: boolean | null;
  provider_name: string | null;
  signature_data_url: string | null;
  signed_date: string | null;
  status: PortraitConsentStatus;
  signed_at: string | null;
  token_expires_at: string | null;
  token_revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PortraitConsentLink = {
  clientId: string | null;
  workflowRunId: string | null;
};

export type PortraitConsentLinkUpdate = PortraitConsentLink & {
  requested: boolean;
  error: string | null;
};

// 초상권 동의서 기본 세부 항목 — "오블리브 서울 오리진 초상권 동의서" 참고 양식 기준.
// 관리자가 콘티 페이지에서 자유롭게 수정/추가/삭제할 수 있는 시작값일 뿐이다.
export const DEFAULT_DETAIL_FIELDS: PortraitConsentField[] = [
  { label: "촬영 목적", value: "", type: "text" },
  { label: "촬영 의뢰", value: "", type: "text" },
  { label: "촬영 일시", value: "", type: "date" },
  { label: "촬영 장소", value: "", type: "text" },
  { label: "촬영 내용", value: "", type: "checklist", options: ["사진", "영상"] },
  { label: "사용 기간", value: "", type: "text" },
  { label: "협의 내용", value: "", type: "text" },
  { label: "모델 계좌", value: "", type: "text" },
];

export const DEFAULT_USAGE_ITEMS: PortraitConsentField[] = [
  { label: "홍보영상 용도", value: "" },
  { label: "홈페이지 및 SNS/언론 홍보용", value: "" },
];

export const DEFAULT_INTRO_TEXT =
  '본 동의서는, "포토클리닉"에서 홍보영상/사진 제작에 필요한 인물촬영(사진/영상)에 대한 초상권 내용입니다. (본 목적 외에 다른 용도로는 사용이 불가)';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * 고객/촬영 건 연결 입력을 한 곳에서 정규화한다.
 * 고객을 바꾸고 촬영 건을 생략하면 이전 촬영 건은 자동으로 해제한다.
 */
export function resolvePortraitConsentLinkUpdate(
  body: Record<string, unknown>,
  current: PortraitConsentLink = { clientId: null, workflowRunId: null },
): PortraitConsentLinkUpdate {
  const hasClientId = Object.prototype.hasOwnProperty.call(body, "clientId");
  const hasWorkflowRunId = Object.prototype.hasOwnProperty.call(body, "workflowRunId");
  if (!hasClientId && !hasWorkflowRunId) {
    return { ...current, requested: false, error: null };
  }

  const parseOptionalUuid = (value: unknown, label: string): { value: string | null; error: string | null } => {
    if (value === null || value === undefined || value === "") return { value: null, error: null };
    if (!isUuid(value)) return { value: null, error: `${label} 값이 올바르지 않습니다.` };
    return { value, error: null };
  };

  const parsedClient = hasClientId
    ? parseOptionalUuid(body.clientId, "고객")
    : { value: current.clientId, error: null };
  if (parsedClient.error) return { ...current, requested: true, error: parsedClient.error };

  const clientChanged = hasClientId && parsedClient.value !== current.clientId;
  const parsedWorkflow = hasWorkflowRunId
    ? parseOptionalUuid(body.workflowRunId, "촬영 건")
    : { value: clientChanged ? null : current.workflowRunId, error: null };
  if (parsedWorkflow.error) return { ...current, requested: true, error: parsedWorkflow.error };

  const clientId = parsedClient.value;
  const workflowRunId = clientId ? parsedWorkflow.value : null;
  if (parsedWorkflow.value && !clientId) {
    return { clientId: null, workflowRunId: null, requested: true, error: "촬영 건을 연결하려면 고객을 먼저 선택해 주세요." };
  }

  return { clientId, workflowRunId, requested: true, error: null };
}

// 값은 React JSX로만 렌더링되어 자동 이스케이프되므로, 여기서는 HTML 엔티티 변환 없이
// 트림/길이 제한만 한다 — 저장 시점에 미리 이스케이프하면 화면에 "&amp;" 같은 문자가 그대로 보인다.
export function cleanText(value: unknown, maxLen = 2000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

const FIELD_TYPES: PortraitConsentFieldType[] = ["text", "date", "checklist"];

export function sanitizeFieldList(value: unknown, maxItems = 30): PortraitConsentField[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => {
      const type = FIELD_TYPES.includes(item?.type) ? (item.type as PortraitConsentFieldType) : "text";
      const options = Array.isArray(item?.options)
        ? item.options.slice(0, 10).map((o: unknown) => cleanText(o, 30)).filter(Boolean)
        : undefined;
      return {
        label: cleanText(item?.label, 100),
        value: cleanText(item?.value, 500),
        type,
        ...(options && options.length ? { options } : {}),
      };
    })
    .filter((item) => item.label.length > 0);
}
