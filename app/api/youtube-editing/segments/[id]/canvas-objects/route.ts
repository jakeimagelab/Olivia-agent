import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToCanvasObject } from "@/lib/youtube-editing/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: segmentId } = await params;
  const body = await req.json().catch(() => null) as {
    projectId?: string; type?: string; x?: number; y?: number; width?: number; height?: number; label?: string; color?: string; poseKey?: string;
  } | null;
  if (!body?.projectId || !body?.type) return NextResponse.json({ ok: false, error: "projectId/type이 필요합니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: last } = await db
    .from("youtube_editing_canvas_objects")
    .select("sort_order")
    .eq("segment_id", segmentId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (last?.sort_order ?? -1) + 1;

  const { data, error } = await db
    .from("youtube_editing_canvas_objects")
    .insert({
      project_id: body.projectId,
      segment_id: segmentId,
      object_type: body.type,
      object_data: {
        x: body.x ?? 0.1,
        y: body.y ?? 0.1,
        width: body.width ?? 0.22,
        height: body.height ?? 0.16,
        label: body.label ?? "",
        color: body.color ?? "#EAF4F2",
      },
      sort_order: sortOrder,
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "요소 추가 실패" }, { status: 500 });
  return NextResponse.json({ ok: true, canvasObject: rowToCanvasObject(data) }, { status: 201 });
}
