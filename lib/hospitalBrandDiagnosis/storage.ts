import type { SupabaseClient } from "@supabase/supabase-js";
import { HBD_STORAGE_BUCKET } from "./config";

export const HBD_ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export const HBD_ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const HBD_ALLOWED_MIME_TYPES = [...HBD_ALLOWED_IMAGE_TYPES, ...HBD_ALLOWED_VIDEO_TYPES];

export const HBD_MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB
export const HBD_MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB
export const HBD_MAX_FILES_PER_CHANNEL = 20;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
};

export function extensionForMime(mime: string): string {
  return MIME_EXT[mime] || "bin";
}

export function maxSizeForMime(mime: string): number {
  return HBD_ALLOWED_VIDEO_TYPES.includes(mime) ? HBD_MAX_VIDEO_SIZE : HBD_MAX_IMAGE_SIZE;
}

let bucketEnsured = false;

export async function ensureHbdBucket(db: SupabaseClient) {
  if (bucketEnsured) return;
  const { data: buckets } = await db.storage.listBuckets();
  if (!buckets?.some((b) => b.name === HBD_STORAGE_BUCKET)) {
    await db.storage.createBucket(HBD_STORAGE_BUCKET, {
      public: false,
      fileSizeLimit: HBD_MAX_VIDEO_SIZE,
      allowedMimeTypes: HBD_ALLOWED_MIME_TYPES,
    });
  }
  bucketEnsured = true;
}

export async function downloadAssetAsBase64(db: SupabaseClient, storagePath: string): Promise<string> {
  const { data, error } = await db.storage.from(HBD_STORAGE_BUCKET).download(storagePath);
  if (error) throw error;
  const buffer = Buffer.from(await data.arrayBuffer());
  return buffer.toString("base64");
}

// 섹션 11-2: 근거 자료의 원본 이미지는 비공개 버킷에 저장되어 있으므로, 화면에는 만료 시간이
// 제한된 signed URL로만 노출한다(원본 URL을 영구 공개 URL로 바꾸지 않는다).
export async function getSignedAssetUrl(db: SupabaseClient, storagePath: string, ttlSeconds = 300): Promise<string | null> {
  const { data, error } = await db.storage.from(HBD_STORAGE_BUCKET).createSignedUrl(storagePath, ttlSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
