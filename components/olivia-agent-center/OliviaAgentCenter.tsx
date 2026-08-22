"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
export default function OliviaAgentCenter({onClose,onMinimize}:{onClose:()=>void;onMinimize:()=>void}){
  const dialogRef=useRef<HTMLDivElement>(null); const [summary,setSummary]=useState(summaryCache); const [loading,setLoading]=useState(!summaryCache); const [refreshing,setRefreshing]=useState(false); const [selected,setSelected]=useState<AgentCenterItem|OliviaAgentRun>(); const [tab,setTab]=useState<"overview"|"chat">("overview");
  const refresh=useCallback(async(silent=false)=>{if(!silent)setRefreshing(true);try{const response=await fetch("/api/olivia/agent-center/summary",{cache:"no-store"});const data=await response.json();if(response.ok&&data.ok){summaryCache=data;setSummary(data)}}finally{setLoading(false);setRefreshing(false)}},[]);
  useEffect(()=>{void refresh(Boolean(summaryCache));const interval=window.setInterval(()=>void refresh(true),summary?.counts.running?5000:25000);return()=>clearInterval(interval)},[refresh,summary?.counts.running]);
  useEffect(()=>{const handle=()=>void refresh(true);window.addEventListener("olivia-agent-center-refresh",handle);return()=>window.removeEventListener("olivia-agent-center-refresh",handle)},[refresh]);
  useEffect(()=>{const root=dialogRef.current;if(!root)return;const previous=document.activeElement as HTMLElement|null;document.body.style.overflow="hidden";const focusable=()=>Array.from(root.querySelectorAll<HTMLElement>('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])')).filter(el=>!el.hasAttribute("disabled"));focusable()[0]?.focus();const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){onClose();return}if(event.key!=="Tab")return;const nodes=focusable();if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}};document.addEventListener("keydown",key);return()=>{document.removeEventListener("keydown",key);document.body.style.overflow="";previous?.focus()}},[onClose]);
  const runAction=async(id:string,action:"pause"|"resume"|"cancel")=>{await fetch(`/api/olivia/agent-runs/${id}/${action}`,{method:"POST"});await refresh(true)};
  return <div className="olivia-agent-center-layer" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose()}}><div ref={dialogRef} className="olivia-agent-center" role="dialog" aria-modal="true" aria-labelledby="olivia-agent-center-title"><span id="olivia-agent-center-title" className="sr-only">Olivia Agent Center</span><AgentCenterHeader running={summary?.counts.running||0} generatedAt={summary?.generatedAt} refreshing={refreshing} onRefresh={()=>void refresh()} onMinimize={onMinimize} onClose={onClose}/><AgentCenterMobileTabs tab={tab} onChange={setTab}/><div className="olivia-agent-center__body"><main className={tab==="chat"?"is-mobile-hidden":""}>{selected?<div className="agent-center-detail"><button onClick={()=>setSelected(undefined)}>← 업무 현황</button><h2>{detailTitle(selected)}</h2><dl>{Object.entries(selected).filter(([key,value])=>["status","progress","current_step_key","description","result_summary","error_message","updated_at"].includes(key)&&value!=null&&value!=="").map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>{detailHref(selected)?<a href={detailHref(selected)}>관련 기능에서 열기 →</a>:null}</div>:<AgentCenterOverview summary={summary} loading={loading} onSelect={setSelected} onRunAction={runAction}/>}</main><aside className={tab==="overview"?"is-mobile-hidden":""}><OliviaTaskStrip/><OliviaConversation variant="drawer"/></aside></div></div></div>;
}
