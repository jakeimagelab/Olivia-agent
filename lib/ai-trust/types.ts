export type AiTrustDataSourceStatus = "CONNECTED" | "NOT_CONNECTED" | "API_REQUIRED" | "MANUAL_DATA";

export type AiTrustIntent =
  | "LOCATION"
  | "RECOMMENDATION"
  | "SYMPTOM"
  | "TREATMENT"
  | "PRICE"
  | "TRUST"
  | "CONDITION";

export type AiTrustProviderKey = "openai" | "gemini" | "anthropic" | "perplexity";

export type AiTrustEvidenceSchemaKey =
  | "LOCATION_RELEVANCE"
  | "INFORMATION_CLARITY"
  | "DOCTOR_INFORMATION"
  | "TREATMENT_INFORMATION"
  | "REVIEW_EVIDENCE"
  | "THIRD_PARTY_MENTIONS"
  | "INFORMATION_CONSISTENCY"
  | "FRESHNESS"
  | "VISUAL_EVIDENCE"
  | "MULTILINGUAL_INFORMATION"
  | "PRICE_INFORMATION"
  | "BOOKING_ACCESSIBILITY";

export type AiTrustGeneratedPrompt = {
  source_keyword: string;
  source: string;
  intent: AiTrustIntent;
  question: string;
  language: string;
  region: string;
  department: string;
  demand_score: number | null;
};

export type AiTrustProviderStatus = {
  provider: AiTrustProviderKey;
  label: string;
  status: "CONNECTED" | "NOT_CONNECTED";
  envKey: string;
  note: string;
};
