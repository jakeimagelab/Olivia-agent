export const DOCUMENT_MAIL_LABELS = { quote: "견적서", statement: "거래명세서", contract: "계약서" } as const;
export const DOCUMENT_MAIL_EXPIRY_DAYS = 30;

export type DocumentMailKind = keyof typeof DOCUMENT_MAIL_LABELS;
export type DocumentMailReference = { kind: DocumentMailKind; id: string };
export type DocumentMailSelection = DocumentMailReference & { version: string | null };

export type DocumentMailChoice = DocumentMailSelection & {
  title: string;
  number: string;
  requiresSignature: boolean;
  canRequestReceipt?: boolean;
};

export type DocumentMailPreview = {
  customerName: string;
  recipient: string;
  subject: string;
  brandLabel?: string;
  message: string;
  documents: DocumentMailChoice[];
  latest?: { recipient: string; sentAt: string; signedAt?: string };
};

export type DocumentMailProgress = {
  state: "preparing" | "sending" | "sent" | "failed";
  sentAt: string | null;
  documentCount: number;
};

export type DeliveredDocument = {
  kind: DocumentMailKind;
  title: string;
  number: string;
  path: string;
  signed?: { name: string; at: string };
};

export const isDocumentMailKind = (value: unknown): value is DocumentMailKind =>
  value === "quote" || value === "statement" || value === "contract";

export function formatDocumentMailSubject(brandLabel: string, customerName: string, documents: readonly Pick<DocumentMailReference, "kind">[]) {
  const names = Object.entries(DOCUMENT_MAIL_LABELS)
    .filter(([kind]) => documents.some((document) => document.kind === kind))
    .map(([, label]) => label);
  return `[${brandLabel}입니다] ${customerName} ${names.join("/") || "문서"} 송부 안내`;
}

export function receivedDocumentsPath(token: string) {
  return `/client-portal/documents/received/${encodeURIComponent(token)}`;
}

export function receivedDocumentsApi(token: string) {
  return `/api/client-portal/document-mail/${encodeURIComponent(token)}`;
}
