import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  effectiveWorkflowChecks,
  isCustomWorkflowCheckKey,
  workflowCheckDefinition,
  workflowCheckProgress,
} from "@/lib/workflowChecks";
import { persistWorkflowChecks } from "@/lib/workflowCheckPersistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function customKey() {
  return `custom_${randomBytes(3).toString("hex")}`;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  const { data: run, error: readError } = await db
    .from("workflow_runs")
    .select("id,client_id,project_name,current_step_key,status,checks")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
  if (!run) return NextResponse.json({ ok: false, error: "촬영 건을 찾지 못했습니다." }, { status: 404 });

  const checks = effectiveWorkflowChecks({ checks: run.checks, currentStepKey: run.current_step_key, status: run.status });
  let key = String(body.key || "");
  let label = "";

  if (body.action === "add_custom") {
    label = String(body.label || "").trim();
    if (!label) return NextResponse.json({ ok: false, error: "할 일을 적어주세요." }, { status: 400 });
    if (label.length > 80) return NextResponse.json({ ok: false, error: "할 일은 80자까지 적을 수 있습니다." }, { status: 400 });
    do key = customKey(); while (key in checks);
    checks[key] = { done: false, by: "user", label };
  } else if (body.action === "remove_custom") {
    if (!isCustomWorkflowCheckKey(key) || !(key in checks)) return NextResponse.json({ ok: false, error: "추가한 할 일을 찾지 못했습니다." }, { status: 404 });
    label = checks[key]?.label || "추가 할 일";
    delete checks[key];
  } else {
    const definition = workflowCheckDefinition(key);
    const custom = isCustomWorkflowCheckKey(key) ? checks[key] : null;
    if (!definition && !custom) return NextResponse.json({ ok: false, error: "체크 항목을 찾지 못했습니다." }, { status: 404 });
    if (definition?.actor === "auto") return NextResponse.json({ ok: false, error: "자동 체크는 근거가 되는 작업에서만 바뀝니다." }, { status: 400 });
    const done = body.done === true;
    label = definition?.label || custom?.label || "추가 할 일";
    checks[key] = done
      ? { ...checks[key], done: true, by: "user", at: new Date().toISOString() }
      : { ...checks[key], done: false, by: "user" };
  }

  try {
    const updated = await persistWorkflowChecks(db, id, checks);
    await recordPcrmActivitySafely(db, {
      clientId: run.client_id,
      workflowRunId: id,
      actorType: "admin",
      actionType: "workflow_check_updated",
      title: body.action === "add_custom" ? `${label} 추가` : body.action === "remove_custom" ? `${label} 삭제` : `${label} ${body.done === true ? "완료" : "해제"}`,
      relatedType: "workflow_run",
      relatedId: id,
    });
    return NextResponse.json({ ok: true, run: updated, checks: updated.checks, progress: workflowCheckProgress(updated.checks) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "체크를 저장하지 못했습니다.";
    const migrationMissing = /checks|schema cache|column/i.test(message);
    return NextResponse.json({
      ok: false,
      error: migrationMissing ? "DB 마이그레이션이 필요합니다. workflow_runs.checks 컬럼을 먼저 추가해 주세요." : message,
    }, { status: 500 });
  }
}
