import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { defaultCaptionConfig, defaultVisualConfig, estimateDurationSec, splitScriptIntoSentences } from "@/lib/youtube-editing/constants";
import { rowToProject, rowToSegment } from "@/lib/youtube-editing/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const latest = new URL(req.url).searchParams.get("latest") === "true";
  if (latest) {
    const { data, error } = await db
      .from("youtube_editing_projects")
      .select("*")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, project: data ? rowToProject(data) : null });
  }
  const { data, error } = await db
    .from("youtube_editing_projects")
    .select("id, title, status, updated_at")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, projects: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    title?: string; hospitalName?: string; fullScript?: string; videoRatio?: string; preferredTone?: string;
  } | null;
  const fullScript = body?.fullScript?.trim() ?? "";
  const db = getSupabaseAdmin();

  const { data: projectRow, error: projectError } = await db
    .from("youtube_editing_projects")
    .insert({
      title: body?.title?.trim() || "제목 없음",
      hospital_name: body?.hospitalName || null,
      full_script: fullScript,
      video_ratio: body?.videoRatio === "9:16" ? "9:16" : "16:9",
      preferred_tone: body?.preferredTone || null,
      status: "draft",
    })
    .select("*")
    .single();
  if (projectError || !projectRow) return NextResponse.json({ ok: false, error: projectError?.message ?? "프로젝트 생성 실패" }, { status: 500 });

  const sentences = fullScript ? splitScriptIntoSentences(fullScript) : [];
  let segmentRows: any[] = [];
  if (sentences.length) {
    const { data, error } = await db
      .from("youtube_editing_segments")
      .insert(sentences.map((text, index) => ({
        project_id: projectRow.id,
        sort_order: index,
        script_text: text,
        estimated_duration_sec: estimateDurationSec(text),
        camera: [],
        caption: defaultCaptionConfig(),
        visual: defaultVisualConfig(),
        sound_effect: "없음",
        transition: "컷",
        template: "없음",
      })))
      .select("*");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    segmentRows = data ?? [];
  }

  return NextResponse.json({
    ok: true,
    project: rowToProject(projectRow),
    segments: segmentRows.map(rowToSegment).sort((a, b) => a.sortOrder - b.sortOrder),
  }, { status: 201 });
}
