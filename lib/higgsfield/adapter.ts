import "server-only";

import { getHiggsfieldServerConfig, hasHiggsfieldCredentials } from "./config";
import { normalizeVideoGenerationStatus, parseVideoGenerationRequest } from "./normalize";
import type { VideoGenerationStatus, VideoModelCapability, VideoUploadTicket } from "./types";
import { getModel, MODELS, parseSettings } from "./vendor/template/catalog";
import { groupMedia } from "./vendor/template/catalog/media-inputs";
import { validateMedia } from "./vendor/template/catalog/media-inputs";
import { createPlatformClient, type GenerationStatus } from "./vendor/template/platform";
import { toPlatform } from "./vendor/template/to-platform";
import { requireUploadContentType, type UploadTicket } from "./vendor/template/upload-contract";

export function getVideoModelCapabilities(): VideoModelCapability[] {
  return MODELS.filter((model) => model.surface === "video").map((model) => ({
    id: model.id,
    label: model.label,
    surface: model.surface,
    roles: model.roles,
    mediaModes: model.mediaModes,
    requiredRoles: model.requiredRoles,
    requirePrompt: model.requirePrompt,
    settings: model.settings,
    icon: model.icon,
  }));
}

export function higgsfieldConnectionState() {
  return { configured: hasHiggsfieldCredentials() };
}

function createOfficialPlatformClient() {
  const config = getHiggsfieldServerConfig();
  return createPlatformClient({ apiKey: config.credentials, baseUrl: config.baseUrl });
}

function normalizeTicket(ticket: UploadTicket): VideoUploadTicket {
  return {
    upload_url: ticket.upload_url,
    public_url: ticket.public_url,
    content_type: ticket.content_type,
    upload_headers: ticket.upload_headers,
  };
}

export async function createVideoUploadTicket(contentType: unknown): Promise<VideoUploadTicket> {
  requireUploadContentType(contentType);
  return normalizeTicket(await createOfficialPlatformClient().createUpload(contentType));
}

export async function submitVideoGeneration(value: unknown): Promise<{ requestId: string; status: VideoGenerationStatus; model: VideoModelCapability }> {
  const request = parseVideoGenerationRequest(value);
  const model = getModel(request.model);
  if (model.surface !== "video") throw new Error("영상 생성 모델만 선택할 수 있습니다.");

  const plane = {
    model: model.id,
    ...(request.inputMode ? { inputMode: request.inputMode } : {}),
    prompt: { text: request.prompt.trim() },
    media: groupMedia(request.media),
    settings: parseSettings(model, request.settings),
  };
  validateMedia(model, plane.media, plane.inputMode);
  const { path, body } = toPlatform(plane);
  // Open Higgsfield's current API-key console issues one complete key. The
  // official app-template platform client preserves it and applies the `Key`
  // authorization scheme server-side for submit, upload, status, and cancel.
  const result = await createOfficialPlatformClient().submit(path, body);
  return {
    requestId: result.requestId,
    status: normalizeVideoGenerationStatus(result.status),
    model: {
      id: model.id,
      label: model.label,
      surface: model.surface,
      roles: model.roles,
      mediaModes: model.mediaModes,
      requiredRoles: model.requiredRoles,
      requirePrompt: model.requirePrompt,
      settings: model.settings,
      icon: model.icon,
    },
  };
}

function normalizeStatus(status: GenerationStatus): {
  requestId: string;
  status: VideoGenerationStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  providerError?: string;
} {
  const videoUrl = status.video?.url;
  const normalizedStatus = normalizeVideoGenerationStatus(status.status, "failed");
  const providerError = status.error !== undefined
    ? (typeof status.error === "string" ? status.error : JSON.stringify(status.error))
    : normalizedStatus === "failed" && status.status !== "failed"
      ? `Higgsfield가 알 수 없는 작업 상태(${JSON.stringify(status.status)})를 반환했습니다.`
      : undefined;
  return {
    requestId: status.requestId,
    status: normalizedStatus,
    ...(videoUrl ? { videoUrl, thumbnailUrl: videoUrl } : {}),
    ...(providerError ? { providerError } : {}),
  };
}

export async function getVideoGenerationStatus(requestId: string) {
  if (!requestId.trim()) throw new Error("생성 작업 ID가 필요합니다.");
  return normalizeStatus(await createOfficialPlatformClient().status(requestId));
}

export async function getVideoGenerationStatuses(requestIds: string[]) {
  const client = createOfficialPlatformClient();
  return Promise.all(requestIds.map(async (requestId) => {
    try {
      return await normalizeStatus(await client.status(requestId));
    } catch (error) {
      return {
        requestId,
        status: "failed" as const,
        providerError: error instanceof Error ? error.message : "상태를 확인하지 못했습니다.",
      };
    }
  }));
}

export async function cancelVideoGeneration(requestId: string): Promise<void> {
  if (!requestId.trim()) throw new Error("생성 작업 ID가 필요합니다.");
  await createOfficialPlatformClient().cancel(requestId);
}
