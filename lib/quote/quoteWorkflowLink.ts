import type { SupabaseClient } from "@supabase/supabase-js";
import { matchClient } from "@/lib/clientMatching";
import { buildNextAction, createStepTasks, ensureStepRun, logAgent } from "@/lib/workflowAutomation";

// 고객 미연결 견적서는 고객을 자동 생성하지 않는다. 고객 등록은 사용자가 "고객등록"을
// 명시했을 때만 forceCreateNew 경로로 수행한다. 견적서 발행/완료가 고객 생성까지 겸하면
// 사용자가 보지 못한 고객 레코드가 생긴다(2026-09-30).
export type QuoteWorkflowLinkResult =
  | { status: "linked"; clientId: string; workflowRunId: string }
  | { status: "needs_confirmation"; candidate: { id: string; hospital_name: string } }
  | { status: "needs_registration"; hospitalName: string };

async function createClientFromQuote(db: SupabaseClient, quote: any): Promise<string> {
  const { data, error } = await db
    .from("clients")
    .insert({
      hospital_name: quote.hospital_name || "",
      contact_name: quote.contact_name || "",
      phone: quote.phone || "",
      email: quote.email || "",
      business_registration_number: quote.business_registration_number || null,
      lead_status: "lead",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function resolveQuoteWorkflowLink(
  db: SupabaseClient,
  quote: any,
  overrides: { forceClientId?: string; forceCreateNew?: boolean },
): Promise<QuoteWorkflowLinkResult> {
  let clientId: string | null = quote.client_id ?? null;

  if (!clientId) {
    if (overrides.forceClientId) {
      clientId = overrides.forceClientId;
    } else if (overrides.forceCreateNew) {
      clientId = await createClientFromQuote(db, quote);
    } else {
      const match = await matchClient(db, {
        businessRegistrationNumber: quote.business_registration_number,
        email: quote.email,
        phone: quote.phone,
        hospitalName: quote.hospital_name,
      });
      if (match.status === "matched") {
        clientId = match.clientId;
      } else if (match.status === "needs_confirmation") {
        return { status: "needs_confirmation", candidate: match.candidate };
      } else {
        return { status: "needs_registration", hospitalName: String(quote.hospital_name || "").trim() };
      }
    }
  }
  if (!clientId) throw new Error("고객을 확인하지 못했습니다.");

  // 프로젝트(워크플로우) 자동 시작 — 이 견적서에 이미 연결된 프로젝트가 없을 때만 새로 만든다.
  let workflowRunId: string | null = quote.workflow_run_id ?? null;
  if (!workflowRunId) {
    const { data: client, error: clientError } = await db.from("clients").select("hospital_name, contact_name").eq("id", clientId).maybeSingle();
    if (clientError) throw new Error(`고객 정보를 확인하지 못했습니다: ${clientError.message}`);
    if (!client) throw new Error("연결할 고객을 찾을 수 없습니다.");
    const projectName = quote.title || `${quote.hospital_name || client?.hospital_name || "고객"} 촬영`;
    const { data: run, error: runError } = await db
      .from("workflow_runs")
      .insert({
        client_id: clientId,
        client_name: quote.hospital_name || client?.hospital_name || "",
        project_name: projectName,
        manager_name: quote.contact_name || client?.contact_name || "",
        contact_name: quote.contact_name || "",
        contact_email: quote.email || "",
        shoot_date: quote.shoot_date || null,
        current_step_key: "quote",
        next_action: buildNextAction("quote"),
        status: "active",
        template_id: "11111111-1111-1111-1111-111111111111",
      })
      .select()
      .single();
    if (runError || !run) throw new Error(runError?.message || "워크플로우를 생성하지 못했습니다.");
    const newRunId = run.id as string;
    workflowRunId = newRunId;
    await ensureStepRun(db, newRunId, "quote", "in_progress");
    await createStepTasks(db, newRunId, "quote");
    await logAgent(db, {
      workflow_run_id: newRunId,
      log_type: "workflow_started",
      message: `${projectName} 워크플로우가 견적서 처리로 자동 시작되었습니다.`,
    });
  }

  const { data: linkedQuote, error: linkError } = await db
    .from("quotes")
    .update({ client_id: clientId, workflow_run_id: workflowRunId })
    .eq("id", quote.id)
    .select("id,client_id,workflow_run_id")
    .single();
  if (linkError || !linkedQuote) throw new Error(linkError?.message || "견적서 연결 정보를 저장하지 못했습니다.");
  if (linkedQuote.client_id !== clientId || linkedQuote.workflow_run_id !== workflowRunId) {
    throw new Error("견적서 연결 정보 저장 검증이 일치하지 않습니다.");
  }

  return { status: "linked", clientId, workflowRunId };
}
