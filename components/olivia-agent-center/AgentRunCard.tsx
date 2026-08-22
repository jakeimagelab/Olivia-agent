"use client";
import { Pause, Play, X } from "lucide-react";
import type { OliviaAgentRun } from "@/lib/olivia/agentRuns/types";

const LABEL:Record<string,string>={queued:"대기",planning:"계획 중",running:"실행 중",waiting_approval:"승인 대기",paused:"일시정지",completed:"완료",failed:"실패",canceled:"취소"};
export function AgentRunCard({run,onSelect,onAction}:{run:OliviaAgentRun;onSelect:(run:OliviaAgentRun)=>void;onAction:(id:string,action:"pause"|"resume"|"cancel")=>void}){
  return <article className="agent-run-card" onClick={()=>onSelect(run)} tabIndex={0} onKeyDown={(e)=>{if(e.key==="Enter")onSelect(run)}}>
    <div className="agent-run-card__top"><span className={`agent-status is-${run.status}`}>{LABEL[run.status]||run.status}</span><time>{new Date(run.updated_at).toLocaleString("ko-KR",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</time></div>
    <strong>{run.goal}</strong><div className="agent-run-card__progress"><i style={{width:`${run.progress}%`}}/></div><small>{run.current_step_key||"실행 준비"} · {run.progress}%</small>
    {!(["completed","failed","canceled"] as string[]).includes(run.status)?<div className="agent-run-card__actions" onClick={(e)=>e.stopPropagation()}>{run.status==="paused"?<button onClick={()=>onAction(run.id,"resume")}><Play size={12}/>재개</button>:<button onClick={()=>onAction(run.id,"pause")}><Pause size={12}/>일시정지</button>}<button onClick={()=>onAction(run.id,"cancel")}><X size={12}/>취소</button></div>:null}
  </article>;
}
