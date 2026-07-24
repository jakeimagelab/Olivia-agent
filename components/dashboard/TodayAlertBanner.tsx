"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, Bell, CalendarCheck2, Check, Clock, RefreshCw, Sparkles } from "lucide-react";
import { useHomeDashboardData, type HomeCalendarTask } from "@/components/dashboard/HomeDashboardData";

function taskStartTime(task: HomeCalendarTask) {
  return task.time?.split("~")[0].trim() || "99:99";
}

/* 홈의 브리핑·스케줄·업무 목록은 HomeDashboardDataProvider의 단일 요청 결과를 공유한다. */
function useDailyBrief() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data, state: briefState, error, savingTaskIds, refresh, setTaskCompleted } = useHomeDashboardData();
  const tasks = data?.todayTasks ?? [];
  const clients = data?.clients ?? {};
  const mailing = data?.mailing ?? {};
  const totalPending =
    (mailing.pending?.length ?? 0) + (clients.quoteFollowUp?.length ?? 0) +
    (clients.contractPending?.length ?? 0) + (clients.galleryPending?.length ?? 0) +
    (clients.reviewPending?.length ?? 0) + (clients.snsPending?.length ?? 0);

  const hour = now ? now.getHours() : null;
  const greeting = hour === null ? "안녕하세요" : hour < 12 ? "좋은 아침이에요" : hour < 18 ? "수고하고 계세요" : "오늘도 고생많으셨어요";
  const today = now ? now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" }) : "";
  const clock = now ? now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "--:--:--";

  const remaining = tasks.filter(t => !t.completed);
  const done = tasks.filter(t => t.completed).length;
  const orderedTasks = tasks.toSorted((a, b) => Number(a.completed) - Number(b.completed) || taskStartTime(a).localeCompare(taskStartTime(b)));
  const nextTask = remaining.toSorted((a, b) => taskStartTime(a).localeCompare(taskStartTime(b)))[0];
  const completionRate = tasks.length ? (done / tasks.length) * 100 : 0;

  const toggleTask = (task: HomeCalendarTask) => setTaskCompleted(task.id, !task.completed);

  return {
    briefState, refresh, tasks, orderedTasks, totalPending,
    greeting, today, clock, remaining, done, nextTask, completionRate,
    savingTaskIds, saveError: error, toggleTask,
  };
}

/* 카드 1 — 디지털시계 + 올리비아 인사말 */
export function DailyBriefCard({ onOpenBriefing }: { onOpenBriefing?: () => void }) {
  const { briefState, refresh, totalPending, greeting, today, clock, remaining, tasks, nextTask, completionRate } = useDailyBrief();

  return (
    <section className="oa-daily-brief" aria-busy={briefState === "loading"}>
      <div className="oa-daily-brief__top">
        <div className="oa-daily-brief__identity">
          <span className="oa-daily-brief__bell"><Bell size={13} aria-hidden="true"/></span>
          <div>
            <div className="oa-daily-brief__eyebrow">OLIVIA DAILY BRIEF</div>
            <div className="oa-daily-brief__date">{today}</div>
          </div>
        </div>
        <div className="oa-daily-brief__actions">
          {briefState === "ready" && <span className="oa-daily-brief__state">{totalPending > 0 ? `대기 ${totalPending}건` : "방금 갱신"}</span>}
          {onOpenBriefing ? (
            <button type="button" className="oa-daily-brief__open" onClick={onOpenBriefing}>
              <Sparkles size={11} aria-hidden="true" /> 브리핑 보기
            </button>
          ) : null}
        </div>
      </div>

      <div className="oa-daily-brief__clock">{clock}</div>

      <div className="oa-daily-brief__message">
        {briefState === "loading" ? <><span className="oa-daily-brief__pulse"/> 운영 데이터를 불러오는 중입니다.</> : null}
        {briefState === "error" ? <><AlertCircle size={15} aria-hidden="true"/> 운영 데이터 연결에 실패했습니다.<button type="button" onClick={() => void refresh()}><RefreshCw size={12} aria-hidden="true"/>다시 불러오기</button></> : null}
        {briefState === "empty" ? <>{greeting}, 정연호 대표님. 오늘 등록된 일정이 없어요.</> : null}
        {briefState === "ready" ? <>{greeting}, 정연호 대표님. {remaining.length > 0 ? <>오늘 할일 <strong>{remaining.length}개</strong> 남았어요.</> : <>오늘 할일을 모두 완료했어요!</>}</> : null}
      </div>

      {briefState === "ready" && nextTask ? (
        <Link href="/calendar" className="oa-daily-brief__next">
          <Clock size={11} aria-hidden="true"/><span>다음</span>
          {nextTask.time && <time>{nextTask.time}</time>}
          <strong>{nextTask.title}</strong>
        </Link>
      ) : null}

      {briefState === "ready" && tasks.length > 0 ? (
        <div className="oa-daily-brief__progress" aria-hidden="true"><span style={{ transform: `scaleX(${completionRate / 100})` }}/></div>
      ) : null}
    </section>
  );
}

/* 카드 2 — 오늘 스케줄 체크리스트 */
export function TodayScheduleCard() {
  const { briefState, refresh, tasks, orderedTasks, done, completionRate, savingTaskIds, saveError, toggleTask } = useDailyBrief();

  return (
    <section className="oa-daily-brief oa-daily-brief--schedule" aria-busy={briefState === "loading"}>
      <div className="oa-daily-brief__schedule-head">
        <div>
          <span className="oa-daily-brief__schedule-icon"><CalendarCheck2 size={13} aria-hidden="true"/></span>
          <div>
            <div className="oa-daily-brief__eyebrow">TODAY SCHEDULE</div>
            <strong>오늘 스케줄</strong>
          </div>
        </div>
        {tasks.length > 0 ? <span>{done}/{tasks.length} 완료</span> : null}
      </div>

      {briefState === "loading" ? (
        <div className="oa-daily-brief__schedule-skeleton" aria-label="오늘 일정을 불러오는 중" role="status"><span/><span/><span/></div>
      ) : null}
      {briefState === "error" ? (
        <div className="oa-daily-brief__schedule-state is-error" role="status"><AlertCircle size={14} aria-hidden="true"/> 일정을 불러오지 못했습니다.<button type="button" onClick={() => void refresh()}>다시 시도</button></div>
      ) : null}
      {briefState !== "loading" && briefState !== "error" && tasks.length === 0 ? (
        <div className="oa-daily-brief__schedule-empty"><p>오늘 등록된 일정이 없습니다.</p><Link href="/calendar">캘린더에서 일정 추가</Link></div>
      ) : null}
      {briefState !== "loading" && briefState !== "error" && tasks.length > 0 ? (
        <ul className="oa-daily-brief__checklist" aria-label="오늘 스케줄 체크리스트">
          {orderedTasks.map((task) => {
            const saving = savingTaskIds.has(task.id);
            return (
              <li key={task.id} className={task.completed ? "is-completed" : undefined} aria-busy={saving}>
                <label>
                  <input type="checkbox" checked={task.completed} disabled={saving} onChange={() => void toggleTask(task)}/>
                  <span className="oa-daily-brief__checkbox" aria-hidden="true">{task.completed ? <Check size={11}/> : null}</span>
                  {task.time ? <time>{taskStartTime(task)}</time> : <time>종일</time>}
                  <strong>{task.title}</strong>
                  <small>{saving ? "저장 중" : task.completed ? "완료" : "예정"}</small>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}

      {saveError ? <p className="oa-daily-brief__save-error" role="alert"><AlertCircle size={11} aria-hidden="true"/>{saveError}</p> : null}

      {tasks.length > 0 ? (
        <div className="oa-daily-brief__schedule-footer">
          <div className="oa-daily-brief__schedule-progress" aria-hidden="true"><span style={{ transform: `scaleX(${completionRate / 100})` }}/></div>
          <Link href="/calendar">전체 일정 보기</Link>
        </div>
      ) : null}
    </section>
  );
}

/* 예전 이름으로도 계속 쓸 수 있게 — 브리핑 카드만 필요한 곳에서 기본 export로 사용 */
export default DailyBriefCard;
