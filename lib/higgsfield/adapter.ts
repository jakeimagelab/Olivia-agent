import "server-only";

import { createHiggsfieldClient } from "@higgsfield/client/v2";
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
  const config = getHiggsfieldServerConfig();
  const client = createHiggsfieldClient({ credentials: config.credentials, baseURL: config.baseUrl });
  const result = await client.subscribe(path, { input: body, withPolling: false });
  if (!result.request_id) throw new Error("Higgsfield가 생성 작업 ID를 반환하지 않았습니다.");
  return {
    requestId: result.request_id,
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
  return {
    requestId: status.requestId,
    status: normalizeVideoGenerationStatus(status.status),
    ...(videoUrl ? { videoUrl, thumbnailUrl: videoUrl } : {}),
    ...(status.error !== undefined ? { providerError: typeof status.error === "string" ? status.error : JSON.stringify(status.error) } : {}),
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
