import type { SupabaseClient } from "@supabase/supabase-js";
import type { OliviaAgentRun } from "./types";

export function validateWorkflowLink(run:Pick<OliviaAgentRun,"client_id">,workflow:{client_id?:string|null}|null){
  if(!workflow)return {valid:false as const,reason:"연결된 프로젝트를 찾지 못했어요."};
  if(run.client_id&&workflow.client_id&&run.client_id!==workflow.client_id)return {valid:false as const,reason:"고객과 프로젝트 연결이 일치하지 않아요."};
  return {valid:true as const};
}

export async function validateAgentRunContext(db: SupabaseClient, run: OliviaAgentRun) {
  if (!run.workflow_run_id) return { valid: true as const, workflow: null };
  const result = await db.from("workflow_runs").select("id,current_step_key,status,client_id,client_name").eq("id", run.workflow_run_id).maybeSingle();
  if (result.error) return { valid: false as const, reason: result.error.message };
  const link=validateWorkflowLink(run,result.data);
  if(!link.valid)return link;
  return { valid: true as const, workflow: result.data };
}
