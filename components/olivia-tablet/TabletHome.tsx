"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, Clock3, FileText, MessageCircleMore, RefreshCw } from "lucide-react";
import { AppIcon } from "@/components/AppIcon";
import { CalendarAppIcon } from "@/components/olivia-os/CalendarAppIcon";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import type { TabletAppId } from "@/lib/olivia/tablet/navigation";
import styles from "./OliviaTabletShell.module.css";

type HomeTask = { id: string; title: string; time?: string | null; location?: string | null };
type HomeTodo = { id: string; title: string; completed?: boolean };
type HomeDocument = { id: string; title?: string; type?: string; updatedAt?: string; updated_at?: string };
type HomeConti = { id: string; hospital_name?: string; specialty?: string; scene_count?: number; updated_at?: string };

type HomeData = {
  tasks: HomeTask[];
  todos: HomeTodo[];
  documents: HomeDocument[];
  contis: HomeConti[];
};

const EMPTY_HOME: HomeData = { tasks: [], todos: [], documents: [], contis: [] };

function seoulDate() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

async function safePayload(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || "데이터를 불러오지 못했습니다.");
  return payload;
}

function formatUpdated(value?: string) {
  if (!value) return "최근 업데이트";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "최근 업데이트";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function TabletHome({ onNavigate }: { onNavigate: (app: TabletAppId) => void }) {
  const activeWorkspace = useOliviaContextStore((state) => state.activeWorkspace);
  const currentClientName = useOliviaContextStore((state) => state.activeClientName);
  const isSending = useOliviaConversationStore((state) => state.isSending);
  const messages = useOliviaConversationStore((state) => state.messages);
  const [data, setData] = useState<HomeData>(EMPTY_HOME);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const results = await Promise.allSettled([
      safePayload(`/api/calendar?date=${seoulDate()}`),
      safePayload("/api/calendar/todos"),
      safePayload("/api/documents/search?limit=6"),
      safePayload("/api/conti/runs?list=1&limit=3"),
    ]);
    const successful = results.filter((result) => result.status === "fulfilled").length;
    setData({
      tasks: results[0].status === "fulfilled" ? results[0].value.tasks ?? [] : [],
      todos: results[1].status === "fulfilled" ? results[1].value.todos ?? [] : [],
      documents: results[2].status === "fulfilled" ? results[2].value.documents ?? [] : [],
      contis: results[3].status === "fulfilled" ? results[3].value.runs ?? [] : [],
    });
    if (!successful) setError("홈 데이터를 불러오지 못했습니다.");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("olivia-resource-updated", refresh);
    window.addEventListener("olivia-calendar-updated", refresh);
    return () => {
      window.removeEventListener("olivia-resource-updated", refresh);
      window.removeEventListener("olivia-calendar-updated", refresh);
    };
  }, [load]);

  const openTodos = useMemo(() => data.todos.filter((todo) => !todo.completed), [data.todos]);
  const currentContext = currentClientName || activeWorkspace;

  return (
    <div className={styles.homeScroll}>
      <section className={styles.homeHero}>
        <div>
          <p>OLIVIA · TOUCH WORKSPACE</p>
          <h1>오늘의 일을<br />한눈에 이어가세요.</h1>
          <span>{currentContext ? `현재 맥락 · ${currentContext}` : "현재 연결된 고객이나 작업이 없습니다."}</span>
        </div>
        <button type="button" className={styles.chatHeroAction} onClick={() => onNavigate("olivia-chat")}>
          <span><AppIcon name="olivia" size={46} /></span>
          <span><small>{isSending ? "Olivia가 작업 중입니다" : "Olivia 채팅"}</small><strong>대화로 업무 이어가기</strong></span>
          <ArrowUpRight size={20} strokeWidth={1.7} />
        </button>
      </section>

      {error ? (
        <div className={styles.homeError}><span>{error}</span><button type="button" onClick={() => void load()}><RefreshCw size={17} /> 다시 시도</button></div>
      ) : null}

      <section className={styles.homeGrid} aria-busy={loading}>
        <article className={`${styles.homeCard} ${styles.scheduleCard}`}>
          <header><span className={styles.cardIcon}><CalendarAppIcon /></span><div><small>오늘</small><h2>일정</h2></div><button type="button" onClick={() => onNavigate("calendar")}>전체보기 <ArrowUpRight size={15} /></button></header>
          <div className={styles.homeList}>
            {loading ? <p className={styles.homeEmpty}>일정을 확인하고 있습니다.</p> : data.tasks.length ? data.tasks.slice(0, 4).map((task) => (
              <button type="button" key={task.id} className={styles.homeListRow} onClick={() => onNavigate("calendar")}>
                <span className={styles.timePill}>{task.time?.slice(0, 5) || "미정"}</span>
                <span><strong>{task.title}</strong><small>{task.location || "장소 미정"}</small></span>
                <Clock3 size={16} />
              </button>
            )) : <p className={styles.homeEmpty}>오늘 등록된 일정이 없습니다.</p>}
          </div>
        </article>

        <article className={styles.homeCard}>
          <header><span className={styles.cardIcon}><CheckCircle2 /></span><div><small>FOCUS</small><h2>해야 할 일</h2></div><button type="button" onClick={() => onNavigate("calendar")}>열기 <ArrowUpRight size={15} /></button></header>
          <div className={styles.homeList}>
            {loading ? <p className={styles.homeEmpty}>할 일을 확인하고 있습니다.</p> : openTodos.length ? openTodos.slice(0, 4).map((todo) => (
              <button type="button" key={todo.id} className={styles.todoRow} onClick={() => onNavigate("calendar")}><i /> <span>{todo.title}</span></button>
            )) : <p className={styles.homeEmpty}>남아 있는 할 일이 없습니다.</p>}
          </div>
        </article>

        <article className={`${styles.homeCard} ${styles.documentsCard}`}>
          <header><span className={styles.cardIcon}><FileText /></span><div><small>RECENT</small><h2>최근 문서</h2></div><button type="button" onClick={() => onNavigate("documents")}>문서함 <ArrowUpRight size={15} /></button></header>
          <div className={styles.documentGrid}>
            {loading ? <p className={styles.homeEmpty}>문서를 확인하고 있습니다.</p> : data.documents.length ? data.documents.slice(0, 4).map((document) => (
              <button type="button" key={document.id} onClick={() => onNavigate("documents")}>
                <AppIcon name={document.type === "contract" ? "contract" : document.type === "quote" ? "quote" : "library"} size={34} />
                <span><strong>{document.title || "제목 없는 문서"}</strong><small>{formatUpdated(document.updatedAt || document.updated_at)}</small></span>
              </button>
            )) : <p className={styles.homeEmpty}>최근 문서가 없습니다.</p>}
          </div>
        </article>

        <article className={styles.homeCard}>
          <header><span className={styles.cardIcon}><AppIcon name="storyboard" size={25} /></span><div><small>FIELD</small><h2>최근 콘티</h2></div><button type="button" onClick={() => { window.location.href = "/conti"; }}>콘티 열기 <ArrowUpRight size={15} /></button></header>
          <div className={styles.homeList}>
            {loading ? <p className={styles.homeEmpty}>콘티를 확인하고 있습니다.</p> : data.contis.length ? data.contis.slice(0, 3).map((conti) => (
              <button type="button" key={conti.id} className={styles.contiRow} onClick={() => { window.location.href = `/conti?resourceId=${encodeURIComponent(conti.id)}`; }}>
                <span><strong>{conti.hospital_name || "연결되지 않은 콘티"}</strong><small>{conti.specialty || "진료과 미지정"} · {conti.scene_count ?? 0} Scene</small></span>
                <ArrowUpRight size={16} />
              </button>
            )) : <p className={styles.homeEmpty}>최근 콘티가 없습니다.</p>}
          </div>
        </article>
      </section>

      <button type="button" className={styles.homeChatStrip} onClick={() => onNavigate("olivia-chat")}>
        <MessageCircleMore size={20} /><span><strong>최근 대화 {messages.length ? `${messages.length}개 메시지` : "없음"}</strong><small>Olivia와 이어서 이야기하기</small></span><ArrowUpRight size={18} />
      </button>
    </div>
  );
}
