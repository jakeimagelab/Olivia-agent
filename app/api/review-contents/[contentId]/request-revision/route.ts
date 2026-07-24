import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ contentId: string }> }) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { contentId } = await context.params;
  const body = await req.json();
  const note = String(body.note || "").trim().slice(0, 2_000);
  if (!note) return NextResponse.json({ ok: false, error: "수정 요청 내용을 입력해주세요." }, { status: 400 });
  const db = getSupabaseAdmin();
  const { data: content, error } = await db.from("review_contents").update({
    status: "draft",
    approved_by: null,
    approved_at: null,
  }).eq("id", contentId).select("client_id,workflow_run_id").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await db.from("agent_tasks").insert({
    client_id: content.client_id,
    workflow_run_id: content.workflow_run_id,
    task_type: "review_content_revision",
    title: "리뷰 콘텐츠 수정 요청",
    description: note,
    input_data: { reviewContentId: contentId, note },
    priority: "high",
    status: "pending",
  });
  return NextResponse.json({ ok: true });
}
