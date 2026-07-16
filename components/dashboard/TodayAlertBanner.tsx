"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Clock } from "lucide-react";

type BriefTask = { id: string; title: string; completed: boolean; time?: string | null };

/* 예전 app/page.tsx의 Dashboard 첫 화면에 있던 "디지털시계 + 올리비아 인사말" 배너 —
   /admin 콘솔로 옮겨오면서 빠졌던 걸 그대로 복구. 데이터를 직접 fetch하는 독립 컴포넌트라
   어디서든(대시보드 홈 등) <TodayAlertBanner/> 하나만 놓으면 된다. */
export default function TodayAlertBanner() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [tasks, setTasks] = useState<BriefTask[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(d => {
      if (!d.ok) return;
      setTasks(d.todayTasks ?? []);
      const c = d.clients ?? {}; const m = d.mailing ?? {};
      setTotalPending(
        (m.pending?.length ?? 0) + (c.quoteFollowUp?.length ?? 0) + (c.contractPending?.length ?? 0) +
        (c.galleryPending?.length ?? 0) + (c.reviewPending?.length ?? 0) + (c.snsPending?.length ?? 0)
      );
    }).catch(() => {});
  }, []);

  const hour = now ? now.getHours() : null;
  const greeting = hour === null ? "안녕하세요" : hour < 12 ? "좋은 아침이에요" : hour < 18 ? "수고하고 계세요" : "오늘도 고생많으셨어요";
  const today = now ? now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" }) : "";
  const clock = now ? now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "--:--:--";

  const remaining = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed).length;
  const nextTask = remaining.sort((a, b) => {
    const ta = a.time ? a.time.split("~")[0].trim() : "99:99";
    const tb = b.time ? b.time.split("~")[0].trim() : "99:99";
    return ta.localeCompare(tb);
  })[0];

  return (
    <div style={{ background: "linear-gradient(135deg,#155855 0%,#0d3e3b 100%)", borderRadius: 16, padding: "14px 16px", boxShadow: "0 4px 20px rgba(21,88,85,.18)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(232,93,44,.85)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Bell size={13} color="#fff"/>
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,.45)", letterSpacing: ".1em", textTransform: "uppercase" }}>OLIVIA DAILY BRIEF</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)" }}>{today}</div>
          </div>
        </div>
        {totalPending > 0 && (
          <div style={{ background: "#E85D2C", borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 900, color: "#fff" }}>
            대기 {totalPending}건
          </div>
        )}
      </div>

      <div style={{
        textAlign: "center", padding: "8px 0", marginBottom: 8,
        borderTop: "1px solid rgba(255,255,255,.1)", borderBottom: "1px solid rgba(255,255,255,.1)",
      }}>
        <div style={{
          fontSize: 24, fontWeight: 800, color: "#6EE7B7",
          fontVariantNumeric: "tabular-nums", letterSpacing: ".08em",
          fontFamily: "'SF Mono','Menlo','Consolas',monospace",
        }}>{clock}</div>
      </div>

      <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: "0 0 8px", lineHeight: 1.5 }}>
        {greeting}, 정연호 대표님.
        {remaining.length > 0
          ? <> 오늘 할일 <span style={{ color: "#EB8F22", fontWeight: 900 }}>{remaining.length}개</span> 남았어요.</>
          : tasks.length > 0
            ? <> 오늘 할일 <span style={{ color: "#6EE7B7", fontWeight: 900 }}>모두 완료</span>했어요!</>
            : <> 오늘 등록된 일정이 없어요.</>
        }
      </p>

      {nextTask && (
        <Link href="/calendar" style={{ textDecoration: "none" }}>
          <div style={{ background: "rgba(255,255,255,.1)", borderRadius: 9, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,.12)" }}>
            <Clock size={11} color="rgba(255,255,255,.6)"/>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,.7)", flexShrink: 0 }}>다음:</span>
            {nextTask.time && <span style={{ fontSize: 10, fontWeight: 800, color: "#EB8F22", background: "rgba(235,143,34,.2)", padding: "1px 6px", borderRadius: 4, flexShrink: 0 }}>{nextTask.time}</span>}
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nextTask.title}</span>
          </div>
        </Link>
      )}

      {tasks.length > 0 && done > 0 && (
        <div style={{ marginTop: 8, height: 3, background: "rgba(255,255,255,.1)", borderRadius: 99 }}>
          <div style={{ height: "100%", background: "#6EE7B7", width: `${(done / tasks.length) * 100}%`, borderRadius: 99, transition: "width .4s" }}/>
        </div>
      )}
    </div>
  );
}
