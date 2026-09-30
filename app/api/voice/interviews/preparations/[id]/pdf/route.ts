import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/voice/config";
import { buildInterviewQuestionPdfHtml } from "@/lib/voice/interview/pdf/buildInterviewQuestionPdfHtml";
import { asPreparationVersion, VOICE_INTERVIEW_DOCUMENTS_BUCKET } from "@/lib/voice/interview/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "인터뷰 준비 ID가 올바르지 않습니다." }, { status: 400 });
  try {
    const supabase = getSupabaseAdmin();
    const versionId = request.nextUrl.searchParams.get("version");
    const { data: preparation, error: preparationError } = await supabase
      .from("voice_interview_preparations").select("current_version_id").eq("id", id).maybeSingle();
    if (preparationError) throw preparationError;
    const targetVersionId = isUuid(versionId) ? versionId : preparation?.current_version_id;
    if (!isUuid(targetVersionId)) return NextResponse.json({ error: "생성된 인터뷰 질문지가 없습니다." }, { status: 404 });
    const { data: rawVersion, error: versionError } = await supabase
      .from("voice_interview_preparation_versions").select("*").eq("id", targetVersionId).eq("preparation_id", id).maybeSingle();
    if (versionError) throw versionError;
    if (!rawVersion) return NextResponse.json({ error: "인터뷰 질문지를 찾을 수 없습니다." }, { status: 404 });
    const version = asPreparationVersion(rawVersion);
    if (request.nextUrl.searchParams.get("preview") === "html") {
      return new NextResponse(buildInterviewQuestionPdfHtml({
        hospitalName: version.hospital_name,
        intervieweeName: version.interviewee_name,
        interviewDate: version.interview_date,
        selectedQuestions: version.selected_questions,
      }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store, max-age=0" } });
    }
    if (!version.pdf_storage_path) return NextResponse.json({ error: "질문지 PDF가 아직 생성되지 않았습니다." }, { status: 409 });
    const { data: signed, error: signedError } = await supabase.storage
      .from(VOICE_INTERVIEW_DOCUMENTS_BUCKET).createSignedUrl(version.pdf_storage_path, 60 * 10);
    if (signedError || !signed?.signedUrl) throw signedError || new Error("PDF 다운로드 링크를 만들지 못했습니다.");
    return NextResponse.redirect(signed.signedUrl, 307);
  } catch (error) {
    console.error("[voice/interviews/pdf]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "인터뷰 질문지를 불러오지 못했습니다." }, { status: 500 });
  }
}
