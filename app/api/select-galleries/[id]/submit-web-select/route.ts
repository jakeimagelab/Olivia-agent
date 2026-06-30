import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = getSupabaseAdmin();
    const { selected_files, customer_memo, share_token } = await req.json();

    if (!Array.isArray(selected_files) || selected_files.length === 0)
      return NextResponse.json({ ok: false, error: "선택된 파일이 없습니다" }, { status: 400 });

    // 토큰 검증
    const { data: gallery } = await sb
      .from("select_galleries")
      .select("id, share_token, status, allow_resubmit, client_id, workflow_run_id")
      .eq("id", params.id)
      .single();

    if (!gallery) return NextResponse.json({ ok: false, error: "갤러리 없음" }, { status: 404 });
    if (gallery.share_token !== share_token)
      return NextResponse.json({ ok: false, error: "인증 오류" }, { status: 403 });
    if (gallery.status === "selection_submitted" && !gallery.allow_resubmit)
      return NextResponse.json({ ok: false, error: "이미 제출이 완료되었습니다" }, { status: 409 });

    const now = new Date().toISOString();

    // 기존 선택 삭제 (재제출 허용 시)
    if (gallery.allow_resubmit) {
      await sb.from("client_photo_selections").delete().eq("gallery_id", params.id);
    }

    const { data: selection, error: selErr } = await sb
      .from("client_photo_selections")
      .insert({
        gallery_id: params.id,
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

    // 갤러리 상태 업데이트
    await sb
      .from("select_galleries")
      .update({
        status: "selection_submitted",
        selected_count: selected_files.length,
        submitted_at: now,
        updated_at: now,
      })
      .eq("id", params.id);

    return NextResponse.json({ ok: true, selection });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
