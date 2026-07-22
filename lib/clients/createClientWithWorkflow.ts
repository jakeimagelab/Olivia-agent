import type { SupabaseClient } from "@supabase/supabase-js";
import { linkUnassignedPhotoGalleries } from "@/lib/clientGalleryLinking";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";
import { isActiveWorkflowStep } from "@/lib/workflow";
import { buildNextAction, createStepTasks, ensureStepRun, logAgent } from "@/lib/workflowAutomation";

export type CreateClientWithWorkflowInput = {
  hospitalName: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  specialty?: string | null;
  memo?: string | null;
  startStepKey?: string | null;
  eventSource?: string;
};

export async function createClientWithWorkflow(db: SupabaseClient, input: CreateClientWithWorkflowInput) {
  const hospitalName = input.hospitalName.trim();
  if (!hospitalName) throw new Error("병원명 필수");

  const { data: existing } = await db
    .from("clients")
    .select("id,hospital_name")
    .ilike("hospital_name", hospitalName)
    .limit(1)
    .maybeSingle();
  if (existing) {
    const { data: activeRun } = await db.from("workflow_runs")
      .select("id,current_step_key")
      .eq("client_id", existing.id)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { client: existing, run: activeRun, created: false };
  }

  const { data: client, error } = await db.from("clients").insert({
    hospital_name: hospitalName,
    contact_name: input.contactName || null,
    phone: input.phone || null,
    email: input.email || null,
    specialty: input.specialty || null,
    memo: input.memo || null,
  }).select("id,hospital_name").single();
  if (error || !client) throw new Error(error?.message || "고객 등록 실패");

  await emitOliviaEventSafely(db, {
    eventType: "customer.created",
    eventSource: input.eventSource || "clients_api",
    clientId: client.id,
    actorType: "admin",
    payload: { name: hospitalName, managerName: input.contactName || "", department: input.specialty || "" },
    deduplicationKey: createEventDeduplicationKey("customer.created", client.id),
  });

  const requestedStep = typeof input.startStepKey === "string" ? input.startStepKey : "";
  const startStepKey = isActiveWorkflowStep(requestedStep) ? requestedStep : "consult_meeting";
  const { data: run, error: runError } = await db.from("workflow_runs").insert({
    client_id: client.id,
    client_name: hospitalName,
    current_step_key: startStepKey,
    next_action: buildNextAction(startStepKey),
    status: "active",
    started_at: new Date().toISOString(),
  }).select().single();
  if (runError) throw new Error(runError.message);

  if (run?.id) {
    await ensureStepRun(db, run.id, startStepKey, "in_progress");
    const taskResult = await createStepTasks(db, run.id, startStepKey);
    await logAgent(db, {
      workflow_run_id: run.id,
      log_type: "workflow_started",
      message: startStepKey === "consult_meeting"
        ? `${hospitalName} 고객 생성 후 워크플로우가 시작되었습니다.`
        : `${hospitalName} 고객이 ${startStepKey} 단계에 연결되었습니다. 이전 단계도 필요하면 진행할 수 있습니다.`,
      output_summary: `created_tasks: ${taskResult.created.length}`,
    });
    await emitOliviaEventSafely(db, {
      eventType: "workflow.started",
      eventSource: input.eventSource || "clients_api",
      clientId: client.id,
      workflowRunId: run.id,
      actorType: "admin",
      payload: { firstStepKey: startStepKey, clientName: hospitalName },
      deduplicationKey: createEventDeduplicationKey("workflow.started", run.id),
    });
  }

  await linkUnassignedPhotoGalleries(db, { clientId: client.id, hospitalName, workflowRunId: run?.id ?? null })
    .catch((linkError) => console.error("[clients] 기존 촬영 갤러리 연결 실패", linkError));

  return { client, run, created: true };
}
