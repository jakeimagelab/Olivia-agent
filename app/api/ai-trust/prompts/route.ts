import { NextRequest, NextResponse } from "next/server";
import { generateDemandBasedPrompts } from "@/lib/ai-trust/prompts";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const prompts = generateDemandBasedPrompts({
    keywords: Array.isArray(body.keywords) ? body.keywords : [],
    treatments: Array.isArray(body.treatments) ? body.treatments : [],
    symptoms: Array.isArray(body.symptoms) ? body.symptoms : [],
    region: body.region || "",
    department: body.department || "",
    language: body.language || "ko",
  });

  return NextResponse.json({ ok: true, prompts });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const projectId = String(body.project_id || "");
  const prompts = Array.isArray(body.prompts) ? body.prompts : [];
  if (!projectId || !prompts.length) return NextResponse.json({ ok: false, error: "프로젝트와 질문이 필요합니다." }, { status: 400 });
  const db = getSupabaseAdmin();
  const { data: existing, error } = await db.from("ai_trust_prompts").select("id").eq("project_id", projectId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const validPrompts = (prompts as Array<Record<string, unknown>>).filter((item) => String(item.question || "").trim());
  const submittedIds = validPrompts.map((item) => String(item.id || "")).filter(Boolean);
  const disabledIds = (existing || []).map((item) => item.id).filter((id) => !submittedIds.includes(id));
  if (disabledIds.length) await db.from("ai_trust_prompts").update({ selected: false }).in("id", disabledIds);
  for (const item of validPrompts) {
    const row = {
      project_id: projectId,
      source_keyword: String(item.source_keyword || item.question || "직접 입력"),
      source: String(item.source || "MANUAL"),
      intent: String(item.intent || "RECOMMENDATION"),
      question: String(item.question || "").trim(),
      language: "ko",
      region: String(item.region || ""),
      department: String(item.department || ""),
      demand_score: null,
      selected: true,
    };
    if (item.id) await db.from("ai_trust_prompts").update(row).eq("id", String(item.id)).eq("project_id", projectId);
    else await db.from("ai_trust_prompts").insert(row);
  }
  const { data: saved } = await db.from("ai_trust_prompts").select("*").eq("project_id", projectId).eq("selected", true).order("created_at", { ascending: true });
  return NextResponse.json({ ok: true, prompts: saved || [] });
}
