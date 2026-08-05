import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToCanvasObject } from "@/lib/youtube-editing/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ objectId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { objectId } = await params;
  const body = await req.json().catch(() => null) as Partial<{
    x: number; y: number; width: number; height: number; label: string; color: string; zIndex: number;
  }> | null;
  if (!body) return NextResponse.json({ ok: false, error: "요청 본문이 올바르지 않습니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: existing, error: existingError } = await db.from("youtube_editing_canvas_objects").select("*").eq("id", objectId).maybeSingle();
  if (existingError) return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ ok: false, error: "요소를 찾을 수 없습니다." }, { status: 404 });

  const nextData = { ...(existing.object_data ?? {}), ...body };
  delete (nextData as any).zIndex;
  const patch: Record<string, unknown> = { object_data: nextData, updated_at: new Date().toISOString() };
  if (typeof body.zIndex === "number") patch.sort_order = body.zIndex;

  const { data, error } = await db.from("youtube_editing_canvas_objects").update(patch).eq("id", objectId).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "요소를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, canvasObject: rowToCanvasObject(data) });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { objectId } = await params;
  const db = getSupabaseAdmin();
  const { error } = await db.from("youtube_editing_canvas_objects").delete().eq("id", objectId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
