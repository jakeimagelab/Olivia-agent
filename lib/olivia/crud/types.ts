export const OLIVIA_CRUD_DOMAINS = [
  "client",
  "workflow",
  "memo",
  "calendar",
  "quote",
  "contract",
  "conti",
  "photo_gallery",
  "select_gallery",
  "review",
  "mail_draft",
  "agent_task",
] as const;

export type OliviaCrudDomain = (typeof OLIVIA_CRUD_DOMAINS)[number];
export type OliviaCrudOperation = "create" | "update";
export type OliviaCrudPermission = "review_required" | "owner_only";
export type OliviaCrudValueType = "string" | "number" | "boolean" | "object" | "array";

export type OliviaCrudFieldRule = {
  type: OliviaCrudValueType;
  requiredOnCreate?: boolean;
  enum?: readonly string[];
  min?: number;
  max?: number;
  maxLength?: number;
};

export type OliviaCrudDefinition = {
  domain: OliviaCrudDomain;
  label: string;
  identityFields: readonly string[];
  fields: Readonly<Record<string, OliviaCrudFieldRule>>;
  ownerOnlyFields?: readonly string[];
};

export type OliviaCrudTarget = {
  id?: string;
  name?: string;
  naturalKey?: string;
};

export type OliviaCrudRequest = {
  operation: OliviaCrudOperation;
  domain: OliviaCrudDomain;
  data: Record<string, unknown>;
  target?: OliviaCrudTarget;
  requestText?: string;
};

export type OliviaCrudExecutionResult = {
  action: "done";
  message: string;
  domain: OliviaCrudDomain;
  operation: OliviaCrudOperation;
  recordId: string;
  record?: Record<string, unknown>;
};

export class OliviaCrudError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_DOMAIN"
      | "INVALID_INPUT"
      | "TARGET_NOT_FOUND"
      | "AMBIGUOUS_TARGET"
      | "OWNER_ONLY"
      | "DATABASE_ERROR",
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OliviaCrudError";
  }
}
