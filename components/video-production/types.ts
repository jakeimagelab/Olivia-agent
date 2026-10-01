import type { MediaKind, MediaRole } from "@/lib/higgsfield/vendor/template/catalog/types";
import type { VideoGenerationRecord, VideoModelCapability } from "@/lib/higgsfield/types";

export type MediaDraft = {
  id: string;
  role: MediaRole;
  kind: MediaKind;
  name: string;
  file?: File;
  url?: string;
  previewUrl?: string;
};

export type VideoWorkspaceState = {
  models: VideoModelCapability[];
  selectedModel?: VideoModelCapability;
  current?: VideoGenerationRecord;
};

export const ROLE_LABEL: Record<MediaRole, string> = {
  start: "시작 이미지",
  end: "끝 이미지",
  reference: "참조 이미지",
  video: "참조 영상",
  audio: "참조 오디오",
  source: "원본 영상",
};

export const ROLE_KIND: Record<MediaRole, MediaKind> = {
  start: "image",
  end: "image",
  reference: "image",
  video: "video",
  audio: "audio",
  source: "video",
};

export function activeRoles(model: VideoModelCapability | undefined, inputMode?: string) {
  if (!model) return {};
  return model.mediaModes?.find((mode) => mode.id === inputMode)?.roles ?? model.roles;
}

export function defaultSettings(model: VideoModelCapability | undefined): Record<string, unknown> {
  if (!model) return {};
  return Object.fromEntries(Object.entries(model.settings).map(([key, field]) => [key, field.default]));
}
