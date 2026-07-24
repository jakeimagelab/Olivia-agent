"use client";

import { Activity } from "lucide-react";

export default function PcrmActivityTimeline({ activities }: { activities: any[] }) {
  return (
    <section className="pcrm-admin-activity">
      <header><div><span>PCRM · ACTIVITY</span><h2>프로젝트 활동 기록</h2></div><Activity size={17} /></header>
      {activities.length === 0 ? (
        <p>아직 기록된 프로젝트 활동이 없습니다.</p>
      ) : (
        <div>
          {activities.slice(0, 8).map((item) => (
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
