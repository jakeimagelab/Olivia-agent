"use client";

import { useEffect, useState } from "react";
import OliviaInsightCard from "@/components/olivia/OliviaInsightCard";

export default function OliviaProjectPanel({ workflowRunId }: { workflowRunId?: string | null }) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    if (!workflowRunId) return;
    fetch(`/api/olivia/insights?workflowRunId=${encodeURIComponent(workflowRunId)}&limit=5`, { cache: "no-store" }).then((r) => r.json()).then((json) => { if (json.ok) setItems(json.insights ?? []); }).catch(() => {});
  }, [workflowRunId]);
  if (!workflowRunId || !items.length) return null;
  return <section className="olivia-project-panel"><header><span>OLIVIA</span><h2>현재 프로젝트 인사이트 {items.length}건</h2></header><div>{items.slice(0, 2).map((item) => <OliviaInsightCard key={item.id} insight={item} compact/>)}</div></section>;
}
