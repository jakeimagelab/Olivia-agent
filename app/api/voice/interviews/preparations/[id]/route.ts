import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/voice/config";
import { draftInterviewPreparationInput } from "@/lib/voice/interview/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "인터뷰 준비 ID가 올바르지 않습니다." }, { status: 400 });
  try {
    const supabase = getSupabaseAdmin();
    const [{ data: preparation, error: preparationError }, { data: versions, error: versionsError }] = await Promise.all([
      supabase.from("voice_interview_preparations").select("*").eq("id", id).maybeSingle(),
      supabase.from("voice_interview_preparation_versions").select("*").eq("preparation_id", id).order("version_no", { ascending: false }),
    ]);
    if (preparationError) throw preparationError;
    if (versionsError) throw versionsError;
    if (!preparation) return NextResponse.json({ error: "인터뷰 준비를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ preparation, versions: versions ?? [] }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "인터뷰 준비를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "인터뷰 준비 ID가 올바르지 않습니다." }, { status: 400 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const patch = draftInterviewPreparationInput(body);
    const supabase = getSupabaseAdmin();
    const { data: current, error: currentError } = await supabase.from("voice_interview_preparations").select("*").eq("id", id).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: "인터뷰 준비를 찾을 수 없습니다." }, { status: 404 });
    const changed = current.hospital_name !== patch.hospital_name
      || current.interviewee_name !== patch.interviewee_name
      || current.interview_date !== patch.interview_date
      || JSON.stringify(current.selected_questions ?? []) !== JSON.stringify(patch.selected_questions)
      || current.client_id !== patch.client_id
      || current.workflow_run_id !== patch.workflow_run_id;
    const { data, error } = await supabase.from("voice_interview_preparations").update({
      ...patch,
      revision: Number(current.revision || 0) + (changed ? 1 : 0),
      status: changed && current.status === "ready" ? "draft" : current.status,
      ready_error: null,
    }).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ preparation: data, invalidatedReady: changed && current.status === "ready" });
  } catch (error) {
    console.error("[voice/interviews/preparations:update]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "인터뷰 준비를 저장하지 못했습니다." }, { status: 500 });
  }
}
