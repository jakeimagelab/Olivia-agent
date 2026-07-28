import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { HBD_CHANNEL_LABEL, HBD_CHANNEL_ROLE, HBD_SYSTEM_PRINCIPLES, stripForbiddenPhrases } from "@/lib/hospitalBrandDiagnosis/config";
import type {
  DiagnosisChannel, HospitalBrandDiagnosisReport, HospitalBrandProfile, VisualComposition,
} from "@/lib/hospitalBrandDiagnosis/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function cleanArray(value: any): string[] {
  return Array.isArray(value) ? value.map((v) => stripForbiddenPhrases(String(v))).filter(Boolean) : [];
}

function computeVisualComposition(assets: any[]): VisualComposition[] {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    const category = asset.category || asset.analysis_json?.category || "미분류";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const total = assets.length;
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count, ratio: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count);
}

export async function POST(req: NextRequest) {
  let diagnosisId = "";
  try {
    const body = await req.json();
    diagnosisId = String(body.diagnosisId || "");
    if (!diagnosisId) return NextResponse.json({ ok: false, error: "diagnosisId가 필요합니다." }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });

    const supabase = getSupabaseAdmin();
    const { data: diagnosis, error: diagnosisError } = await supabase
      .from("hospital_brand_diagnoses").select("*").eq("id", diagnosisId).maybeSingle();
    if (diagnosisError) throw new Error(diagnosisError.message);
    if (!diagnosis) return NextResponse.json({ ok: false, error: "진단 세션을 찾을 수 없습니다." }, { status: 404 });

    const [sourcesRes, assetsRes, channelResultsRes, evidenceRes] = await Promise.all([
      supabase.from("hospital_brand_diagnosis_sources").select("*").eq("diagnosis_id", diagnosisId),
      supabase.from("hospital_brand_diagnosis_assets").select("*").eq("diagnosis_id", diagnosisId),
      supabase.from("hospital_brand_diagnosis_channel_results").select("*").eq("diagnosis_id", diagnosisId),
      supabase.from("hospital_brand_diagnosis_evidence").select("*").eq("diagnosis_id", diagnosisId),
    ]);
    if (sourcesRes.error) throw new Error(sourcesRes.error.message);
    if (assetsRes.error) throw new Error(assetsRes.error.message);
    if (channelResultsRes.error) throw new Error(channelResultsRes.error.message);
    if (evidenceRes.error) throw new Error(evidenceRes.error.message);

    const channelResults = channelResultsRes.data ?? [];
    if (channelResults.length === 0) {
      return NextResponse.json({ ok: false, error: "채널별 분석을 먼저 완료해주세요." }, { status: 400 });
    }

    const profile = diagnosis.profile_json as HospitalBrandProfile;
    const visualComposition = computeVisualComposition(assetsRes.data ?? []);

    const channelSummaryText = channelResults.map((r) => {
      const scores = r.scores_json || {};
      const scoreLine = Object.entries(scores).map(([k, v]: [string, any]) => `${k}=${v?.value ?? "확인불가"}`).join(", ");
      return `## ${HBD_CHANNEL_LABEL[r.channel as DiagnosisChannel] ?? r.channel} (역할: ${HBD_CHANNEL_ROLE[r.channel as DiagnosisChannel] ?? ""})
점수: ${scoreLine}
요약: ${r.summary}
강점: ${(r.strengths_json || []).join(" / ") || "없음"}
부족한 정보: ${(r.missing_information_json || []).join(" / ") || "없음"}`;
    }).join("\n\n");

    const activeChannels = channelResults.map((r) => r.channel as DiagnosisChannel);

    const prompt = `${HBD_SYSTEM_PRINCIPLES}

병원: ${diagnosis.hospital_name} (${diagnosis.specialty}${profile?.region ? ", " + profile.region : ""})

[병원이 의도한 브랜드 이미지 — STEP2 응답]
원하는 이미지: ${(profile?.desiredImages || []).join(", ") || "미입력"}
핵심 강점: ${(profile?.coreStrengths || []).join(", ") || "미입력"}
현재 고민: ${(profile?.currentConcerns || []).join(", ") || "미입력"}

[채널별 분석 결과]
${channelSummaryText}

[전체 시각 자료 구성 비율 (프로그램이 집계한 사실 데이터, 참고만 할 것)]
${visualComposition.map((v) => `${v.category}: ${v.count}개 (${v.ratio}%)`).join(", ") || "집계할 자료 없음"}

위 정보를 바탕으로 채널 간 통합 진단을 작성하라. 반드시 아래 JSON 형식으로만 응답하라.

{
  "overallSummary": "전체 종합 요약 2~4문장",
  "desiredVsActual": {
    "desiredImage": ["병원이 의도한 이미지 요소"],
    "actualImage": ["채널에서 실제로 전달되는 이미지 요소"],
    "alignedPoints": ["일치하는 부분"],
    "gaps": ["차이가 있는 부분"]
  },
  "consistentMessages": ["채널 간 일치하는 메시지/정보"],
  "inconsistencies": ["채널 간 불일치하는 정보 (진료시간/의료진/전화번호/로고 등)"],
  "duplicatedAssets": ["여러 채널에서 반복 사용되는 것으로 보이는 이미지 유형"],
  "outdatedInformation": ["오래되었거나 폐기된 것으로 보이는 정보"],
  "channelRoleProblems": ["모든 채널이 같은 콘텐츠만 반복하는 등 역할 분담 문제"],
  "strengths": ["전체 채널에서 잘하고 있는 점 (채널별 강점 통합, 우선 표시)"],
  "missingInformation": ["환자가 여러 채널을 통틀어 확인하기 어려운 정보"],
  "immediateActions": ["바로 수정할 수 있는 항목 통합 (촬영/제작 금지)"],
  "reuseMap": [
    { "assetDescription": "예: 원장 상담 사진", "recommendedChannels": ["website","naver_blog"], "reason": "재배치 이유" }
  ],
  "limitations": ["분석 범위와 한계 — 정밀 분석/화면 기반 분석/확인하지 못한 항목 구분"]
}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2500, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "통합 진단 API 오류");
    const text: string = data.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("통합 진단 결과를 파싱하지 못했습니다.");
    const parsed = JSON.parse(match[0]);

    const validChannels = new Set(activeChannels);
    const reuseMap = Array.isArray(parsed.reuseMap) ? parsed.reuseMap.map((item: any) => ({
      assetDescription: stripForbiddenPhrases(String(item.assetDescription || "")),
      recommendedChannels: (Array.isArray(item.recommendedChannels) ? item.recommendedChannels : []).filter((c: string) => validChannels.has(c as DiagnosisChannel)),
      reason: stripForbiddenPhrases(String(item.reason || "")),
    })).filter((item: any) => item.assetDescription) : [];

    const sourceLimitations = (sourcesRes.data ?? [])
      .filter((s) => s.status === "manual_required" || s.status === "failed" || s.status === "partial")
      .map((s) => `${HBD_CHANNEL_LABEL[s.channel as DiagnosisChannel] ?? s.channel}: ${(s.limitations_json || []).join(" ") || "자료가 제한적입니다."}`);

    const report: HospitalBrandDiagnosisReport = {
      id: diagnosisId,
      clientId: diagnosis.client_id ?? undefined,
      profile,
      sources: (sourcesRes.data ?? []).map((s) => ({
        id: s.id, channel: s.channel, url: s.url || undefined, collectionMethod: s.collection_method,
        status: s.status, evidenceCount: s.evidence_count, collectedAt: s.collected_at || undefined,
        limitations: s.limitations_json || [],
      })),
      channelResults: channelResults.map((r) => ({
        channel: r.channel, summary: r.summary, scores: r.scores_json,
        strengths: r.strengths_json || [], missingInformation: r.missing_information_json || [],
        immediateActions: r.immediate_actions_json || [], reusableAssets: r.reusable_assets_json || [],
        unavailableChecks: r.unavailable_checks_json || [], evidenceIds: [],
      })),
      crossChannel: {
        desiredVsActual: {
          desiredImage: cleanArray(parsed.desiredVsActual?.desiredImage),
          actualImage: cleanArray(parsed.desiredVsActual?.actualImage),
          alignedPoints: cleanArray(parsed.desiredVsActual?.alignedPoints),
          gaps: cleanArray(parsed.desiredVsActual?.gaps),
        },
        consistentMessages: cleanArray(parsed.consistentMessages),
        inconsistencies: cleanArray(parsed.inconsistencies),
        duplicatedAssets: cleanArray(parsed.duplicatedAssets),
        outdatedInformation: cleanArray(parsed.outdatedInformation),
        visualComposition,
        channelRoleProblems: cleanArray(parsed.channelRoleProblems),
      },
      evidence: (evidenceRes.data ?? []).map((e) => ({
        id: e.id, statement: e.statement, channel: e.channel, sourceType: e.source_type,
        sourceId: e.source_id || undefined, reference: e.reference, confidence: e.confidence,
      })),
      overallSummary: stripForbiddenPhrases(String(parsed.overallSummary || "")),
      strengths: cleanArray(parsed.strengths),
      missingInformation: cleanArray(parsed.missingInformation),
      immediateActions: cleanArray(parsed.immediateActions),
      reuseMap,
      limitations: [...cleanArray(parsed.limitations), ...sourceLimitations, "이 분석은 검색 노출, 순위 또는 AI 답변 인용을 보장하지 않습니다."],
      createdAt: diagnosis.created_at,
      updatedAt: new Date().toISOString(),
    };

    const { error: updateError } = await supabase.from("hospital_brand_diagnoses").update({
      status: "completed", overall_summary: report.overallSummary, report_json: report,
    }).eq("id", diagnosisId);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ ok: true, report });
  } catch (error) {
    await getSupabaseAdmin().from("hospital_brand_diagnoses")
      .update({ status: "failed" }).eq("id", req.nextUrl?.searchParams?.get("diagnosisId") ?? "");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "통합 리포트 생성 실패" }, { status: 500 });
  }
}
