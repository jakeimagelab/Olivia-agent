"use client";
import { Minus, RefreshCw, X } from "lucide-react";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";

export function AgentCenterHeader({ running, generatedAt, refreshing, onRefresh, onMinimize, onClose }: { running:number; generatedAt?:string; refreshing:boolean; onRefresh:()=>void; onMinimize:()=>void; onClose:()=>void }) {
  return <header className="olivia-agent-center__header">
    <div className="olivia-agent-center__brand"><span><OliviaIcon size={20}/></span><div><strong>Olivia Agent Center</strong><small><i className={running ? "is-working" : ""}/>{running ? `${running}개 업무 실행 중` : "대기 중"}</small></div></div>
    <div className="olivia-agent-center__header-actions"><small>{generatedAt ? `동기화 ${new Date(generatedAt).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}` : "동기화 준비 중"}</small><button onClick={onRefresh} aria-label="새로고침"><RefreshCw size={16} className={refreshing?"is-spinning":""}/></button><button onClick={onMinimize} aria-label="최소화"><Minus size={17}/></button><button onClick={onClose} aria-label="닫기"><X size={18}/></button></div>
  </header>;
}
