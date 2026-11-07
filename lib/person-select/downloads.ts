import { getSupabaseAdmin } from "@/lib/supabase";

export const PERSON_SELECT_DOWNLOAD_BUCKET = "person-select-downloads";

export async function ensurePersonSelectDownloadBucket() {
  const storage = getSupabaseAdmin().storage;
  const { data } = await storage.getBucket(PERSON_SELECT_DOWNLOAD_BUCKET);
  if (data) return;
  const { error } = await storage.createBucket(PERSON_SELECT_DOWNLOAD_BUCKET, {
    public: false,
    fileSizeLimit: 20 * 1024 * 1024 * 1024,
    allowedMimeTypes: ["application/zip", "image/jpeg"],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}
export function parseDownloadRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("다운로드 요청을 확인해 주세요.");
  const input = value as Record<string, unknown>;
  const format = input.format === "raw" ? "raw" : "jpg";
  const requestKey = typeof input.requestKey === "string" ? input.requestKey.trim() : "";
  const imageIds = Array.isArray(input.imageIds) ? [...new Set(input.imageIds.filter((id): id is string => typeof id === "string"))] : [];
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(requestKey)) throw new Error("다운로드 요청 키가 올바르지 않습니다.");
  if (!imageIds.length || imageIds.length > 5_000) throw new Error("다운로드할 사진은 1~5000장까지 선택할 수 있습니다.");
  return { format, requestKey, imageIds } as const;
}
