"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import OliviaConversation from "@/components/olivia-v2/OliviaConversation";
import OliviaTaskStrip from "@/components/olivia/OliviaTaskStrip";
import { AgentCenterHeader } from "./AgentCenterHeader";
import { AgentCenterOverview } from "./AgentCenterOverview";
import { AgentCenterMobileTabs } from "./AgentCenterMobileTabs";
import type { AgentCenterItem, AgentCenterSummary } from "./types";
import type { OliviaAgentRun } from "@/lib/olivia/agentRuns/types";

let summaryCache:AgentCenterSummary|undefined;
function detailTitle(item:AgentCenterItem|OliviaAgentRun){
  const value=item as unknown as Record<string,unknown>;
  return String(value.title||value.goal||value.client_name||"업무 상세");
}
function detailHref(item:AgentCenterItem|OliviaAgentRun){
  const value=item as unknown as Record<string,unknown>;
  const metadata=value.metadata&&typeof value.metadata==="object"?value.metadata as Record<string,unknown>:{};
  return typeof metadata.resultHref==="string"?metadata.resultHref:undefined;
}
// isOpen이 false여도 컴포넌트 자체는 계속 마운트돼 있다(app/layout.tsx의 flex row에 항상
// 떠 있는 사이드 패널) — 폭을 0으로 CSS 트랜지션시켜 열고 닫아야 부드러운 모션이 나오기
// 때문이다(조건부 마운트/언마운트로는 열림/닫힘에 애니메이션을 줄 수 없다). 그래서 데이터
// 폴링(refresh)만 isOpen일 때로 제한해서, 닫혀 있는 동안 불필요한 요청이 안 나가게 한다.
export default function OliviaAgentCenter({isOpen,onClose,onMinimize,chatContent}:{isOpen:boolean;onClose:()=>void;onMinimize:()=>void;chatContent?:ReactNode}){
  const [summary,setSummary]=useState(summaryCache); const [loading,setLoading]=useState(!summaryCache); const [refreshing,setRefreshing]=useState(false); const [selected,setSelected]=useState<AgentCenterItem|OliviaAgentRun>(); const [tab,setTab]=useState<"overview"|"chat">("overview");
  // 데스크톱 3단 분할 토글 — 기본은 채팅 패널만(70/30), 누르면 가운데 업무 현황 패널이 추가로
  // 열린다(50/20/30). 이 컴포넌트가 페이지 이동에도 계속 마운트돼 있으므로 별도 전역 스토어
  // 없이 로컬 state만으로 네비게이션 간 상태가 유지된다.
  const [overviewOpen,setOverviewOpen]=useState(false);
  const refresh=useCallback(async(silent=false)=>{if(!silent)setRefreshing(true);try{const response=await fetch("/api/olivia/agent-center/summary",{cache:"no-store"});const data=await response.json();if(response.ok&&data.ok){summaryCache=data;setSummary(data)}}finally{setLoading(false);setRefreshing(false)}},[]);
  useEffect(()=>{if(!isOpen)return;void refresh(Boolean(summaryCache));const interval=window.setInterval(()=>void refresh(true),summary?.counts.running?5000:25000);return()=>clearInterval(interval)},[isOpen,refresh,summary?.counts.running]);
  useEffect(()=>{if(!isOpen)return;const handle=()=>void refresh(true);window.addEventListener("olivia-agent-center-refresh",handle);return()=>window.removeEventListener("olivia-agent-center-refresh",handle)},[isOpen,refresh]);
  const runAction=async(id:string,action:"pause"|"resume"|"cancel")=>{await fetch(`/api/olivia/agent-runs/${id}/${action}`,{method:"POST"});await refresh(true)};
  return <div className={`olivia-agent-panel${isOpen?" is-open":""}${overviewOpen?" is-overview-open":""}`}><div className="olivia-agent-center" role="region" aria-label="Olivia Agent"><AgentCenterHeader running={summary?.counts.running||0} generatedAt={summary?.generatedAt} refreshing={refreshing} overviewOpen={overviewOpen} onToggleOverview={()=>setOverviewOpen((v)=>!v)} onRefresh={()=>void refresh()} onMinimize={onMinimize} onClose={onClose}/><AgentCenterMobileTabs tab={tab} onChange={setTab}/><div className="olivia-agent-center__body"><main className={tab==="chat"?"is-mobile-hidden":""}>{selected?<div className="agent-center-detail"><button onClick={()=>setSelected(undefined)}>← 업무 현황</button><h2>{detailTitle(selected)}</h2><dl>{Object.entries(selected).filter(([key,value])=>["status","progress","current_step_key","description","result_summary","error_message","updated_at"].includes(key)&&value!=null&&value!=="").map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>{detailHref(selected)?<a href={detailHref(selected)}>관련 기능에서 열기 →</a>:null}</div>:<AgentCenterOverview summary={summary} loading={loading} onSelect={setSelected} onRunAction={runAction}/>}</main><aside className={tab==="overview"?"is-mobile-hidden":""}><OliviaTaskStrip/>{chatContent ?? <OliviaConversation variant="drawer"/>}</aside></div></div></div>;
}
