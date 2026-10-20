"use client";

import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import styles from "./WorkflowCaseHome.module.css";

type FilterKey = "all" | "mine" | "customer" | "week" | "stalled";
type CaseRow = {
  id: string; clientId: string | null; clientName: string; projectName: string; shootDate: string | null;
  updatedAt: string; waitingDays: number; customerWaiting: boolean; thisWeekShoot: boolean;
  progress: { done: number; total: number; percent: number };
  nextCheck: { key: string; label: string; actor: "auto" | "user"; nextActionLabel: string; actionLabel: string } | null;
  photoSummary: { backedUp: number; classified: number; unclassified: number; error: string | null } | null;
};

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "전체" }, { key: "mine", label: "내 확인 필요" }, { key: "customer", label: "고객 대기" },
  { key: "week", label: "이번 주 촬영" }, { key: "stalled", label: "멈춘 지 7일+" },
];

function shootLabel(value: string | null) {
  if (!value) return "촬영일 미정";
  const date = new Date(`${value.slice(0, 10)}T00:00:00+09:00`);
  return Number.isFinite(date.getTime()) ? `촬영 ${date.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul" })}` : "촬영일 미정";
}

export default function WorkflowCaseHome({ onOpen }: { onOpen: (clientId: string, workflowRunId: string) => void }) {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/workflow-runs/overview", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "촬영 건을 불러오지 못했습니다.");
        setRows(payload.cases ?? []);
        setWarning(payload.warning || "");
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "촬영 건을 불러오지 못했습니다."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const visible = useMemo(() => rows.filter((row) => {
    if (filter === "mine") return row.nextCheck?.actor === "user";
    if (filter === "customer") return row.customerWaiting;
    if (filter === "week") return row.thisWeekShoot;
    if (filter === "stalled") return row.waitingDays >= 7;
    return true;
  }), [filter, rows]);
  const attention = useMemo(() => rows.filter((row) => row.nextCheck?.actor === "user").slice(0, 8), [rows]);

  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <header className={styles.heading}>
          <div><h1>진행 중인 촬영 건</h1><p>한 줄이 한 촬영입니다. 단계 대신 지금 끝난 일과 다음 할 일을 봅니다.</p></div>
        </header>
        <nav className={styles.filters} aria-label="촬영 건 거르개">
          {FILTERS.map((item) => <button key={item.key} type="button" className={`${styles.filter} ${filter === item.key ? styles.filterActive : ""}`} onClick={() => setFilter(item.key)}>{item.label}</button>)}
        </nav>
        {warning ? <div className={styles.warning}><AlertTriangle size={16} />{warning}</div> : null}
        {loading ? <div className={styles.loading}>촬영 건을 불러오는 중이에요</div> : error ? <div className={styles.warning}><AlertTriangle size={16} />{error}</div> : null}
        {!loading && !error && visible.length === 0 ? <div className={styles.empty}><ClipboardCheck size={28} /><strong>이 조건에 맞는 촬영 건이 없습니다.</strong><span>다른 거르개를 선택해 주세요.</span></div> : null}
        <section className={styles.list} aria-label="촬영 건 목록">
          {visible.map((row) => (
            <article className={styles.row} key={row.id}>
              <div className={styles.identity}><strong>{row.clientName}</strong><span>{row.projectName} · {shootLabel(row.shootDate)}</span></div>
              <div className={styles.next}>
                <b>{row.nextCheck?.nextActionLabel || "촬영 건을 모두 마쳤습니다"}{row.nextCheck?.actor === "user" ? <em className={styles.turn}>내 차례</em> : null}</b>
                <small>{row.customerWaiting ? `고객 대기 ${row.waitingDays}일` : row.waitingDays >= 7 ? `${row.waitingDays}일 동안 변경 없음` : `최근 변경 ${row.waitingDays}일 전`}</small>
              </div>
              <div>
                <div className={styles.progressLine}><span>끝낸 것</span><strong>{row.progress.done} / {row.progress.total}</strong></div>
                <div className={styles.progressTrack}><span className={styles.progressFill} style={{ width: `${row.progress.percent}%` }} /></div>
              </div>
              <button className={styles.open} type="button" onClick={() => onOpen(row.clientId || "_by-workflow", row.id)}>열기 <ArrowRight size={15} /></button>
            </article>
          ))}
        </section>
      </main>
      <aside className={styles.rail}>
        <div className={styles.railCard}>
          <h2>내가 눌러야 넘어가는 것</h2><p>직접 확인할 일만 건당 하나씩 모았습니다.</p>
          <div className={styles.railItems}>
            {attention.length ? attention.map((row) => (
              <button key={row.id} type="button" className={styles.railItem} onClick={() => onOpen(row.clientId || "_by-workflow", row.id)}>
                {row.nextCheck?.key === "shot" ? <CalendarDays size={17} /> : row.waitingDays >= 7 ? <Clock3 size={17} /> : <CheckCircle2 size={17} />}
                <span><strong>{row.clientName} · {row.nextCheck?.label}</strong><span>{row.nextCheck?.key === "sort_approved" && row.photoSummary ? `${row.photoSummary.classified.toLocaleString()}장 분류됨 · ${row.photoSummary.unclassified.toLocaleString()}장 못 함` : row.nextCheck?.nextActionLabel}</span></span>
              </button>
            )) : <div className={styles.empty}><CheckCircle2 size={24} /><strong>지금 확인할 일이 없습니다.</strong></div>}
          </div>
        </div>
      </aside>
    </div>
  );
}
