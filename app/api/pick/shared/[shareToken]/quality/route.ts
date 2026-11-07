import type { NextRequest } from "next/server";
import { latestPhotoQualityResults, publicPhotoQualityResult } from "@/lib/photo-quality/public";
import { PHOTO_QUALITY_ANALYSIS_VERSION } from "@/lib/photo-quality/types";
import { resolveSharedPersonSelectAccess } from "@/lib/person-select/sharedPublic";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-quality-read", limit: 120 });
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken);
    if (!event.customer_ai_results_visible || !reviewer.can_view_ai_results) {
      return Response.json({ ok: false, error: "AI 품질 검사 결과를 볼 권한이 없습니다." }, { status: 403 });
    }
    const { data, error } = await db.from("photo_quality_analysis_results")
      .select("image_id,analysis_status,flags,confidence,explanation,review_status,analyzed_at")
      .eq("event_id", event.id)
      .eq("analysis_version", PHOTO_QUALITY_ANALYSIS_VERSION)
      .order("analyzed_at", { ascending: false });
    if (error) throw error;
    return Response.json({ ok: true, results: latestPhotoQualityResults(data ?? []).map(publicPhotoQualityResult) });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}
