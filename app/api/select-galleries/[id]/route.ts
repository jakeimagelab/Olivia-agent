import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGalleryImages, getLatestSelection, getRawMatches } from "@/lib/selectGallery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const sb = getSupabaseAdmin();
    const { data: gallery, error } = await sb
      .from("select_galleries")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !gallery) return NextResponse.json({ ok: false, error: "갤러리 없음" }, { status: 404 });

    const [images, selection, rawMatches] = await Promise.all([
      getGalleryImages(sb, id),
      getLatestSelection(sb, id),
      getRawMatches(sb, id),
    ]);

    return NextResponse.json({ ok: true, gallery, images, selection, rawMatches });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("select_galleries")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, gallery: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
