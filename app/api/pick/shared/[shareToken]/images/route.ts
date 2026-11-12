import type { NextRequest } from "next/server";
import { getSharedPersonSelectImageUrls, parseSharedPersonSelectMediaVariant, resolveSharedPersonSelectAccess, sharedReviewerTokenHash } from "@/lib/person-select/sharedPublic";
import { loadPersonSelectImagePage, parsePersonSelectImagePageQuery } from "@/lib/person-select/server/imageRepository";
import {
  enforcePublicSelectionRateLimit,
  PublicSelectionRequestError,
  publicSelectionErrorResponse,
  readPublicSelectionJson,
} from "@/lib/select-gallery/publicSelection";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken);
    await enforcePublicSelectionRateLimit({
      db,
      request,
      token: `${reviewer.id}:${sharedReviewerTokenHash(shareToken)}`,
      action: "person-shared-image-page",
      limit: 240,
      identityOnly: true,
    });
    const query = parsePersonSelectImagePageQuery(request.nextUrl.searchParams);
    const page = await loadPersonSelectImagePage(db, event.id, query);
    return Response.json({ ok: true, page }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-image-batch", limit: 120 });
    const { event } = await resolveSharedPersonSelectAccess(db, shareToken);
    const body = await readPublicSelectionJson(request, 50_000);
    const imageIds = body && typeof body === "object" && !Array.isArray(body)
      ? (body as { imageIds?: unknown }).imageIds
      : null;
    if (!Array.isArray(imageIds) || imageIds.some((value) => typeof value !== "string")) {
      throw new PublicSelectionRequestError("사진 주소 요청 형식이 올바르지 않습니다.");
    }
    const variant = parseSharedPersonSelectMediaVariant((body as { variant?: unknown }).variant);
    const images = await getSharedPersonSelectImageUrls(db, event.id, imageIds as string[], variant);
    return Response.json({ ok: true, images }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}
