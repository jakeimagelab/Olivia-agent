import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/voice/config";
import { buildInterviewQuestionPdfHtml } from "@/lib/voice/interview/pdf/buildInterviewQuestionPdfHtml";
import { renderInterviewQuestionPdf } from "@/lib/voice/interview/pdf/renderInterviewQuestionPdf";
import { asPreparation, asPreparationVersion, interviewVersionStoragePath, VOICE_INTERVIEW_DOCUMENTS_BUCKET } from "@/lib/voice/interview/server";
import { nextInterviewVersionNumber, validateInterviewPreparation } from "@/lib/voice/interview/preparation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

async function persistReadyError(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : "질문지 PDF 생성에 실패했습니다.";
  const { error: updateError } = await getSupabaseAdmin().from("voice_interview_preparations").update({
    status: "draft",
    ready_error: message.slice(0, 4_000),
  }).eq("id", id);
  if (updateError) console.error("[voice/interviews/ready:error-state]", updateError);
  return message;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "인터뷰 준비 ID가 올바르지 않습니다." }, { status: 400 });
  const supabase = getSupabaseAdmin();
  try {
    const { data: rawPreparation, error: preparationError } = await supabase
      .from("voice_interview_preparations").select("*").eq("id", id).maybeSingle();
    if (preparationError) throw preparationError;
    if (!rawPreparation) return NextResponse.json({ error: "인터뷰 준비를 찾을 수 없습니다." }, { status: 404 });
    const preparation = asPreparation(rawPreparation);
    if (preparation.status === "recording") return NextResponse.json({ error: "진행 중인 인터뷰는 다시 준비 완료할 수 없습니다." }, { status: 409 });

    const validated = validateInterviewPreparation({
      hospitalName: preparation.hospital_name,
      intervieweeName: preparation.interviewee_name,
      selectedQuestions: preparation.selected_questions,
      templateKey: preparation.template_key,
      templateVersion: preparation.template_version,
    });
    const { data: existingVersions, error: versionsError } = await supabase
      .from("voice_interview_preparation_versions").select("version_no").eq("preparation_id", id);
    if (versionsError) throw versionsError;
    const versionNo = nextInterviewVersionNumber(existingVersions ?? []);
    const { data: rawVersion, error: versionError } = await supabase.from("voice_interview_preparation_versions").insert({
      preparation_id: id,
      version_no: versionNo,
      hospital_name: validated.hospitalName,
      interviewee_name: validated.intervieweeName,
      interview_date: preparation.interview_date,
      template_key: preparation.template_key,
      template_version: preparation.template_version,
      selected_questions: validated.selectedQuestions,
    }).select("*").single();
    if (versionError || !rawVersion) throw versionError || new Error("인터뷰 질문 Snapshot을 저장하지 못했습니다.");
    const version = asPreparationVersion(rawVersion);
    const path = interviewVersionStoragePath(id, versionNo);

    const pdf = await renderInterviewQuestionPdf({
      hospitalName: version.hospital_name,
      intervieweeName: version.interviewee_name,
      interviewDate: version.interview_date,
      selectedQuestions: version.selected_questions,
    });
    const { error: uploadError } = await supabase.storage.from(VOICE_INTERVIEW_DOCUMENTS_BUCKET).upload(path, pdf, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const now = new Date().toISOString();
    const { data: storedVersion, error: storedVersionError } = await supabase
      .from("voice_interview_preparation_versions")
      .update({ pdf_storage_path: path, pdf_created_at: now })
      .eq("id", version.id).select("*").single();
    if (storedVersionError || !storedVersion) throw storedVersionError || new Error("질문지 PDF 경로를 저장하지 못했습니다.");
    const { data: readyPreparation, error: readyError } = await supabase.from("voice_interview_preparations").update({
      selected_questions: validated.selectedQuestions,
      current_version_id: version.id,
      status: "ready",
      ready_at: now,
      ready_error: null,
    }).eq("id", id).select("*").single();
    if (readyError || !readyPreparation) throw readyError || new Error("인터뷰 준비 완료 상태를 저장하지 못했습니다.");
    return NextResponse.json({ preparation: readyPreparation, version: storedVersion, previewHtml: buildInterviewQuestionPdfHtml({
      hospitalName: version.hospital_name,
      intervieweeName: version.interviewee_name,
      interviewDate: version.interview_date,
      selectedQuestions: version.selected_questions,
    }) });
  } catch (error) {
    const message = await persistReadyError(id, error);
    console.error("[voice/interviews/ready]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
