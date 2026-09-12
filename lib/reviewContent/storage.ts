import type { SupabaseClient } from "@supabase/supabase-js";

export const REVIEW_CONTENT_BUCKET = "review-content-assets";
export const REVIEW_ASSET_PATH = /^(references|variants|generated)\/[0-9a-f-]{36}\/[a-zA-Z0-9._-]{1,180}$/;
const PENDING_CANONICAL_FILE = "pending-canonical.png";

export function validReviewAssetPath(path: string) {
  return REVIEW_ASSET_PATH.test(path);
}

export function pendingReviewVariantPath(variantId: string) {
  return `variants/${variantId}/${PENDING_CANONICAL_FILE}`;
}

export function isPendingReviewAssetPath(path?: string | null) {
  return Boolean(path?.endsWith(`/${PENDING_CANONICAL_FILE}`));
}

export function reviewVariantHasCanonicalAsset(variant: {
  image_storage_path?: string | null;
  generation_metadata?: Record<string, any> | null;
}) {
  if (!variant.image_storage_path || isPendingReviewAssetPath(variant.image_storage_path)) return false;
  if (variant.generation_metadata?.renderer !== "review-canvas-renderer") return true;
  return Boolean(variant.generation_metadata.canonicalRenderedAt);
}

export async function signReviewAsset(db: SupabaseClient, storagePath?: string | null, expiresIn = 60 * 30) {
  if (!storagePath || isPendingReviewAssetPath(storagePath) || !validReviewAssetPath(storagePath)) return null;
  const { data, error } = await db.storage.from(REVIEW_CONTENT_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}

export async function signReviewDocumentAssets(
  db: SupabaseClient,
  metadata?: Record<string, any> | null,
) {
  const elements = metadata?.editorDocument?.elements;
  const backgroundPath = metadata?.editorDocument?.backgroundImage?.storagePath;
  if (!Array.isArray(elements) && typeof backgroundPath !== "string") return {} as Record<string, string>;
  const paths = Array.from(new Set([...(Array.isArray(elements) ? elements : []), { storagePath: backgroundPath }]
    .map((element: any) => typeof element?.storagePath === "string" ? element.storagePath : "")
    .filter((value: string) => validReviewAssetPath(value))));
  const signed = await Promise.all(paths.map(async (storagePath) => [storagePath, await signReviewAsset(db, storagePath)] as const));
  return Object.fromEntries(signed.filter((entry): entry is readonly [string, string] => Boolean(entry[1])));
}
