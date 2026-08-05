import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToAnnotation } from "@/lib/youtube-editing/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// 손글씨 자동저장 대상 — segment_id가 유니크라 upsert 한 번으로 항상 최신 상태를 반영한다.
export async function PUT(req: NextRequest, { params }: Params) {
  const { id: segmentId } = await params;
  const body = await req.json().catch(() => null) as { projectId?: string; strokes?: unknown; canvasWidth?: number; canvasHeight?: number } | null;
  if (!body?.projectId) return NextResponse.json({ ok: false, error: "projectId가 필요합니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("youtube_editing_annotations")
    .upsert({
      project_id: body.projectId,
      segment_id: segmentId,
      strokes: Array.isArray(body.strokes) ? body.strokes : [],
      canvas_width: body.canvasWidth ?? null,
      canvas_height: body.canvasHeight ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "segment_id" })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "손글씨 저장 실패" }, { status: 500 });
  return NextResponse.json({ ok: true, annotation: rowToAnnotation(data) });
}
