import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** OS 전역 상태 표시용. 파일 목록이나 Storage 경로는 반환하지 않는다. */
export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 20));
  const { data, error } = await getSupabaseAdmin().from("person_select_upload_jobs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, jobs: data ?? [] });
}
