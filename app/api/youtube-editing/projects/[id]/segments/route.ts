import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { defaultCaptionConfig, defaultVisualConfig, estimateDurationSec } from "@/lib/youtube-editing/constants";
import { rowToSegment } from "@/lib/youtube-editing/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// 새 문장(추가/복제/분리)을 특정 문장 바로 뒤에 끼워 넣는다. afterSegmentId가 없으면 맨 끝에 추가한다.
export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const body = await req.json().catch(() => null) as { scriptText?: string; afterSegmentId?: string } | null;
  const scriptText = body?.scriptText?.trim() ?? "";
  const db = getSupabaseAdmin();

  const { data: existing, error: existingError } = await db
    .from("youtube_editing_segments")
    .select("id, sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (existingError) return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });

  const rows = existing ?? [];
  let targetOrder = rows.length;
  if (body?.afterSegmentId) {
    const afterIndex = rows.findIndex((row) => row.id === body.afterSegmentId);
    if (afterIndex >= 0) targetOrder = afterIndex + 1;
  }

  const toShift = rows.filter((row) => row.sort_order >= targetOrder);
  if (toShift.length) {
    await Promise.all(toShift.map((row) =>
      db.from("youtube_editing_segments").update({ sort_order: row.sort_order + 1 }).eq("id", row.id),
    ));
  }

  const { data, error } = await db
    .from("youtube_editing_segments")
    .insert({
      project_id: projectId,
      sort_order: targetOrder,
      script_text: scriptText,
      estimated_duration_sec: scriptText ? estimateDurationSec(scriptText) : null,
      camera: [],
      caption: defaultCaptionConfig(),
      visual: defaultVisualConfig(),
      sound_effect: "없음",
      transition: "컷",
      template: "없음",
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "문장 추가 실패" }, { status: 500 });
  return NextResponse.json({ ok: true, segment: rowToSegment(data) }, { status: 201 });
}

// 드래그/이동 버튼으로 바뀐 전체 순서를 한 번에 반영한다.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const body = await req.json().catch(() => null) as { orderedIds?: string[] } | null;
  if (!Array.isArray(body?.orderedIds) || !body.orderedIds.length) {
    return NextResponse.json({ ok: false, error: "순서 정보가 올바르지 않습니다." }, { status: 400 });
  }
  const db = getSupabaseAdmin();
  await Promise.all(body.orderedIds.map((segmentId, index) =>
    db.from("youtube_editing_segments").update({ sort_order: index, updated_at: new Date().toISOString() })
      .eq("id", segmentId).eq("project_id", projectId),
  ));
  return NextResponse.json({ ok: true });
}
