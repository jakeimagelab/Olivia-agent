import type { SupabaseClient } from "@supabase/supabase-js";

export const REVIEW_CONTENT_BUCKET = "review-content-assets";
export const REVIEW_ASSET_PATH = /^(references|variants)\/[0-9a-f-]{36}\/[a-zA-Z0-9._-]{1,180}$/;

export function validReviewAssetPath(path: string) {
  return REVIEW_ASSET_PATH.test(path);
}

export async function signReviewAsset(db: SupabaseClient, storagePath?: string | null, expiresIn = 60 * 30) {
  if (!storagePath || !validReviewAssetPath(storagePath)) return null;
  const { data, error } = await db.storage.from(REVIEW_CONTENT_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}
