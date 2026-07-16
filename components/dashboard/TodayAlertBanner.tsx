"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, Bell, Clock, RefreshCw } from "lucide-react";

type BriefTask = { id: string; title: string; completed: boolean; time?: string | null };
type BriefState = "loading" | "ready" | "empty" | "error";

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
  const [briefState, setBriefState] = useState<BriefState>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBriefState("loading");
    fetch("/api/dashboard", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`dashboard:${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!data.ok) throw new Error("dashboard:not-ok");
        const nextTasks: BriefTask[] = data.todayTasks ?? [];
        const clients = data.clients ?? {};
        const mailing = data.mailing ?? {};
        const pending =
          (mailing.pending?.length ?? 0) + (clients.quoteFollowUp?.length ?? 0) +
          (clients.contractPending?.length ?? 0) + (clients.galleryPending?.length ?? 0) +
          (clients.reviewPending?.length ?? 0) + (clients.snsPending?.length ?? 0);
        setTasks(nextTasks);
        setTotalPending(pending);
        setBriefState(nextTasks.length || pending ? "ready" : "empty");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setBriefState("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const hour = now ? now.getHours() : null;
  const greeting = hour === null ? "안녕하세요" : hour < 12 ? "좋은 아침이에요" : hour < 18 ? "수고하고 계세요" : "오늘도 고생많으셨어요";
  const today = now ? now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" }) : "";
  const clock = now ? now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "--:--:--";

  const remaining = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed).length;
  const nextTask = remaining.toSorted((a, b) => {
    const ta = a.time ? a.time.split("~")[0].trim() : "99:99";
    const tb = b.time ? b.time.split("~")[0].trim() : "99:99";
    return ta.localeCompare(tb);
  })[0];

  return (
    <section className="oa-daily-brief" aria-live="polite" aria-busy={briefState === "loading"}>
      <div className="oa-daily-brief__top">
        <div className="oa-daily-brief__identity">
          <span className="oa-daily-brief__bell"><Bell size={13} aria-hidden="true"/></span>
          <div>
            <div className="oa-daily-brief__eyebrow">OLIVIA DAILY BRIEF</div>
            <div className="oa-daily-brief__date">{today}</div>
          </div>
        </div>
        {briefState === "ready" && <span className="oa-daily-brief__state">{totalPending > 0 ? `대기 ${totalPending}건` : "방금 갱신"}</span>}
      </div>

      <div className="oa-daily-brief__clock">{clock}</div>

      <div className="oa-daily-brief__message">
        {briefState === "loading" ? <><span className="oa-daily-brief__pulse"/> 운영 데이터를 불러오는 중입니다.</> : null}
        {briefState === "error" ? <><AlertCircle size={15} aria-hidden="true"/> 운영 데이터 연결에 실패했습니다.<button type="button" onClick={() => setReloadKey((key) => key + 1)}><RefreshCw size={12} aria-hidden="true"/>다시 불러오기</button></> : null}
        {briefState === "empty" ? <>{greeting}, 정연호 대표님. 오늘 등록된 일정이 없어요.</> : null}
        {briefState === "ready" ? <>{greeting}, 정연호 대표님. {remaining.length > 0 ? <>오늘 할일 <strong>{remaining.length}개</strong> 남았어요.</> : <>오늘 할일을 모두 완료했어요!</>}</> : null}
      </div>

      {nextTask && (
        <Link href="/calendar" className="oa-daily-brief__next">
          <Clock size={11} aria-hidden="true"/><span>다음</span>
          {nextTask.time && <time>{nextTask.time}</time>}
          <strong>{nextTask.title}</strong>
        </Link>
      )}

      {tasks.length > 0 && done > 0 && (
        <div className="oa-daily-brief__progress"><span style={{ width: `${(done / tasks.length) * 100}%` }}/></div>
      )}
    </section>
  );
}
