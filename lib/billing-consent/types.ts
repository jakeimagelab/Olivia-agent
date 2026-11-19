export const BILLING_CONSENT_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "signed",
  "disputed",
  "expired",
  "canceled",
] as const;

export type BillingConsentStatus = (typeof BILLING_CONSENT_STATUSES)[number];
export type BillingConsentVerificationChannel = "email" | "sms";

export type BillingConsentItemInput = {
  name: string;
  quantity: number;
  unitPrice: number;
};

export type BillingConsentItem = BillingConsentItemInput & {
  amount: number;
};

export type BillingConsentTotals = {
  items: BillingConsentItem[];
  subtotal: number;
  vat: number;
  total: number;
};

export type BillingConsentEvidence = {
  kind: "clause" | "image";
  label: string;
  text?: string;
  storagePath?: string;
  mimeType?: string;
  size?: number;
};

export type BillingConsentPublicState = {
  status: BillingConsentStatus;
  expiresAt?: string | null;
  now?: Date;
};

export type BillingConsentSessionPayload = {
  consentId: string;
  channel: BillingConsentVerificationChannel;
  cookieVersion: number;
  expiresAt: number;
};
