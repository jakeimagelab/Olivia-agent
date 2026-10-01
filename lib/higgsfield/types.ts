import type { MediaKind, MediaRole, ModelEntry, SettingField } from "./vendor/template/catalog/types";

export type VideoGenerationStatus = "idle" | "uploading" | "submitting" | "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";

export type VideoModelCapability = Pick<ModelEntry, "id" | "label" | "surface" | "roles" | "mediaModes" | "requiredRoles" | "requirePrompt" | "settings" | "icon">;

export type VideoGenerationMedia = {
  id: string;
  url: string;
  role: MediaRole;
  kind?: MediaKind;
  name?: string;
};

export type VideoGenerationRequest = {
  model: string;
  inputMode?: string;
  prompt: string;
  media: VideoGenerationMedia[];
  settings: Record<string, unknown>;
};

export type VideoGenerationRecord = {
  requestId: string;
  model: string;
  modelLabel: string;
  inputMode?: string;
  prompt: string;
  settings: Record<string, unknown>;
  status: VideoGenerationStatus;
  createdAt: string;
  updatedAt: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  providerError?: string;
};

export type VideoUploadTicket = {
  upload_url: string;
  public_url: string;
  content_type: string;
  upload_headers: Record<string, string>;
};

export type PublicSettingField = SettingField;

export type VideoGenerationApiError = {
  message: string;
  detail?: string;
  code?: "not_configured" | "validation" | "authentication" | "rate_limit" | "provider" | "unknown";
};
