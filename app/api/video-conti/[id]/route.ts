import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(_req: NextRequest, ctx: any) {
  try {
    const { id } = await ctx.params;
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("video_conti")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function PATCH(req: NextRequest, ctx: any) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const allowed = ["scenes", "status", "title", "bgm_filename", "bgm_storage_path",
      "bgm_duration_seconds", "bgm_tempo_bpm", "bgm_key", "bgm_sections"];

    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) update[key] = body[key];
    }

    const db = getSupabaseAdmin();
    const { error } = await db.from("video_conti").update(update).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function DELETE(_req: NextRequest, ctx: any) {
  try {
    const { id } = await ctx.params;
    const db = getSupabaseAdmin();
    const { error } = await db.from("video_conti").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
