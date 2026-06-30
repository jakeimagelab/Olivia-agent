import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const sb = getSupabaseAdmin();
    const { selection_id, matches } = await req.json();

    if (!selection_id || !Array.isArray(matches))
      return NextResponse.json({ ok: false, error: "selection_id와 matches 필수" }, { status: 400 });

    const { data: gallery } = await sb
      .from("select_galleries")
      .select("id, client_id, workflow_run_id")
      .eq("id", id)
      .single();
    if (!gallery) return NextResponse.json({ ok: false, error: "갤러리 없음" }, { status: 404 });

    await sb.from("select_raw_matches").delete().eq("gallery_id", id);

    const rows = matches.map((m: any) => ({
      gallery_id: id,
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
      .from("select_raw_matches").insert(rows).select();
    if (insErr) throw insErr;

    const matchedCount = rows.filter(r => r.status === "matched").length;

    await sb
      .from("select_galleries")
      .update({ status: "raw_matched", updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ ok: true, total: rows.length, matched: matchedCount, rawMatches: inserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
