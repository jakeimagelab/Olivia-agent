import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncSelectionSubmittedWorkflow } from "@/lib/photo-storage/shootingProgress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const sb = getSupabaseAdmin();
    const { selected_files, customer_memo, share_token } = await req.json();

    if (!Array.isArray(selected_files) || selected_files.length === 0)
      return NextResponse.json({ ok: false, error: "선택된 파일이 없습니다" }, { status: 400 });

    const { data: gallery } = await sb
      .from("select_galleries")
      .select("id, share_token, status, allow_resubmit, client_id, workflow_run_id")
      .eq("id", id)
      .single();

    if (!gallery) return NextResponse.json({ ok: false, error: "갤러리 없음" }, { status: 404 });
    if (gallery.share_token !== share_token)
      return NextResponse.json({ ok: false, error: "인증 오류" }, { status: 403 });
    if (gallery.status === "selection_submitted" && !gallery.allow_resubmit)
      return NextResponse.json({ ok: false, error: "이미 제출이 완료되었습니다" }, { status: 409 });

    const now = new Date().toISOString();

    if (gallery.allow_resubmit) {
      await sb.from("client_photo_selections").delete().eq("gallery_id", id);
    }

    const { data: selection, error: selErr } = await sb
      .from("client_photo_selections")
      .insert({
        gallery_id: id,
        client_id: gallery.client_id,
        workflow_run_id: gallery.workflow_run_id,
        method: "web_select",
        selected_files,
        selected_count: selected_files.length,
        customer_memo: customer_memo ?? null,
        submitted_at: now,
      })
      .select()
      .single();

    if (selErr) throw selErr;

    await sb
      .from("select_galleries")
      .update({ status: "selection_submitted", selected_count: selected_files.length, submitted_at: now, updated_at: now })
      .eq("id", id);

    try {
      await syncSelectionSubmittedWorkflow(sb, gallery.workflow_run_id);
    } catch (workflowError) {
      // 고객의 셀렉 제출은 이미 저장됐다. 워크플로 동기화 오류로 제출을 실패 응답하면 고객이
      // 다시 제출해 중복될 수 있으므로 별도로 기록하고 제출 성공은 유지한다.
      console.warn("[select gallery workflow sync]", workflowError instanceof Error ? workflowError.message : workflowError);
    }

    return NextResponse.json({ ok: true, selection });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
