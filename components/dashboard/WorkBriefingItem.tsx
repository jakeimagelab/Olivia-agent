"use client";

import Link from "next/link";
import { Check, Clock3 } from "lucide-react";
import type { WorkBriefingItem as WorkItem } from "@/lib/dashboardBriefing";

export default function WorkBriefingItem({
  item,
  saving,
  onComplete,
}: {
  item: WorkItem;
  saving: boolean;
  onComplete: (item: WorkItem) => void;
}) {
  return (
    <article className="home-work-item">
      <div className="home-work-item__top">
        <span className={`home-briefing-badge is-${item.kind}`}>{item.badge}</span>
        <span className={`home-work-item__status${item.status === "지연" ? " is-delayed" : ""}`}>{item.status}</span>
      </div>
      <h3>{item.title}</h3>
      {item.description ? <p>{item.description}</p> : null}
      <div className="home-work-item__meta">
        {item.projectName ? <span>{item.projectName}</span> : null}
        {item.deadline ? <span><Clock3 size={12} aria-hidden="true"/>{item.deadline}</span> : null}
      </div>
      <div className="home-work-item__actions">
        <Link href={item.actionHref}>{item.actionLabel}</Link>
        {item.kind === "todo" ? (
          <button type="button" disabled={saving} onClick={() => onComplete(item)}>
            <Check size={13} aria-hidden="true"/>{saving ? "저장 중" : "완료"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
