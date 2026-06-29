import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("video_conti")
      .select("id, title, hospital_name, status, created_at, bgm_sections, scenes")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = (data ?? []).map((r: any) => ({
      ...r,
      scenes_count: Array.isArray(r.scenes) ? r.scenes.length : 0,
    }));

    return NextResponse.json({ ok: true, data: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { clientId, title, hospitalName, sourceUrl, brandAnalysis } = await req.json();

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("video_conti")
      .insert({
        client_id: clientId ?? null,
        title: title ?? "제목 없음",
        hospital_name: hospitalName ?? null,
        source_url: sourceUrl ?? null,
        brand_analysis: brandAnalysis ?? null,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
