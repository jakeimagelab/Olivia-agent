import type { MobileResourceType } from "./navigation";

export type MobileResource = {
  id: string;
  type: MobileResourceType;
  title: string;
  clientName?: string;
  status?: string;
  statusLabel: string;
  totalAmount?: number;
  updatedAt?: string;
  temporaryDocumentId?: string;
  sourceType?: string;
};

const FINAL_STATUSES = new Set(["published", "final", "completed", "contracted", "cancelled", "canceled", "archived"]);

const STATUS_LABELS: Record<string, string> = {
  draft: "작성 중",
  pending_review: "검토 중",
  content_approved: "검토 완료",
  pending_client: "고객등록 대기",
  linked: "작성 중",
  published: "발송 완료",
  final: "계약 완료",
  completed: "계약 완료",
  signed: "계약 완료",
  "서명완료": "계약 완료",
  "서명대기": "검토 중",
  failed: "확인 필요",
  paused: "보류",
  deferred: "보류",
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export function mobileResourceStatusLabel(status?: string | null) {
  if (!status) return "작성 중";
  return STATUS_LABELS[status] || status;
}

export function isOpenMobileResourceStatus(status?: string | null) {
  return !status || !FINAL_STATUSES.has(status.toLowerCase());
}

export function normalizeMobileDocument(row: Record<string, unknown>): MobileResource | null {
  const rawType = stringValue(row.type);
  const sourceId = stringValue(row.sourceId)
    || stringValue((row.metadata as Record<string, unknown> | undefined)?.sourceId)
    || stringValue(row.id)?.split(":").at(-1);
  if (!sourceId) return null;
  const type: MobileResourceType = rawType === "quote"
    ? "quote"
    : rawType === "contract"
      ? "contract"
      : rawType === "storyboard"
        ? "storyboard"
        : "document";
  const status = stringValue(row.status);
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : undefined;
  return {
    id: sourceId,
    type,
    title: stringValue(row.title) || (type === "quote" ? "견적서" : type === "contract" ? "계약서" : "문서"),
    clientName: stringValue(row.clientName),
    status,
    statusLabel: mobileResourceStatusLabel(status),
    totalAmount: numberValue(row.totalAmount) || numberValue(metadata?.totalAmount),
    updatedAt: stringValue(row.updatedAt),
    temporaryDocumentId: stringValue(metadata?.temporaryDocumentId),
    sourceType: stringValue(row.sourceType) || stringValue(metadata?.sourceTable),
  };
}

export function normalizeQuoteResource(row: Record<string, unknown>): MobileResource | null {
  const id = stringValue(row.id);
  if (!id) return null;
  const clientName = stringValue(row.hospital_name);
  const title = stringValue(row.title) || `${clientName || "고객"} 견적서`;
  const status = stringValue(row.status) || "draft";
  return {
    id,
    type: "quote",
    title,
    clientName,
    status,
    statusLabel: mobileResourceStatusLabel(status),
    totalAmount: numberValue(row.total_amount),
    updatedAt: stringValue(row.updated_at) || stringValue(row.created_at),
    sourceType: "quotes",
  };
}

export function normalizeContractResource(row: Record<string, unknown>): MobileResource | null {
  const id = stringValue(row.id);
  if (!id) return null;
  const clientName = stringValue(row.hospital_name);
  const quoteData = row.quote_data && typeof row.quote_data === "object" ? row.quote_data as Record<string, unknown> : {};
  const status = stringValue(row.status) || (row.signature_data_url ? "signed" : "draft");
  return {
    id,
    type: "contract",
    title: `${clientName || stringValue(quoteData.hospitalName) || "고객"} 계약서`,
    clientName: clientName || stringValue(quoteData.hospitalName),
    status,
    statusLabel: mobileResourceStatusLabel(status),
    totalAmount: numberValue(quoteData.totalAmount) || numberValue(quoteData.total_amount),
    updatedAt: stringValue(row.updated_at) || stringValue(row.created_at),
    sourceType: "contracts",
  };
}

function typeFromToolName(toolName: string): MobileResourceType | null {
  const tool = toolName.replace(/^mcp_olivia_/, "").replaceAll(".", "_").toLowerCase();
  if (tool.includes("quote")) return "quote";
  if (tool.includes("contract")) return "contract";
  if (tool.includes("conti") || tool.includes("storyboard")) return "storyboard";
  if (tool.includes("document")) return "document";
  return null;
}

export function resourceReferenceFromToolResult(toolName: string, value: unknown) {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const explicitType = stringValue(data.resourceType);
  const type = explicitType === "quote" || explicitType === "contract" || explicitType === "storyboard" || explicitType === "document"
    ? explicitType
    : typeFromToolName(toolName);
  if (!type) return null;
  const id = stringValue(data.resourceId)
    || (type === "quote" ? stringValue(data.quoteId) : undefined)
    || (type === "contract" ? stringValue(data.contractId) : undefined)
    || (type === "storyboard" ? stringValue(data.contiId) : undefined);
  if (!id) return null;
  return {
    resourceType: type,
    resourceId: id,
    title: stringValue(data.resourceTitle) || stringValue(data.title) || stringValue(data.hospitalName),
    summary: stringValue(data.summary),
    temporaryDocumentId: stringValue(data.temporaryDocumentId),
  };
}

export function formatMobileWon(value?: number) {
  return value == null ? "" : `₩ ${value.toLocaleString("ko-KR")}`;
}

