import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/hospitalBrandDiagnosis/validation";
import type { HospitalBrandDiagnosisReport } from "@/lib/hospitalBrandDiagnosis/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
}

// 섹션 13: 결과를 이메일로 받기 — 기존 mailing_queue 발송 파이프라인(app/api/mailing/send)에
// 초안으로 얹는다. 본문에는 전체 리포트를 그대로 넣지 않고 요약만 담고, 링크는 로그인해야
// 열리는 관리자 화면으로 보낸다(섹션 13-3: 결과 링크를 공개 URL로 만들지 않는다).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "diagnosisId가 올바르지 않습니다." }, { status: 400 });

    const body = await req.json();
    const toEmail = String(body.toEmail || "").trim();
    if (!isValidEmail(toEmail)) return NextResponse.json({ ok: false, error: "이메일 형식이 올바르지 않습니다." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: diagnosis, error: diagnosisError } = await supabase
      .from("hospital_brand_diagnoses")
      .select("id, hospital_name, client_id, report_json, status, created_at")
      .eq("id", id).maybeSingle();
    if (diagnosisError) throw new Error(diagnosisError.message);
    if (!diagnosis) return NextResponse.json({ ok: false, error: "진단 세션을 찾을 수 없습니다." }, { status: 404 });
    if (diagnosis.status !== "completed" || !diagnosis.report_json) {
      return NextResponse.json({ ok: false, error: "완료된 진단만 이메일로 보낼 수 있습니다." }, { status: 400 });
    }

    const report = diagnosis.report_json as HospitalBrandDiagnosisReport;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
    const reportLink = siteUrl
      ? `${siteUrl.replace(/\/$/, "")}/hospital-brand-image-diagnosis?resume=${id}`
      : `/hospital-brand-image-diagnosis (진단ID: ${id})`;

    const strengthsText = report.strengths.slice(0, 5).map((s) => `· ${s}`).join("\n") || "(없음)";
    const actionsText = report.immediateActions.slice(0, 5).map((s) => `· ${s}`).join("\n") || "(없음)";

    const subject = `[병원브랜드이미지 진단] ${diagnosis.hospital_name} 진단 결과`;
    const bodyText = `${diagnosis.hospital_name} 병원브랜드이미지 진단 결과입니다.

[종합 요약]
${report.overallSummary}

[잘하고 있는 점]
${strengthsText}

[바로 수정할 수 있는 항목]
${actionsText}

전체 리포트는 아래 링크(로그인 필요)에서 확인하실 수 있습니다.
${reportLink}

이 진단은 검색 노출, 순위 또는 AI 답변 인용을 보장하지 않습니다.`;

    const { data: mailing, error: mailingError } = await supabase
      .from("mailing_queue")
      .insert({
        type: "hbd_report",
        source_module: "hospital-brand-diagnosis",
        source_id: id,
        hospital_name: diagnosis.hospital_name,
        client_id: diagnosis.client_id,
        to_email: toEmail,
        subject,
        body: bodyText,
        attachments: [],
        links: [{ label: "리포트 보기", url: reportLink }],
        status: "ready",
      })
      .select("id")
      .single();
    if (mailingError) throw new Error(mailingError.message);

    await supabase.from("hospital_brand_diagnoses").update({ email_sent_at: new Date().toISOString() }).eq("id", id);

    return NextResponse.json({ ok: true, mailingId: mailing.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "이메일 준비 실패" }, { status: 500 });
  }
}
