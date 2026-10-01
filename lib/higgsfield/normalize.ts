import { ZodError, z } from "zod";
import { HiggsfieldConfigurationError } from "./config";
import type { VideoGenerationApiError, VideoGenerationRequest, VideoGenerationStatus } from "./types";

const mediaRoleSchema = z.enum(["start", "end", "reference", "video", "audio", "source"]);
const mediaKindSchema = z.enum(["image", "video", "audio"]);

const generationRequestSchema = z.object({
  model: z.string().trim().min(1).max(180),
  inputMode: z.string().trim().min(1).max(80).optional(),
  prompt: z.string().max(4_000).default(""),
  media: z.array(z.object({
    id: z.string().trim().min(1).max(180),
    url: z.string().url().max(4_000),
    role: mediaRoleSchema,
    kind: mediaKindSchema.optional(),
    name: z.string().trim().max(255).optional(),
  })).max(16).default([]),
  settings: z.record(z.string(), z.unknown()).default({}),
});

export function parseVideoGenerationRequest(value: unknown): VideoGenerationRequest {
  return generationRequestSchema.parse(value);
}

export function normalizeVideoGenerationStatus(
  status: unknown,
  fallback: VideoGenerationStatus = "queued",
): VideoGenerationStatus {
  switch (status) {
    case "queued":
    case "in_progress":
    case "completed":
    case "failed":
    case "nsfw":
    case "canceled":
      return status;
    default:
      return fallback;
  }
}

export function publicHiggsfieldError(error: unknown): VideoGenerationApiError {
  if (error instanceof HiggsfieldConfigurationError) {
    return { message: "Higgsfield API 연결이 필요합니다.", detail: error.message, code: "not_configured" };
  }
  if (error instanceof ZodError) {
    return { message: "생성 요청 내용을 확인해주세요.", detail: error.issues.map((issue) => issue.message).join(" · "), code: "validation" };
  }
  const candidate = error as { status?: unknown; message?: unknown; name?: unknown } | undefined;
  const status = typeof candidate?.status === "number" ? candidate.status : undefined;
  const detail = typeof candidate?.message === "string" ? candidate.message : undefined;
  if (status === 401 || status === 403 || candidate?.name === "AuthenticationError") {
    return { message: "Higgsfield 인증 또는 이용 권한을 확인해주세요.", detail, code: "authentication" };
  }
  if (status === 429 || candidate?.name === "NotEnoughCreditsError") {
    return { message: "Higgsfield 사용량 또는 요청 제한을 확인해주세요.", detail, code: "rate_limit" };
  }
  if (status === 400 || status === 422 || candidate?.name === "ValidationError" || candidate?.name === "BadInputError") {
    return { message: "선택한 모델의 생성 옵션을 확인해주세요.", detail, code: "validation" };
  }
  return { message: "영상 생성에 실패했습니다.", detail, code: "provider" };
}
