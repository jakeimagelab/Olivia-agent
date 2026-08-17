import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_WORKFLOW_STEP_KEYS, STEP_NAME, getWorkflowDisplayStepKey } from "@/lib/workflow";

export type TaskSessionType = "shoot-prep" | "quote-prep" | "contract-prep" | "delivery" | "general";
export type OliviaTaskStatus = "todo" | "in_progress" | "done";
export type OliviaTask = { key: string; title: string; status: OliviaTaskStatus };

export const SESSION_TYPE_LABEL: Record<TaskSessionType, string> = {
  "shoot-prep": "촬영 준비",
  "quote-prep": "견적 준비",
  "contract-prep": "계약 준비",
  "delivery": "납품",
  "general": "업무",
};

// Task Session은 Workflow의 상위 개념이 아니라 그 일부 구간을 사용자 업무 단위로 잘라 보여주는
// 창이다(18절 "기존 Workflow 데이터를 재사용, 새 시스템 안 만듦") — 세션 타입별로 어느 구간을
// 보여줄지만 정의하고, 완료 여부는 오직 workflow_runs.current_step_key로만 판단한다. 별도
// 테이블에 "완료" 상태를 중복 저장하지 않으므로 실제 업무 상태와 어긋날 일이 없다.
const SESSION_STEP_RANGES: Record<TaskSessionType, { from: string; to: string }> = {
  "quote-prep": { from: "consult_meeting", to: "quote" },
  "contract-prep": { from: "quote", to: "contract" },
  "shoot-prep": { from: "quote", to: "shooting" },
  "delivery": { from: "retouching", to: "final_delivery" },
  "general": { from: ACTIVE_WORKFLOW_STEP_KEYS[0], to: ACTIVE_WORKFLOW_STEP_KEYS[ACTIVE_WORKFLOW_STEP_KEYS.length - 1] },
};

export async function computeTaskList(
  db: SupabaseClient,
  workflowRunId: string,
  sessionType: TaskSessionType
): Promise<{ tasks: OliviaTask[]; currentTaskKey: string | null }> {
  const { data: run } = await db
    .from("workflow_runs")
    .select("current_step_key, status")
    .eq("id", workflowRunId)
    .maybeSingle();
  if (!run) return { tasks: [], currentTaskKey: null };

  const displayCurrent = getWorkflowDisplayStepKey(run.current_step_key) || run.current_step_key;
  const currentIdx = ACTIVE_WORKFLOW_STEP_KEYS.indexOf(displayCurrent as (typeof ACTIVE_WORKFLOW_STEP_KEYS)[number]);

  const range = SESSION_STEP_RANGES[sessionType] ?? SESSION_STEP_RANGES.general;
  const fromIdx = Math.max(0, ACTIVE_WORKFLOW_STEP_KEYS.indexOf(range.from as (typeof ACTIVE_WORKFLOW_STEP_KEYS)[number]));
  const toIdxRaw = ACTIVE_WORKFLOW_STEP_KEYS.indexOf(range.to as (typeof ACTIVE_WORKFLOW_STEP_KEYS)[number]);
  const toIdx = toIdxRaw === -1 ? ACTIVE_WORKFLOW_STEP_KEYS.length - 1 : toIdxRaw;
  const stepKeys = ACTIVE_WORKFLOW_STEP_KEYS.slice(fromIdx, toIdx + 1);

  const tasks: OliviaTask[] = stepKeys.map((key) => {
    const idx = ACTIVE_WORKFLOW_STEP_KEYS.indexOf(key);
    const status: OliviaTaskStatus = run.status === "completed" || idx < currentIdx ? "done" : idx === currentIdx ? "in_progress" : "todo";
    return { key, title: STEP_NAME[key] || key, status };
  });

  const currentTask = tasks.find((t) => t.status === "in_progress") ?? tasks.find((t) => t.status === "todo");
  // 전부 done이면(이 세션 구간을 이미 다 지났으면) 마지막 항목을 그대로 "현재"로 둔다 —
  // "다 됐어요"라고 답할 수 있게.
  return { tasks, currentTaskKey: currentTask?.key ?? tasks.at(-1)?.key ?? null };
}
