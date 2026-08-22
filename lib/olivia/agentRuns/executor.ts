import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAgentRunEvent, getAgentRun, transitionAgentRun } from "./service";
import { validateAgentRunContext } from "./validator";
import type { OliviaAgentRun } from "./types";
import { computeTaskList, type TaskSessionType } from "@/lib/olivia/taskSession/nextAction";
import { processWorkflowStep } from "@/lib/olivia/tools/workflow";
import { startTaskSession } from "@/lib/olivia/tools/taskSession";
import { fuzzyNameSearchOne } from "@/lib/olivia/nameSearch";

const SESSION_TYPES=new Set<TaskSessionType>(["shoot-prep","quote-prep","contract-prep","delivery","general"]);

async function updateStep(db:SupabaseClient,runId:string,stepKey:string,patch:Record<string,unknown>){
  const {error}=await db.from("olivia_agent_run_steps").update({...patch,updated_at:new Date().toISOString()}).eq("run_id",runId).eq("step_key",stepKey);
  if(error) throw new Error(error.message);
}

async function keepRunning(db:SupabaseClient,run:OliviaAgentRun,progress:number,currentStepKey:string,metadata:Record<string,unknown>){
  const now=new Date();
  const {data,error}=await db.from("olivia_agent_runs").update({
    progress,current_step_key:currentStepKey,metadata,lease_owner:null,
    lease_expires_at:new Date(now.getTime()+30_000).toISOString(),updated_at:now.toISOString(),
  }).eq("id",run.id).select("*").single();
  if(error) throw new Error(error.message);
  return data as OliviaAgentRun;
}

export async function executeClaimedAgentRun(db: SupabaseClient, claimed: OliviaAgentRun) {
  let run = claimed;
  if (run.status === "queued") run = await transitionAgentRun(db, run.id, "planning", { progress: 5 });
  const requestedClientName=String(run.metadata?.clientName||"").trim();
  if(!run.workflow_run_id&&requestedClientName){
    const resolved=await fuzzyNameSearchOne<{id:string;client_id:string;client_name:string}>({
      db,table:"workflow_runs",nameColumn:"client_name",select:"id,client_id,client_name",query:requestedClientName,
      filter:(query:any)=>query.eq("status","active").order("updated_at",{ascending:false}),
    });
    if(resolved){
      const update=await db.from("olivia_agent_runs").update({workflow_run_id:resolved.id,client_id:resolved.client_id,metadata:{...run.metadata,clientName:resolved.client_name},updated_at:new Date().toISOString()}).eq("id",run.id).select("*").single();
      if(update.error)throw new Error(update.error.message);
      run=update.data as OliviaAgentRun;
    }
  }
  const detail = await getAgentRun(db, run.id);
  if (!detail) throw new Error("Agent Run을 찾지 못했어요.");
  const validation = await validateAgentRunContext(db, run);
  if (!validation.valid) return transitionAgentRun(db, run.id, "failed", { error_message: validation.reason });

  if (run.status === "planning") run = await transitionAgentRun(db, run.id, "running", { progress: 15, current_step_key: "resolve_context" });
  await updateStep(db,run.id,"resolve_context",{status:"completed",completed_at:new Date().toISOString(),output_data:{verified:true,workflow:validation.workflow??null}});

  const clientName=String(run.metadata?.clientName || (validation.workflow as Record<string,unknown>|undefined)?.client_name || "").trim();
  if(!run.workflow_run_id || !clientName){
    return transitionAgentRun(db,run.id,"failed",{error_message:"실행할 고객과 프로젝트를 확인하지 못했어요."});
  }

  const sessionType=SESSION_TYPES.has(run.run_type as TaskSessionType)?run.run_type as TaskSessionType:"general";
  const sessionResult=await startTaskSession({clientName,sessionType});
  const sessionId=typeof sessionResult.sessionId==="string"?sessionResult.sessionId:undefined;
  const resultHref=typeof sessionResult.href==="string"?sessionResult.href:undefined;
  if(!sessionId) return transitionAgentRun(db,run.id,"failed",{error_message:String(sessionResult.message||"Task Session을 시작하지 못했어요.")});

  await updateStep(db,run.id,"execute_goal",{status:"running",started_at:new Date().toISOString(),output_data:{sessionId}});
  const pendingApproval=await db.from("agent_approvals").select("id,status").eq("workflow_run_id",run.workflow_run_id).eq("status","pending").order("created_at").limit(1).maybeSingle();
  if(pendingApproval.error) throw new Error(pendingApproval.error.message);
  if(pendingApproval.data){
    await updateStep(db,run.id,"execute_goal",{status:"waiting_approval",approval_id:pendingApproval.data.id});
    return transitionAgentRun(db,run.id,"waiting_approval",{progress:Math.max(25,run.progress),current_step_key:"execute_goal",metadata:{...run.metadata,sessionId,resultHref,approvalId:pendingApproval.data.id}});
  }

  const before=await computeTaskList(db,run.workflow_run_id,sessionType);
  const doneBefore=before.tasks.filter((task)=>task.status==="done").length;
  if(before.tasks.length && doneBefore===before.tasks.length){
    await updateStep(db,run.id,"execute_goal",{status:"completed",completed_at:new Date().toISOString(),output_data:{sessionId,tasks:before.tasks}});
    await updateStep(db,run.id,"verify_result",{status:"completed",started_at:new Date().toISOString(),completed_at:new Date().toISOString(),output_data:{workflowVerified:true,tasks:before.tasks}});
    await db.from("olivia_task_sessions").update({status:"completed",updated_at:new Date().toISOString()}).eq("id",sessionId);
    return transitionAgentRun(db,run.id,"completed",{progress:100,current_step_key:"verify_result",result_summary:`${clientName} ${sessionType} 업무의 실제 워크플로우 상태를 확인하고 완료했어요.`});
  }

  const processResult=await processWorkflowStep({clientName});
  const after=await computeTaskList(db,run.workflow_run_id,sessionType);
  const doneAfter=after.tasks.filter((task)=>task.status==="done").length;
  const progress=after.tasks.length?Math.min(90,20+Math.round(doneAfter/after.tasks.length*70)):30;
  await appendAgentRunEvent(db,run.id,"run_step_updated",String(processResult.message||"현재 단계 업무를 확인했어요."),{sessionId,done:doneAfter,total:after.tasks.length});
  return keepRunning(db,run,progress,"execute_goal",{...run.metadata,sessionId,resultHref,lastDoneCount:doneAfter,lastCheckedAt:new Date().toISOString()});
}
