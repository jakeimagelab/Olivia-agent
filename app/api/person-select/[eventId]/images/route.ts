import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSharedPersonSelectImageUrls } from "@/lib/person-select/sharedPublic";
import { PublicSelectionRequestError, readPublicSelectionJson } from "@/lib/select-gallery/publicSelection";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  try {
    const body = await readPublicSelectionJson(request, 50_000);
    const imageIds = body && typeof body === "object" && !Array.isArray(body)
      ? (body as { imageIds?: unknown }).imageIds
      : null;
    if (!Array.isArray(imageIds) || imageIds.some((value) => typeof value !== "string")) {
      return Response.json({ ok: false, error: "사진 주소 요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const images = await getSharedPersonSelectImageUrls(getSupabaseAdmin(), eventId, imageIds as string[]);
    return Response.json({ ok: true, images }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    if (error instanceof PublicSelectionRequestError) return Response.json({ ok: false, error: error.message }, { status: error.status });
    console.error("[person-select-admin-media] failed", error);
    return Response.json({ ok: false, error: "사진 주소를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
