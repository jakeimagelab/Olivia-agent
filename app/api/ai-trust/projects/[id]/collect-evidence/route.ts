import { NextResponse } from "next/server";
import { classifyEvidenceText, fetchEvidenceUrl } from "@/lib/ai-trust/evidence";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Params) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: project } = await supabase
    .from("ai_trust_projects")
    .select("client_id")
    .eq("id", id)
    .single();

  const { data: responses, error } = await supabase
    .from("ai_trust_ai_responses")
    .select("source_urls")
    .eq("project_id", id)
    .eq("response_status", "COMPLETED");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const { data: hospitals } = await supabase
    .from("ai_trust_hospitals")
    .select("id, canonical_name, aliases, website")
    .eq("project_id", id);

  let clientUrls: string[] = [];
  if (project?.client_id) {
    const { data: client } = await supabase.from("clients").select("*").eq("id", project.client_id).single();
    clientUrls = [
      client?.website_url,
      client?.homepage_url,
      client?.naver_place_url,
      client?.blog_url,
      client?.instagram_url,
    ].filter((url): url is string => typeof url === "string" && /^https?:\/\//.test(url));
  }

  const hospitalUrls = (hospitals || [])
    .map((hospital) => hospital.website)
    .filter((url): url is string => typeof url === "string" && /^https?:\/\//.test(url));

  const urls = Array.from(new Set([
    ...(responses || []).flatMap((row) => row.source_urls || []),
    ...clientUrls,
    ...hospitalUrls,
  ])).slice(0, 35);
  let collected = 0;
  let facts = 0;

  for (const url of urls) {
    const doc = await fetchEvidenceUrl(url);
    if (!doc) continue;
    const hospital = (hospitals || []).find((item) => {
      const names = [item.canonical_name, ...(item.aliases || [])].filter(Boolean);
      return item.website === url || names.some((name) => doc.text.includes(name) || doc.url.includes(encodeURIComponent(name)));
    });
    const { data: savedDoc, error: docError } = await supabase
      .from("ai_trust_evidence_documents")
      .upsert({ project_id: id, hospital_id: hospital?.id || null, ...doc }, { onConflict: "project_id,content_hash" })
      .select("id")
      .single();
    if (docError || !savedDoc) continue;
    collected += 1;

    const classified = classifyEvidenceText(doc.text);
    if (classified.length) {
      await supabase.from("ai_trust_evidence_facts").insert(
        classified.map((fact) => ({
          project_id: id,
          hospital_id: hospital?.id || null,
          document_id: savedDoc.id,
          schema_key: fact.schema_key,
          evidence_quote: fact.evidence_quote,
          interpretation: fact.interpretation,
          consistency: fact.consistency,
        })),
      );
      facts += classified.length;
    }
  }

  return NextResponse.json({ ok: true, urls_checked: urls.length, collected, facts });
}
