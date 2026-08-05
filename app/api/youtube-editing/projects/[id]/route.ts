import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rowToAnnotation, rowToCanvasObject, rowToProject, rowToSegment } from "@/lib/youtube-editing/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: project, error: projectError } = await db.from("youtube_editing_projects").select("*").eq("id", id).maybeSingle();
  if (projectError) return NextResponse.json({ ok: false, error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

  const [{ data: segments, error: segmentsError }, { data: annotations }, { data: canvasObjects }] = await Promise.all([
    db.from("youtube_editing_segments").select("*").eq("project_id", id).order("sort_order", { ascending: true }),
    db.from("youtube_editing_annotations").select("*").eq("project_id", id),
    db.from("youtube_editing_canvas_objects").select("*").eq("project_id", id).order("sort_order", { ascending: true }),
  ]);
  if (segmentsError) return NextResponse.json({ ok: false, error: segmentsError.message }, { status: 500 });

  const annotationsBySegment: Record<string, ReturnType<typeof rowToAnnotation>> = {};
  for (const row of annotations ?? []) annotationsBySegment[row.segment_id] = rowToAnnotation(row);

  const canvasObjectsBySegment: Record<string, ReturnType<typeof rowToCanvasObject>[]> = {};
  for (const row of canvasObjects ?? []) {
    const list = canvasObjectsBySegment[row.segment_id] ?? [];
    list.push(rowToCanvasObject(row));
    canvasObjectsBySegment[row.segment_id] = list;
  }

  return NextResponse.json({
    ok: true,
    project: rowToProject(project),
    segments: (segments ?? []).map(rowToSegment),
    annotationsBySegment,
    canvasObjectsBySegment,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.title === "string") patch.title = body.title.trim();
  if (typeof body?.hospitalName === "string" || body?.hospitalName === null) patch.hospital_name = body.hospitalName;
  if (body?.videoRatio === "16:9" || body?.videoRatio === "9:16") patch.video_ratio = body.videoRatio;
  if (typeof body?.preferredTone === "string" || body?.preferredTone === null) patch.preferred_tone = body.preferredTone;
  if (typeof body?.status === "string") patch.status = body.status;

  const db = getSupabaseAdmin();
  const { data, error } = await db.from("youtube_editing_projects").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, project: rowToProject(data) });
}
