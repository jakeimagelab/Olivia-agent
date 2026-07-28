import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { channelLabel } from "@/lib/marketingChannels";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET — 해당 전략에 쌓인 제안 이력 조회 (pending/accepted/dismissed 전체)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const { data, error } = await supabase
      .from("marketing_action_suggestions")
      .select("*")
      .eq("strategy_id", id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, suggestions: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "제안 조회 실패" }, { status: 500 });
  }
}

// POST — Claude에게 이 전략의 다음 액션을 제안받아 pending 상태로 저장 (자동으로 marketing_actions에 반영하지 않음 — 승인 게이트)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });

    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const { data: strategy, error: strategyError } = await supabase
      .from("marketing_strategies")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (strategyError) throw new Error(strategyError.message);
    if (!strategy) return NextResponse.json({ ok: false, error: "전략을 찾을 수 없습니다." }, { status: 404 });

    const { data: actions } = await supabase
      .from("marketing_actions")
      .select("id, title, status, scheduled_date, completed_date")
      .eq("strategy_id", id)
      .order("scheduled_date", { ascending: true });

    const actionIds = (actions ?? []).map((a) => a.id);
    let metrics: any[] = [];
    if (actionIds.length > 0) {
      const { data: metricRows } = await supabase
        .from("marketing_metric_logs")
        .select("action_id, metric_type, value, unit, recorded_at")
        .in("action_id", actionIds)
        .order("recorded_at", { ascending: true });
      metrics = metricRows ?? [];
    }

    // 9.2 지식 패치 — 마케팅 카테고리로 저장된 축적 인사이트를 근거로 함께 활용한다.
    const { data: patches } = await supabase
      .from("olivia_knowledge_patches")
      .select("title, content")
      .eq("is_active", true)
      .eq("category", "marketing")
      .order("created_at", { ascending: false })
      .limit(5)
      .then((r) => r, () => ({ data: [] as any[] }));

    const actionsSummary = (actions ?? []).map((a) => {
      const actionMetrics = metrics.filter((m) => m.action_id === a.id)
        .map((m) => `${m.metric_type}=${m.value}${m.unit && m.unit !== "count" ? m.unit : ""}`)
        .join(", ");
      return `- [${a.status}] ${a.title}${a.scheduled_date ? ` (${a.scheduled_date})` : ""}${actionMetrics ? ` — 지표: ${actionMetrics}` : ""}`;
    }).join("\n") || "(아직 등록된 액션 없음)";

    const patchSummary = (patches ?? []).map((p) => `- [${p.title}] ${p.content}`).join("\n\n") || "(참고할 지식 패치 없음)";

    const prompt = `당신은 한국 병원 브랜딩 사진 스튜디오(포토클리닉/제이크이미지연구소)의 마케팅 전략 실행을 돕는 AI 비서입니다.

아래는 채널 무관 마케팅 전략 하나의 현황입니다. 이 전략을 검증/진전시키기 위한 다음 액션을 2~4개 제안해주세요.

[전략 정보]
제목: ${strategy.title}
채널: ${channelLabel(strategy.channel)}
가설: ${strategy.hypothesis || "(미기재)"}
베이스라인: ${strategy.baseline_note || "(미기재)"}
상태: ${strategy.status}

[지금까지의 액션과 지표]
${actionsSummary}

[참고할 축적된 인사이트 (Olivia 지식 패치)]
${patchSummary}

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "suggestions": [
    {
      "title": "제안 액션명 (구체적, 30자 이내)",
      "description": "실행 방법 상세 (캡션 초안, 해시태그 초안 등 포함 가능, 200자 이내)",
      "rationale": "왜 이걸 제안하는지 — 참고한 과거 데이터나 지식 패치를 근거로 짧게"
    }
  ]
}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI 응답에서 JSON을 찾지 못했습니다.");
    const parsed = JSON.parse(jsonMatch[0]);
    const rawSuggestions: any[] = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    if (rawSuggestions.length === 0) throw new Error("제안된 액션이 없습니다.");

    const rows = rawSuggestions
      .filter((s) => typeof s.title === "string" && s.title.trim())
      .map((s) => ({
        strategy_id: id,
        suggested_title: s.title.trim(),
        suggested_description: s.description ?? "",
        rationale: s.rationale ?? "",
        status: "pending",
      }));

    const { data: saved, error: saveError } = await supabase
      .from("marketing_action_suggestions")
      .insert(rows)
      .select("*");
    if (saveError) throw new Error(saveError.message);

    return NextResponse.json({ ok: true, suggestions: saved });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "액션 제안 생성 실패" }, { status: 500 });
  }
}
