"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import OliviaInsightCard from "@/components/olivia/OliviaInsightCard";

export default function OliviaDashboardPanel() {
  const [insights, setInsights] = useState<any[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const load = useCallback(() => {
    fetch("/api/olivia/insights?minPriority=60&limit=6", { cache: "no-store" }).then((r) => r.json()).then((json) => {
      if (json.ok) { setInsights(json.insights ?? []); setUnavailable(false); }
      else setUnavailable(true);
    }).catch(() => setUnavailable(true));
  }, []);
  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener("olivia-calendar-updated", refresh);
    window.addEventListener("olivia-data-changed", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("olivia-calendar-updated", refresh);
      window.removeEventListener("olivia-data-changed", refresh);
      window.clearInterval(timer);
    };
  }, [load]);
  if (unavailable) return null;
  return (
    <section className="olivia-dashboard-panel">
      <header><div><span>PROACTIVE OLIVIA</span><h2>대표님, 지금 확인할 내용</h2><p>위험과 지연을 먼저 발견하고 다음 행동을 준비했습니다.</p></div><Link href="/olivia-assistant">전체 보기 →</Link></header>
      {insights.length ? <div className="olivia-dashboard-grid">{insights.slice(0, 3).map((insight) => <OliviaInsightCard key={insight.id} insight={insight} compact onChanged={load}/>)}</div> : <div className="olivia-empty">지금 바로 확인할 긴급 항목이 없습니다.</div>}
    </section>
  );
}
