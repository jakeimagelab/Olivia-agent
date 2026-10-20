import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  effectiveWorkflowChecks,
  nextWorkflowCheck,
  waitingDays,
  workflowCheckProgress,
} from "@/lib/workflowChecks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const db = getSupabaseAdmin();
  const primaryRunsResult = await db.from("workflow_runs")
    .select("id,client_id,client_name,project_name,shoot_date,manager_name,status,current_step_key,checks,started_at,created_at,updated_at")
    .in("status", ["active", "paused"])
    .order("shoot_date", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });
  const checksUnavailable = Boolean(primaryRunsResult.error && /checks|schema cache|column/i.test(primaryRunsResult.error.message));
  let runs: any[] = primaryRunsResult.data ?? [];
  let runsError = primaryRunsResult.error;
  if (checksUnavailable) {
    const fallbackRunsResult = await db.from("workflow_runs")
      .select("id,client_id,client_name,project_name,shoot_date,manager_name,status,current_step_key,started_at,created_at,updated_at")
      .in("status", ["active", "paused"])
      .order("shoot_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false });
    runs = (fallbackRunsResult.data ?? []).map((run) => ({ ...run, checks: null }));
    runsError = fallbackRunsResult.error;
  }
  if (runsError) return NextResponse.json({ ok: false, error: runsError.message }, { status: 500 });

  const clientIds = [...new Set(runs.map((run) => run.client_id).filter(Boolean))];
  const runIds = runs.map((run) => run.id);
  const [clientsResult, photoResult] = await Promise.all([
    clientIds.length
      ? db.from("clients").select("id,hospital_name,contact_name,phone,email").in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? db.from("photo_storage_projects")
          .select("workflow_run_id,jpg_count,classified_jpg_count,classification_error,classify_approved_at,status,updated_at")
          .in("workflow_run_id", runIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (clientsResult.error) return NextResponse.json({ ok: false, error: clientsResult.error.message }, { status: 500 });

  const clients = new Map((clientsResult.data ?? []).map((client) => [client.id, client]));
  const photoByRun = new Map<string, any>();
  for (const project of photoResult.data ?? []) {
    const current = photoByRun.get(project.workflow_run_id);
    if (!current || String(project.updated_at || "") > String(current.updated_at || "")) photoByRun.set(project.workflow_run_id, project);
  }

  const now = new Date();
  const cases = runs.map((run) => {
    const checks = effectiveWorkflowChecks({ checks: run.checks, currentStepKey: run.current_step_key, status: run.status });
    const progress = workflowCheckProgress(checks);
    const next = nextWorkflowCheck(checks);
    const client = clients.get(run.client_id) ?? null;
    const photo = photoByRun.get(run.id) ?? null;
    const backedUp = Math.max(0, Number(photo?.jpg_count ?? 0));
    const classified = Math.max(0, Number(photo?.classified_jpg_count ?? 0));
    const unclassified = Math.max(0, backedUp - classified);
    const shootDate = run.shoot_date ? new Date(`${String(run.shoot_date).slice(0, 10)}T00:00:00+09:00`) : null;
    const seoulNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const day = seoulNow.getDay() || 7;
    const weekStart = new Date(seoulNow);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - day + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const customerWaiting = Boolean(next && ["contract_signed", "client_selected", "feedback", "reward"].includes(next.key));
    return {
      id: run.id,
      clientId: run.client_id,
      clientName: client?.hospital_name || run.client_name || "고객명 미등록",
      contactName: client?.contact_name || "",
      phone: client?.phone || "",
      email: client?.email || "",
      projectName: run.project_name || "촬영 건",
      shootDate: run.shoot_date,
      managerName: run.manager_name || "",
      status: run.status,
      updatedAt: run.updated_at,
      waitingDays: waitingDays(run.updated_at, now),
      customerWaiting,
      thisWeekShoot: Boolean(shootDate && shootDate >= weekStart && shootDate < weekEnd),
      progress,
      nextCheck: next ? { key: next.key, label: next.label, actor: next.actor, nextActionLabel: next.nextActionLabel, actionLabel: next.actionLabel } : null,
      photoSummary: photo ? { backedUp, classified, unclassified, error: photo.classification_error || null, approvedAt: photo.classify_approved_at || null } : null,
    };
  });

  return NextResponse.json({
    ok: true,
    cases,
    checksUnavailable,
    warning: checksUnavailable ? "DB 마이그레이션이 필요합니다. 지금은 기존 진행 단계에서 체크를 읽어 보여줍니다." : null,
  }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
