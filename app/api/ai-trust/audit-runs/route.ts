import { NextRequest, NextResponse } from "next/server";
import { getAiTrustProviderStatuses } from "@/lib/ai-trust/providers";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();
  const projectId = String(body.project_id || "");
  const repeatCount = Math.min(20, Math.max(1, Number(body.repeat_count || 5)));
  const requestedProviders: string[] = Array.isArray(body.providers) ? body.providers.map(String) : ["openai", "gemini"];
  const availableProviders = new Set<string>(
    getAiTrustProviderStatuses()
      .filter((provider) => provider.status === "CONNECTED" && ["openai", "gemini"].includes(provider.provider))
      .map((provider) => provider.provider),
  );
  const providers: string[] = requestedProviders.filter((provider: string) => availableProviders.has(provider));

  if (!projectId) return NextResponse.json({ ok: false, error: "project_id is required" }, { status: 400 });
  if (providers.length === 0) {
    return NextResponse.json({ ok: false, error: "실행 가능한 AI Provider가 없습니다. 환경변수 연결은 마지막 단계에서 설정하세요." }, { status: 400 });
  }

  const promptQuery = supabase
    .from("ai_trust_prompts")
    .select("id")
    .eq("project_id", projectId)
    .eq("selected", true);

  const { data: prompts, error: promptError } = await promptQuery;
  if (promptError) return NextResponse.json({ ok: false, error: promptError.message }, { status: 500 });
  if (!prompts?.length) return NextResponse.json({ ok: false, error: "선택된 질문이 없습니다." }, { status: 400 });

  const totalRequests = prompts.length * providers.length * repeatCount;
  const { data: run, error: runError } = await supabase
    .from("ai_trust_audit_runs")
    .insert({
      project_id: projectId,
      status: "PENDING",
      providers,
      repeat_count: repeatCount,
      total_requests: totalRequests,
      pricing_note: "Provider Pricing 설정 필요",
      settings: { requestedProviders },
    })
    .select("*")
    .single();

  if (runError) return NextResponse.json({ ok: false, error: runError.message }, { status: 500 });

  const requestRows = prompts.flatMap((prompt: { id: string }) =>
    providers.flatMap((provider: string) =>
      Array.from({ length: repeatCount }, (_, index) => ({
        run_id: run.id,
        project_id: projectId,
        prompt_id: prompt.id,
        provider,
        run_number: index + 1,
        status: "PENDING",
      })),
    ),
  );

  const { error: queueError } = await supabase.from("ai_trust_audit_requests").insert(requestRows);
  if (queueError) return NextResponse.json({ ok: false, error: queueError.message }, { status: 500 });

  await supabase.from("ai_trust_projects").update({ status: "PENDING", updated_at: new Date().toISOString() }).eq("id", projectId);

  return NextResponse.json({ ok: true, run, total_requests: totalRequests });
}
