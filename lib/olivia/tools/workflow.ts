import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fuzzyNameSearchOne } from "@/lib/olivia/nameSearch";
import { logActivity } from "@/lib/activityLogger";

const STEP_LABELS: Record<string, string> = {
  consult_meeting: "1. 상담/미팅", quote: "2. 견적서", contract: "3. 계약서", conti: "4. 콘티",
  shooting: "5. 촬영", backup_sorting: "6. 백업/분류", original_delivery: "7. 원본 전달",
  client_selection: "8. 고객 셀렉", raw_matching: "9. RAW 매칭", retouching: "10. 보정",
  revision: "11. 수정 접수", seo_delivery: "12. SEO 납품", final_delivery: "13. 최종 전달",
  review_content: "14. 후기 콘텐츠", reward: "15. 리워드", customer_care: "16. 고객 케어", content_planning: "17. 콘텐츠 기획",
};

function resolveOrigin(req: NextRequest) {
  return (
    req.headers.get("x-base-url") || req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000"
  );
}

// lib/assistant/core/legacyOliviaCore.ts의 executeTool()에서 그대로 옮긴 워크플로우
// 조회/전진/소급완료 — 레거시 Claude 경로와 v2 OpenAI 경로가 같은 구현을 공유한다.
export async function getWorkflowStatus(input: any) {
  const db = getSupabaseAdmin();
  const run = await fuzzyNameSearchOne<any>({
    db, table: "workflow_runs", nameColumn: "client_name",
    select: "id, client_name, current_step_key, status, updated_at, next_action",
    query: input.clientName,
    filter: (q: any) => q.eq("status", "active").order("updated_at", { ascending: false }),
  });
  if (!run) {
    return { action: "done", message: `⚠️ **${input.clientName}**의 활성 워크플로우를 찾을 수 없어요.\n/clients 에서 워크플로우를 시작해주세요.` };
  }
  const step = STEP_LABELS[run.current_step_key] ?? run.current_step_key;
  const updated = new Date(run.updated_at).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
  return {
    action: "done",
    message: `📋 **${run.client_name}** 워크플로우 현황\n\n**현재 단계:** ${step}\n**마지막 업데이트:** ${updated}\n\n다음 단계로 진행하려면 "다음 단계로 넘겨줘" 또는 "XX단계로 이동해줘"라고 말씀해주세요.`,
    clientName: run.client_name,
    currentStepKey: run.current_step_key,
  };
}

export async function advanceWorkflowStep(input: any, req: NextRequest) {
  const db = getSupabaseAdmin();
  const run = await fuzzyNameSearchOne<any>({
    db, table: "workflow_runs", nameColumn: "client_name",
    select: "id, client_name, current_step_key",
    query: input.clientName,
    filter: (q: any) => q.eq("status", "active").order("updated_at", { ascending: false }),
  });
  if (!run) {
    return { action: "done", message: `⚠️ **${input.clientName}**의 활성 워크플로우를 찾을 수 없어요.` };
  }
  const origin = resolveOrigin(req);
  const res = await fetch(`${origin}/api/workflow/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_API_KEY || "" },
    body: JSON.stringify({ workflow_run_id: run.id, to_step_key: input.toStepKey, reason: "올리비아 요청" }),
  });
  const d = await res.json();
  if (!d.ok) return { action: "done", message: `❌ 단계 이동 실패: ${d.error}` };
  await logActivity("advance_workflow_step", run.client_name, { from: run.current_step_key, to: input.toStepKey });
  return {
    action: "done",
    message: `✅ **${run.client_name}** 워크플로우를 **${input.toStepKey}** 단계로 이동했어요!\n\n/clients 에서 다음 할 일을 확인해주세요.`,
    clientName: run.client_name,
    workflowRunId: run.id,
  };
}

export async function completeWorkflowRetroactively(input: any, req: NextRequest) {
  const db = getSupabaseAdmin();
  const run = await fuzzyNameSearchOne<any>({
    db, table: "workflow_runs", nameColumn: "client_name",
    select: "id, client_name, current_step_key, status",
    query: input.clientName,
    filter: (q: any) => q.neq("status", "completed").order("updated_at", { ascending: false }),
  });
  if (!run) {
    return { action: "done", message: `⚠️ **${input.clientName}**의 진행 중인 워크플로우를 찾을 수 없어요. 먼저 고객/워크플로우를 등록해주세요.` };
  }
  const origin = resolveOrigin(req);
  const res = await fetch(`${origin}/api/workflow/complete-retroactively`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_API_KEY || "" },
    body: JSON.stringify({ workflow_run_id: run.id, reason: input.reason || "소급 등록" }),
  });
  const d = await res.json();
  if (!d.ok) return { action: "done", message: `⚠️ 완료 처리 실패: ${d.error}` };
  return { action: "done", message: `✅ **${input.clientName}** 워크플로우를 전체 완료 처리했어요.`, clientName: input.clientName };
}
