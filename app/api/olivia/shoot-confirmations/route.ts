import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createEventDeduplicationKey } from "@/lib/olivia/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function kstToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

// 촬영일이 지났는데 아직 "촬영" 단계에 머물러 있는 프로젝트를 찾아서, 홈 채팅에서 먼저
// 물어볼 수 있게 insight로 등록해 둔다. 이미 등록된 건(같은 deduplication_key)은
// upsert_olivia_insight가 중복 생성하지 않고 기존 걸 그대로 돌려준다.
export async function GET() {
  const db = getSupabaseAdmin();
  const today = kstToday();

  const { data: runs, error } = await db
    .from("workflow_runs")
    .select("id, client_name, shoot_date")
    .eq("status", "active")
    .eq("current_step_key", "shooting")
    .not("shoot_date", "is", null)
    .lt("shoot_date", today);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const created: { insightId: string; workflowRunId: string; clientName: string; shootDate: string }[] = [];
  for (const run of runs ?? []) {
    const deduplicationKey = createEventDeduplicationKey("workflow.shoot_confirm", `${run.id}:${run.shoot_date}`);
    const { data, error: upsertError } = await db.rpc("upsert_olivia_insight", {
      p_insight: {
        insight_type: "shoot_confirm",
        title: `${run.client_name} 촬영 확인`,
        summary: `${run.client_name} 촬영 예정일(${run.shoot_date})이 지났어요. 촬영을 완료했는지 확인이 필요합니다.`,
        reason: "촬영일이 지났는데 워크플로우가 아직 촬영 단계에 머물러 있습니다.",
        client_id: null,
        workflow_run_id: run.id,
        priority_score: 70,
        urgency_score: 70,
        impact_score: 65,
        confidence: 0.8,
        recommended_action: "촬영 완료 여부 확인 후 다음 단계로 진행",
        deduplication_key: deduplicationKey,
      },
    });
    if (upsertError) { console.error("[shoot-confirmations] insight upsert 실패:", upsertError.message); continue; }
    const insight = Array.isArray(data) ? data[0] : data;
    if (!insight || insight.status !== "open") continue; // 이미 확인했거나 넘긴 건은 다시 안 물어본다
    created.push({ insightId: insight.id, workflowRunId: run.id, clientName: run.client_name, shootDate: run.shoot_date });
  }

  return NextResponse.json({ ok: true, items: created });
}
