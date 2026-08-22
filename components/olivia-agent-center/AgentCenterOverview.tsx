"use client";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Lightbulb, ShieldCheck } from "lucide-react";
import type { AgentCenterSummary, AgentCenterItem } from "./types";
import type { OliviaAgentRun } from "@/lib/olivia/agentRuns/types";
import { AgentRunCard } from "./AgentRunCard";

function titleOf(item:AgentCenterItem){return String(item.title||item.goal||item.client_name||item.project_name||item.message||"업무 항목")}
function MiniSection({title,count,icon:Icon,items,empty,onSelect}:{title:string;count:number;icon:typeof Clock3;items:AgentCenterItem[];empty:string;onSelect:(item:AgentCenterItem)=>void}){return <section className="agent-center-section"><header><span><Icon size={16}/>{title}</span><b>{count}</b></header>{items.length?<div className="agent-center-section__list">{items.slice(0,6).map((item)=><button key={item.id} onClick={()=>onSelect(item)}><span><strong>{titleOf(item)}</strong><small>{String(item.status||item.current_step_key||item.description||"")}</small></span><i>›</i></button>)}</div>:<p>{empty}</p>}</section>}

export function AgentCenterOverview({summary,loading,onSelect,onRunAction}:{summary?:AgentCenterSummary;loading:boolean;onSelect:(item:AgentCenterItem|OliviaAgentRun)=>void;onRunAction:(id:string,action:"pause"|"resume"|"cancel")=>void}){
  if(!summary&&loading)return <div className="agent-center-overview is-loading">{Array.from({length:6},(_,i)=><div key={i}/>)}</div>;
  if(!summary)return <div className="agent-center-empty">업무 현황을 불러오지 못했어요. 다시 시도해주세요.</div>;
  return <div className="agent-center-overview">
    <section className="agent-center-section is-runs"><header><span><Clock3 size={16}/>지금 Olivia가 처리 중인 업무</span><b>{summary.counts.running}</b></header>{summary.runningRuns.length?<div className="agent-run-grid">{summary.runningRuns.slice(0,4).map(run=><AgentRunCard key={run.id} run={run} onSelect={onSelect} onAction={onRunAction}/>)}</div>:<p>현재 실행 중인 Agent Run이 없습니다.</p>}</section>
    <div className="agent-center-overview__grid"><MiniSection title="대표 승인이 필요한 항목" count={summary.counts.approvals} icon={ShieldCheck} items={summary.pendingApprovals} empty="승인 대기 항목이 없습니다." onSelect={onSelect}/><MiniSection title="오늘 놓치면 안 되는 일" count={summary.counts.today} icon={CalendarDays} items={summary.todayItems} empty="오늘 남은 일정이 없습니다." onSelect={onSelect}/><MiniSection title="멈춰 있는 고객 프로젝트" count={summary.counts.stalled} icon={AlertCircle} items={summary.stalledProjects} empty="장기 정체 프로젝트가 없습니다." onSelect={onSelect}/><MiniSection title="Olivia가 먼저 발견한 문제" count={summary.counts.insights} icon={Lightbulb} items={summary.proactiveInsights} empty="새로운 인사이트가 없습니다." onSelect={onSelect}/><MiniSection title="최근 완료한 업무와 결과물" count={summary.counts.completed} icon={CheckCircle2} items={summary.recentResults} empty="최근 완료 Run이 없습니다." onSelect={onSelect}/></div>
    {summary.partialErrors.length?<small className="agent-center-partial"><AlertCircle size={12}/>일부 데이터는 다음 동기화에서 다시 확인합니다.</small>:null}
  </div>;
}
