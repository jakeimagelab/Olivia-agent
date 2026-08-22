import type { SupabaseClient } from "@supabase/supabase-js";
import type { OliviaContextSnapshot } from "./types";

export function hasDatabaseFastPath(message:string){
  return /(오늘.*(일정|할\s*일)|승인.*(대기|목록)|진행\s*중.*(Agent\s*Run|에이전트\s*런|업무)|최근.*완료.*업무|긴급.*(인사이트|문제)|현재.*(프로젝트|업무).*(상태|진행))/i.test(message);
}

function rows<T>(data:T[]|null){return data??[]}

export async function resolveDatabaseFastPath(db:SupabaseClient,message:string,context:OliviaContextSnapshot,todayISO:string):Promise<string|null>{
  if(/오늘.*(일정|할\s*일)|(일정|할\s*일).*오늘/i.test(message)){
    const {data,error}=await db.from("calendar_tasks").select("title,time,completed,location").eq("date",todayISO).order("time",{ascending:true,nullsFirst:false}).limit(10);
    if(error)return null; if(!rows(data).length)return "오늘 등록된 일정은 없어요.";
    return `오늘 일정은 ${data!.length}개예요.\n${data!.map((item)=>`- ${item.time||"시간 미정"} ${item.title}${item.completed?" (완료)":""}`).join("\n")}`;
  }
  if(/승인.*(대기|목록)|(대기|목록).*승인/i.test(message)){
    const {data,error}=await db.from("agent_approvals").select("title,client_name,created_at").eq("status","pending").order("created_at").limit(10);
    if(error)return null; if(!rows(data).length)return "현재 승인 대기 항목은 없어요.";
    return `승인 대기 ${data!.length}건이 있어요.\n${data!.map((item)=>`- ${item.title}${item.client_name?` · ${item.client_name}`:""}`).join("\n")}`;
  }
  if(/진행\s*중.*(Agent\s*Run|에이전트\s*런|업무)/i.test(message)){
    const {data,error}=await db.from("olivia_agent_runs").select("goal,status,progress,current_step_key").in("status",["queued","planning","running","waiting_approval","paused"]).order("updated_at",{ascending:false}).limit(10);
    if(error)return null; if(!rows(data).length)return "현재 실행 중인 Agent Run은 없어요.";
    return `진행 중인 Agent Run은 ${data!.length}개예요.\n${data!.map((run)=>`- ${run.goal} · ${run.progress}% · ${run.status}`).join("\n")}`;
  }
  if(/최근.*완료.*업무/i.test(message)){
    const {data,error}=await db.from("olivia_agent_runs").select("goal,result_summary,completed_at").eq("status","completed").order("completed_at",{ascending:false}).limit(6);
    if(error)return null; if(!rows(data).length)return "최근 완료된 Agent Run은 아직 없어요.";
    return data!.map((run)=>`- ${run.goal}${run.result_summary?` — ${run.result_summary}`:""}`).join("\n");
  }
  if(/긴급.*(인사이트|문제)/i.test(message)){
    const {data,error}=await db.from("olivia_insights").select("title,summary,priority_score").in("status",["open","acknowledged","action_created"]).order("priority_score",{ascending:false}).limit(8);
    if(error)return null; if(!rows(data).length)return "현재 긴급 Olivia 인사이트는 없어요.";
    return data!.map((item)=>`- ${item.title}${item.summary?`: ${item.summary}`:""}`).join("\n");
  }
  if(/현재.*(프로젝트|업무).*(상태|진행)/i.test(message) && context.activeProjectId){
    const {data,error}=await db.from("workflow_runs").select("client_name,project_name,current_step_key,next_action,status").eq("id",context.activeProjectId).maybeSingle();
    if(error||!data)return null;
    return `${data.client_name||context.activeClientName||"현재 고객"}의 ${data.project_name||"프로젝트"}는 ${data.current_step_key||"단계 미정"} 단계예요.${data.next_action?` 다음 업무는 ${data.next_action}입니다.`:""}`;
  }
  return null;
}
