import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { HBD_CHANNEL_CRITERIA } from "@/lib/hospitalBrandDiagnosis/channelCriteria";
import { HBD_CHANNEL_LABEL, HBD_SYSTEM_PRINCIPLES, stripForbiddenPhrases } from "@/lib/hospitalBrandDiagnosis/config";
import type { ChannelScores, DiagnosisChannel, ScoreValue } from "@/lib/hospitalBrandDiagnosis/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SCORE_KEYS: (keyof ChannelScores)[] = [
  "informationClarity", "visualUtilization", "brandConsistency", "channelSuitability", "technicalReadiness",
];

function normalizeScore(raw: any, evidenceIds: string[]): ScoreValue {
  const value = raw?.value === null || raw?.value === undefined ? null : Math.max(0, Math.min(100, Number(raw.value) || 0));
  return {
    value,
    reason: stripForbiddenPhrases(String(raw?.reason || "")),
    evidenceIds: Array.isArray(raw?.evidenceIds) ? raw.evidenceIds.filter((id: string) => evidenceIds.includes(id)) : [],
  };
}

async function analyzeSingleChannel(
  apiKey: string,
  diagnosisId: string,
  channel: DiagnosisChannel,
  hospitalName: string,
  specialty: string,
  snapshot: any,
  assets: any[],
  evidence: any[],
) {
  const criteria = HBD_CHANNEL_CRITERIA[channel] ?? HBD_CHANNEL_CRITERIA.other;
  const evidenceList = evidence.map((e, i) => `[${e.id}] ${e.statement} (신뢰도:${e.confidence})`).join("\n") || "(수집된 근거 없음)";
  const assetSummary = assets.map((a) => {
    if (String(a.mime_type || "").startsWith("video/")) {
      const v = a.analysis_json || {};
      return `- ${a.file_name} (영상, 분석범위=${v.status || "unsupported"}): ${(v.limitations || []).join(" ") || "제목 등 기본 정보만 참고"}`;
    }
    return `- ${a.file_name}: 분류=${a.category || a.analysis_json?.category || "미분류"}, 소견=${a.analysis_json?.analysisNote || a.analysis_json?.sceneMeaning || "(분석 없음)"}`;
  }).join("\n") || "(업로드된 이미지 없음)";

  const prompt = `${HBD_SYSTEM_PRINCIPLES}

병원: ${hospitalName} (${specialty})
채널: ${HBD_CHANNEL_LABEL[channel]}

이 채널의 평가 기준(참고용):
${criteria.map((c) => `- ${c}`).join("\n")}

[자동 수집된 페이지 정보]
${snapshot ? JSON.stringify(snapshot).slice(0, 3000) : "(자동 수집 데이터 없음 — 업로드 자료만으로 판단)"}

[업로드된 이미지 분석 결과]
${assetSummary}

[근거 목록 — 결론을 낼 때 evidenceIds에 아래 대괄호 안의 ID를 인용하라]
${evidenceList}

반드시 아래 JSON 형식으로만 응답하라. 확인할 수 없는 항목은 value를 null로 두고 unavailableChecks에 이유를 적어라. 점수를 임의로 추정하지 마라.

{
  "summary": "이 채널에 대한 종합 소견 2~4문장",
  "scores": {
    "informationClarity": { "value": 0-100 또는 null, "reason": "근거", "evidenceIds": ["id"] },
    "visualUtilization": { "value": 0-100 또는 null, "reason": "근거", "evidenceIds": ["id"] },
    "brandConsistency": { "value": 0-100 또는 null, "reason": "근거", "evidenceIds": ["id"] },
    "channelSuitability": { "value": 0-100 또는 null, "reason": "근거", "evidenceIds": ["id"] },
    "technicalReadiness": { "value": 0-100 또는 null, "reason": "근거", "evidenceIds": ["id"] }
  },
  "strengths": ["잘하고 있는 점"],
  "missingInformation": ["환자가 확인하기 어려운 정보"],
  "immediateActions": ["현재 자료로 바로 수정 가능한 항목 (촬영/제작 금지)"],
  "reusableAssets": ["이 채널의 자료를 다른 채널에 재배치할 수 있는 아이디어"],
  "unavailableChecks": ["확인하지 못한 항목과 이유"]
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1800, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "채널 분석 API 오류");
  const text: string = data.content?.[0]?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("채널 분석 결과를 파싱하지 못했습니다.");
  const parsed = JSON.parse(match[0]);

  const evidenceIds = evidence.map((e) => e.id);
  const scores: Record<string, ScoreValue> = {};
  for (const key of SCORE_KEYS) scores[key] = normalizeScore(parsed.scores?.[key], evidenceIds);

  return {
    channel,
    scores_json: scores,
    summary: stripForbiddenPhrases(String(parsed.summary || "")),
    strengths_json: (parsed.strengths || []).map((s: string) => stripForbiddenPhrases(s)).filter(Boolean),
    missing_information_json: (parsed.missingInformation || []).map((s: string) => stripForbiddenPhrases(s)).filter(Boolean),
    immediate_actions_json: (parsed.immediateActions || []).map((s: string) => stripForbiddenPhrases(s)).filter(Boolean),
    reusable_assets_json: (parsed.reusableAssets || []).map((s: string) => stripForbiddenPhrases(s)).filter(Boolean),
    unavailable_checks_json: (parsed.unavailableChecks || []).map((s: string) => String(s)).filter(Boolean),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const diagnosisId = String(body.diagnosisId || "");
    if (!diagnosisId) return NextResponse.json({ ok: false, error: "diagnosisId가 필요합니다." }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });

    const supabase = getSupabaseAdmin();
    const { data: diagnosis, error: diagnosisError } = await supabase
      .from("hospital_brand_diagnoses").select("id, hospital_name, specialty").eq("id", diagnosisId).maybeSingle();
    if (diagnosisError) throw new Error(diagnosisError.message);
    if (!diagnosis) return NextResponse.json({ ok: false, error: "진단 세션을 찾을 수 없습니다." }, { status: 404 });

    await supabase.from("hospital_brand_diagnoses").update({ status: "analyzing" }).eq("id", diagnosisId);

    const [sourcesRes, assetsRes, evidenceRes] = await Promise.all([
      supabase.from("hospital_brand_diagnosis_sources").select("*").eq("diagnosis_id", diagnosisId),
      supabase.from("hospital_brand_diagnosis_assets").select("*").eq("diagnosis_id", diagnosisId),
      supabase.from("hospital_brand_diagnosis_evidence").select("*").eq("diagnosis_id", diagnosisId),
    ]);
    if (sourcesRes.error) throw new Error(sourcesRes.error.message);
    if (assetsRes.error) throw new Error(assetsRes.error.message);
    if (evidenceRes.error) throw new Error(evidenceRes.error.message);

    const requestedChannel = body.channel as DiagnosisChannel | undefined;
    const targetChannels = requestedChannel
      ? (sourcesRes.data ?? []).filter((s) => s.channel === requestedChannel)
      : (sourcesRes.data ?? []).filter((s) => s.status !== "pending");

    if (targetChannels.length === 0) {
      return NextResponse.json({ ok: false, error: "분석할 채널 자료가 없습니다. 먼저 자료를 수집하거나 업로드해주세요." }, { status: 400 });
    }

    const results: any[] = [];
    for (const source of targetChannels) {
      const channel = source.channel as DiagnosisChannel;
      const channelAssets = (assetsRes.data ?? []).filter((a) => a.channel === channel);
      const channelEvidence = (evidenceRes.data ?? []).filter((e) => e.channel === channel);
      // 업로드/수집 자료가 전혀 없는 채널은 AI를 호출하지 않고 확인 불가로만 기록한다.
      if (!source.snapshot_json && channelAssets.length === 0) {
        const emptyScores: Record<string, ScoreValue> = {};
        for (const key of SCORE_KEYS) emptyScores[key] = { value: null, reason: "수집된 자료 없음", evidenceIds: [] };
        const row = {
          diagnosis_id: diagnosisId, channel,
          scores_json: emptyScores, summary: "이 채널은 자동 수집과 업로드 자료가 모두 없어 분석할 수 없습니다.",
          strengths_json: [], missing_information_json: [], immediate_actions_json: [],
          reusable_assets_json: [], unavailable_checks_json: ["채널 전체 — 수집/업로드된 자료 없음"],
        };
        await supabase.from("hospital_brand_diagnosis_channel_results").upsert(row, { onConflict: "diagnosis_id,channel" });
        results.push(row);
        continue;
      }

      try {
        const analyzed = await analyzeSingleChannel(
          apiKey, diagnosisId, channel, diagnosis.hospital_name, diagnosis.specialty,
          source.snapshot_json, channelAssets, channelEvidence,
        );
        const row = { diagnosis_id: diagnosisId, ...analyzed };
        const { error: upsertError } = await supabase
          .from("hospital_brand_diagnosis_channel_results").upsert(row, { onConflict: "diagnosis_id,channel" });
        if (upsertError) throw new Error(upsertError.message);
        results.push(row);
      } catch (error) {
        const message = error instanceof Error ? error.message : "채널 분석 실패";
        results.push({ diagnosis_id: diagnosisId, channel, error: message });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "채널 진단 실패" }, { status: 500 });
  }
}
