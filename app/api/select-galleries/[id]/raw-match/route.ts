import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 관리자가 매칭 결과를 저장 (RAW 스캔은 클라이언트에서 File System Access API로 처리)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = getSupabaseAdmin();
    const { selection_id, matches } = await req.json();
    // matches: Array<{ selected_jpg, selected_basename, matched_raw?, raw_extension?, status, note? }>

    if (!selection_id || !Array.isArray(matches))
      return NextResponse.json({ ok: false, error: "selection_id와 matches 필수" }, { status: 400 });

    const { data: gallery } = await sb
      .from("select_galleries")
      .select("id, client_id, workflow_run_id")
      .eq("id", params.id)
      .single();
    if (!gallery) return NextResponse.json({ ok: false, error: "갤러리 없음" }, { status: 404 });

    // 기존 매칭 결과 삭제
    await sb.from("select_raw_matches").delete().eq("gallery_id", params.id);

    const rows = matches.map((m: any) => ({
      gallery_id: params.id,
      selection_id,
      client_id: gallery.client_id,
      workflow_run_id: gallery.workflow_run_id,
      selected_jpg: m.selected_jpg,
      selected_basename: m.selected_basename,
      matched_raw: m.matched_raw ?? null,
      raw_extension: m.raw_extension ?? null,
      status: m.status,
      note: m.note ?? null,
    }));

    const { data: inserted, error: insErr } = await sb
      .from("select_raw_matches")
      .insert(rows)
      .select();
    if (insErr) throw insErr;

    const matchedCount = rows.filter(r => r.status === "matched").length;

    await sb
      .from("select_galleries")
      .update({ status: "raw_matched", updated_at: new Date().toISOString() })
      .eq("id", params.id);

    return NextResponse.json({ ok: true, total: rows.length, matched: matchedCount, rawMatches: inserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
