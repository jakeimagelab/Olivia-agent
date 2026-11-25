import { CONTRACT_BRAND_CONFIG } from "@/lib/contract/contractDocument";
import { DOCUMENT_SUPPLIER } from "@/lib/contract/documentBrandStyle";
import type { TransactionStatementSnapshot } from "./transactionStatementSnapshot";

export const STATEMENT_PARTIES = ["supplier", "recipient"] as const;
export type StatementPartyKey = typeof STATEMENT_PARTIES[number];
export type StatementReceiptMode = "confirm" | "sign";

export const STATEMENT_BUSINESS_FIELDS = [
  { key: "name", label: "상호", max: 140 },
  { key: "businessNumber", label: "사업자등록번호", max: 40 },
  { key: "representative", label: "대표자", max: 80 },
  { key: "address", label: "사업장 주소", max: 240 },
  { key: "businessCategory", label: "업태", max: 100 },
  { key: "businessItem", label: "종목", max: 100 },
  { key: "phone", label: "연락처", max: 60 },
  { key: "managerName", label: "담당자", max: 80 },
  { key: "email", label: "이메일", max: 254 },
] as const;

type StatementBusinessField = typeof STATEMENT_BUSINESS_FIELDS[number]["key"];
export type StatementBusinessParty = Record<StatementBusinessField, string>;
export type StatementBusinessDetails = Record<StatementPartyKey, StatementBusinessParty>;
export type StoredStatementBusinessDetails = Partial<Record<StatementPartyKey, Partial<StatementBusinessParty>>>;

export const STATEMENT_REGISTRATION_LIMIT = 4 * 1024 * 1024;
export const STATEMENT_REGISTRATION_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export type StatementRegistrationDocuments = Partial<Record<StatementPartyKey, {
  name: string;
  path: string;
  contentType: "application/pdf" | "image/jpeg" | "image/png";
}>>;

export type StatementSummary = {
  id: string;
  statement_number: string;
  status: "draft" | "sent" | "confirmed";
  receipt_mode?: StatementReceiptMode;
};

export type StatementWorkspaceData = {
  id: string;
  number: string;
  quoteNumber: string;
  status: StatementSummary["status"];
  receiptMode: StatementReceiptMode;
  updatedAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  sending: boolean;
  businessDetails: StatementBusinessDetails;
  registrationNames: Partial<Record<StatementPartyKey, string>>;
  mailSubject: string;
  draftPreview: { snapshot: TransactionStatementSnapshot; transactionDate: string; shootDate: string | null } | null;
};

export function statementPartyKey(value: unknown): StatementPartyKey | null {
  return STATEMENT_PARTIES.find((party) => party === value) ?? null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function resolveParty(value: unknown, defaults?: Partial<StatementBusinessParty>): StatementBusinessParty {
  const input = record(value);
  return Object.fromEntries(STATEMENT_BUSINESS_FIELDS.map(({ key, max }) => {
    const text = input[key];
    return [key, typeof text === "string" ? text.normalize("NFC").trim().slice(0, max) : defaults?.[key] ?? ""];
  })) as StatementBusinessParty;
}

export function normalizeStatementBusinessDetails(value: unknown): StatementBusinessDetails {
  const input = record(value);
  return { supplier: resolveParty(input.supplier), recipient: resolveParty(input.recipient) };
}

export function resolveStatementBusinessDetails(
  snapshot: TransactionStatementSnapshot,
  saved: StoredStatementBusinessDetails | undefined,
): StatementBusinessDetails {
  const { brand, customer } = snapshot.document;
  return {
    supplier: resolveParty(saved?.supplier, { ...DOCUMENT_SUPPLIER, name: CONTRACT_BRAND_CONFIG[brand].companyDisplayName }),
    recipient: resolveParty(saved?.recipient, {
      ...snapshot.recipient, name: customer.hospitalName, managerName: customer.managerName, email: customer.email, phone: customer.phone,
    }),
  };
}

export function matchesStatementSupplier(supplier: StatementBusinessParty) {
  return supplier.businessNumber.replace(/[^0-9]/g, "") === DOCUMENT_SUPPLIER.businessNumber.replace(/[^0-9]/g, "")
    && supplier.representative === DOCUMENT_SUPPLIER.representative;
}

export function statementMailDefaults(statement: {
  snapshot: TransactionStatementSnapshot;
  statement_number: string;
  business_details?: StoredStatementBusinessDetails;
}) {
  const { supplier, recipient } = resolveStatementBusinessDetails(statement.snapshot, statement.business_details);
  const brandName = supplier.name || CONTRACT_BRAND_CONFIG[statement.snapshot.document.brand].companyDisplayName;
  const subject = `[${brandName}] ${recipient.name} 거래명세서 ${statement.statement_number}`.replace(/[\r\n]+/g, " ").slice(0, 240);
  return { to: recipient.email, subject, brandName };
}
