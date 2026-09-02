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

export async function signReviewDocumentAssets(
  db: SupabaseClient,
  metadata?: Record<string, any> | null,
) {
  const elements = metadata?.editorDocument?.elements;
  if (!Array.isArray(elements)) return {} as Record<string, string>;
  const paths = Array.from(new Set(elements
    .map((element: any) => typeof element?.storagePath === "string" ? element.storagePath : "")
    .filter((value: string) => validReviewAssetPath(value))));
  const signed = await Promise.all(paths.map(async (storagePath) => [storagePath, await signReviewAsset(db, storagePath)] as const));
  return Object.fromEntries(signed.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
}
