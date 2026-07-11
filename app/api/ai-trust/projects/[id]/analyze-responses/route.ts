import { NextResponse } from "next/server";
import { calculateConsensusStats } from "@/lib/ai-trust/consensus";
import { canonicalizeHospitalName, extractHospitalMentions } from "@/lib/ai-trust/entities";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: responses, error } = await supabase
    .from("ai_trust_ai_responses")
    .select("id, project_id, prompt_id, provider, raw_response")
    .eq("project_id", id)
    .eq("response_status", "COMPLETED");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!responses?.length) return NextResponse.json({ ok: false, error: "분석할 AI 응답이 없습니다." }, { status: 400 });

  for (const response of responses) {
    const extracted = extractHospitalMentions(response.raw_response || "");
    for (const mention of extracted) {
      const canonicalName = canonicalizeHospitalName(mention.raw_name);
      const { data: hospital } = await supabase
        .from("ai_trust_hospitals")
        .upsert({
          project_id: id,
          canonical_name: canonicalName,
          aliases: [mention.raw_name],
        }, { onConflict: "project_id,canonical_name" })
        .select("id")
        .single();

      await supabase.from("ai_trust_hospital_mentions").insert({
        response_id: response.id,
        project_id: id,
        hospital_id: hospital?.id || null,
        raw_name: mention.raw_name,
        rank: mention.rank,
        mention_context: mention.mention_context,
        confidence: mention.confidence,
        snippet: mention.snippet,
      });
    }
  }

  const [{ data: responseRows }, { data: promptRows }, { data: mentionRows }] = await Promise.all([
    supabase.from("ai_trust_ai_responses").select("id, provider, prompt_id").eq("project_id", id),
    supabase.from("ai_trust_prompts").select("id, intent").eq("project_id", id),
    supabase.from("ai_trust_hospital_mentions").select("hospital_id, response_id, rank, mention_context").eq("project_id", id),
  ]);

  const stats = calculateConsensusStats(responseRows || [], promptRows || [], mentionRows || []);
  if (stats.length) {
    await supabase.from("ai_trust_consensus_stats").upsert(
      stats.map((stat) => ({ project_id: id, ...stat })),
      { onConflict: "project_id,hospital_id" },
    );
  }

  return NextResponse.json({ ok: true, extracted_mentions: mentionRows?.length || 0, consensus_count: stats.length });
}
