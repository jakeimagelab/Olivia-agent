import type { NextRequest } from "next/server";
import { getSharedPersonSelectImageUrls, resolveSharedPersonSelectAccess } from "@/lib/person-select/sharedPublic";
import {
  enforcePublicSelectionRateLimit,
  PublicSelectionRequestError,
  publicSelectionErrorResponse,
  readPublicSelectionJson,
} from "@/lib/select-gallery/publicSelection";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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
    const images = await getSharedPersonSelectImageUrls(db, event.id, imageIds as string[]);
    return Response.json({ ok: true, images }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}
