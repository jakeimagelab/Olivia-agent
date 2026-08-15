import type { SupabaseClient } from "@supabase/supabase-js";
import { matchClient } from "@/lib/clientMatching";
import { buildNextAction, createStepTasks, ensureStepRun, logAgent } from "@/lib/workflowAutomation";

// 견적서를 "포털 공개"하거나 "최종완료"할 때 둘 다 똑같이 고객/프로젝트(워크플로우)가 아직
// 없으면 자동으로 매칭·생성해야 한다 — app/api/quotes/[id]/publish/route.ts에서 쓰던 로직을
// 그대로 뽑아내서 app/api/quotes/[id]/complete/route.ts와 공유한다(코드 요청서 2차 2번 항목,
// 2026-08-16). 동작은 기존과 동일, 호출 지점만 두 곳으로 늘었다.
export type QuoteWorkflowLinkResult =
  | { status: "linked"; clientId: string; workflowRunId: string }
  | { status: "needs_confirmation"; candidate: { id: string; hospital_name: string } };

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
        clientId = await createClientFromQuote(db, quote);
      }
    }
  }
  if (!clientId) throw new Error("고객을 확인하지 못했습니다.");

  // 프로젝트(워크플로우) 자동 시작 — 이 견적서에 이미 연결된 프로젝트가 없을 때만 새로 만든다.
  let workflowRunId: string | null = quote.workflow_run_id ?? null;
  if (!workflowRunId) {
    const { data: client } = await db.from("clients").select("hospital_name, contact_name").eq("id", clientId).maybeSingle();
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
    if (runError) throw new Error(runError.message);
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

  await db.from("quotes").update({ client_id: clientId, workflow_run_id: workflowRunId }).eq("id", quote.id);

  return { status: "linked", clientId, workflowRunId };
}
