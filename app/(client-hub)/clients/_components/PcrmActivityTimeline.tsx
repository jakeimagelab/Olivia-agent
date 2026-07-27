"use client";

import { useMemo, useState } from "react";
import { Activity } from "lucide-react";

const CATEGORY_LABEL: Record<string, string> = {
  all: "전체", document: "문서", schedule: "일정", portal: "포털", gallery: "갤러리", revision: "수정요청",
};

function categoryOf(actionType: string): string {
  if (actionType.startsWith("publication_") || actionType.includes("attachment")) return "document";
  if (actionType.includes("revision")) return "revision";
  if (actionType.includes("photo_selection") || actionType.includes("final_delivery")) return "gallery";
  if (actionType.includes("inquiry") || actionType.includes("preparation") || actionType.includes("portal")) return "portal";
  if (actionType.includes("calendar") || actionType.includes("schedule")) return "schedule";
  return "document";
}

export default function PcrmActivityTimeline({ activities, variant = "compact", onViewAll }: { activities: any[]; variant?: "compact" | "full" | "row"; onViewAll?: () => void }) {
  const [filter, setFilter] = useState("all");
  const filtered = useMemo(() => {
    if (variant !== "full" || filter === "all") return activities;
    return activities.filter((item) => categoryOf(item.action_type || "") === filter);
  }, [activities, filter, variant]);
  const list = variant === "full" ? filtered : filtered.slice(0, variant === "row" ? 5 : 8);

  return (
    <section className={`pcrm-admin-activity${variant === "row" ? " pcrm-admin-activity--row" : ""}`}>
      <header>
        <div>{variant === "row" ? <h2>최근 활동</h2> : <><span>PCRM · ACTIVITY</span><h2>프로젝트 활동 기록</h2></>}</div>
        {onViewAll ? <button type="button" onClick={onViewAll} style={{ border: 0, background: "none", color: "#155855", fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>전체 활동 보기 ›</button> : <Activity size={17} />}
      </header>
      {variant === "full" && (
        <div className="pcrm-project-tabs">
          {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
            <button key={key} type="button" data-active={filter === key} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <p>아직 기록된 프로젝트 활동이 없습니다.</p>
      ) : (
        <div>
          {list.map((item) => (
            <article key={item.id}>
              <i data-actor={item.actor_type} />
              <div><strong>{item.title}</strong>{item.description && <span>{item.description}</span>}</div>
              <small>{new Date(item.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
