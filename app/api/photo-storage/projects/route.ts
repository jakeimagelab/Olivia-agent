import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import { PHOTO_PROJECT_STATUSES } from "@/lib/photo-storage/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const db = getSupabaseAdmin();
    const requestedStatus = request.nextUrl.searchParams.get("status")?.toUpperCase();
    const statuses = requestedStatus && PHOTO_PROJECT_STATUSES.includes(requestedStatus as (typeof PHOTO_PROJECT_STATUSES)[number])
      ? [requestedStatus]
      : [
        "READY", "DEFERRED", "REVIEW_REQUIRED",
        "MERGE_APPROVED", "MERGING", "MERGE_COMPLETED", "MERGE_FAILED",
        "CLASSIFY_APPROVED",
        "COPY_QUEUED", "COPYING", "COPY_VERIFYING", "COPY_COMPLETED", "COPY_FAILED",
        "CLASSIFY_QUEUED", "CLASSIFYING", "CLASSIFY_VERIFYING", "CLASSIFY_COMPLETED", "CLASSIFY_FAILED",
      ];
    const { data: projects, error } = await db
      .from("photo_storage_projects")
      .select("*")
      .in("status", statuses)
      .order("discovered_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const projectIds = (projects ?? []).map((project) => project.id);
    const { data: events, error: eventError } = projectIds.length
      ? await db.from("photo_storage_events").select("*").in("project_id", projectIds).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (eventError) throw eventError;
    return Response.json({ ok: true, projects: projects ?? [], events: events ?? [] });
  } catch (error) {
    console.error("[photo-storage projects GET]", error);
    return Response.json({ ok: false, error: "촬영 프로젝트를 불러오지 못했습니다." }, { status: 500 });
  }
}
