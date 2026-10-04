import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VIDEO_STUDIO_ACTIONS = ["VIDEO_INTERVIEW_ANALYZE", "VIDEO_AUDIO_EXTRACT"];

/** 영상작업실 최근 작업 목록 — 결과 본문(result)은 무거워서 빼고, 열 때 /api/remote-jobs?id= 로 받는다. */
export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) {
    return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const action = request.nextUrl.searchParams.get("action")?.trim().toUpperCase();
  const actions = action && VIDEO_STUDIO_ACTIONS.includes(action) ? [action] : VIDEO_STUDIO_ACTIONS;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("remote_jobs")
      .select("id,action,payload,target_worker,status,progress,message,error,created_at,started_at,completed_at")
      .in("action", actions)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    return Response.json({ ok: true, jobs: data ?? [] });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "작업 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}
