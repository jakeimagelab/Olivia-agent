import { NextResponse } from "next/server";
import { AI_TRUST_EVIDENCE_SCHEMAS } from "@/lib/ai-trust/constants";
import { calculateAiTrustScore } from "@/lib/ai-trust/scoring";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const [{ data: hospitals }, { data: facts }, { data: consensus }, { data: project }] = await Promise.all([
    supabase.from("ai_trust_hospitals").select("id, canonical_name").eq("project_id", id),
    supabase.from("ai_trust_evidence_facts").select("schema_key, hospital_id, document_id, consistency").eq("project_id", id),
    supabase.from("ai_trust_consensus_stats").select("hospital_id, mention_rate").eq("project_id", id),
    supabase.from("ai_trust_projects").select("client_hospital_name").eq("id", id).single(),
  ]);

  const topHospitalIds = new Set((consensus || []).sort((a, b) => Number(b.mention_rate) - Number(a.mention_rate)).slice(0, 10).map((row) => row.hospital_id));
  const clientHospital = (hospitals || []).find((hospital) => hospital.canonical_name.includes(project?.client_hospital_name || ""));
  const scoreRows: Record<string, unknown>[] = [];

  for (const hospital of hospitals || []) {
    for (const schema of AI_TRUST_EVIDENCE_SCHEMAS) {
      const matched = (facts || []).filter((fact) => fact.hospital_id === hospital.id && fact.schema_key === schema.key);
      const documentIds = new Set(matched.map((fact) => fact.document_id));
      const highConsistency = matched.filter((fact) => fact.consistency === "HIGH").length;
      const mediumConsistency = matched.filter((fact) => fact.consistency === "MEDIUM").length;
      const result = calculateAiTrustScore({
        evidenceCount: matched.length,
        sourceDiversity: documentIds.size,
        sourceReliability: 8,
        consistency: highConsistency ? "HIGH" : mediumConsistency ? "MEDIUM" : "LOW",
        freshness: 3,
        recommendationCorrelation: topHospitalIds.has(hospital.id) ? 8 : 0,
      });
      scoreRows.push({ project_id: id, hospital_id: hospital.id, schema_key: schema.key, score: result.score, breakdown: result.breakdown });
    }
  }

  if (scoreRows.length) {
    await supabase.from("ai_trust_schema_scores").upsert(scoreRows, { onConflict: "project_id,hospital_id,schema_key" });
  }

  const { data: scores } = await supabase.from("ai_trust_schema_scores").select("*").eq("project_id", id);
  const gaps = AI_TRUST_EVIDENCE_SCHEMAS.map((schema, index) => {
    const recommendedScores = (scores || []).filter((score) => score.schema_key === schema.key && topHospitalIds.has(score.hospital_id));
    const recommendedAvg = average(recommendedScores.map((score) => Number(score.score)));
    const clientScore = clientHospital
      ? Number((scores || []).find((score) => score.hospital_id === clientHospital.id && score.schema_key === schema.key)?.score || 0)
      : 0;
    return {
      project_id: id,
      schema_key: schema.key,
      recommended_avg: recommendedAvg,
      client_score: clientScore,
      gap: Math.max(0, recommendedAvg - clientScore),
      rank: index + 1,
      rationale: [{ label: "evidence_based", value: true }],
    };
  }).sort((a, b) => b.gap - a.gap).map((gap, index) => ({ ...gap, rank: index + 1 }));

  await supabase.from("ai_trust_gaps").upsert(gaps, { onConflict: "project_id,schema_key" });
  await supabase.from("ai_trust_patterns").upsert(
    gaps.map((gap) => ({
      project_id: id,
      schema_key: gap.schema_key,
      recommended_avg: gap.recommended_avg,
      comparison_avg: null,
      observation: `반복 추천 병원군에서 ${gap.schema_key} 평균 점수가 ${Math.round(gap.recommended_avg)}점으로 관찰되었습니다.`,
      evidence: gap.rationale,
    })),
    { onConflict: "project_id,schema_key" },
  );

  return NextResponse.json({ ok: true, scores: scoreRows.length, gaps: gaps.length });
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
