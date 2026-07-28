import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const body = await req.json();

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.scheduledDate !== undefined) patch.scheduled_date = body.scheduledDate || null;
    if (body.relatedPostUrl !== undefined) patch.related_post_url = body.relatedPostUrl;
    if (body.status !== undefined) {
      patch.status = body.status;
      // 완료 처리 시 completed_date를 오늘 날짜로 자동 기록하고, 되돌리면 비운다.
      if (body.status === "done") {
        patch.completed_date = body.completedDate || new Date().toISOString().slice(0, 10);
      } else if (body.status === "pending") {
        patch.completed_date = null;
      }
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

    const { data, error } = await supabase
      .from("marketing_actions")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, action: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "액션 수정 실패" }, { status: 500 });
  }
}
