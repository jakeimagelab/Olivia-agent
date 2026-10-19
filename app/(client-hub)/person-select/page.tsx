"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, Plus, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDesktopWindowRoute } from "@/lib/desktopWindowContext";
import { DEFAULT_PERSON_SELECT_CATEGORIES, DEFAULT_PERSON_SELECT_RETOUCH_OPTIONS } from "@/lib/person-select/types";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

type EventRow = { id: string; title: string; slug: string; deadline_at: string; status: string; people_count: number; submitted_count: number };

export default function PersonSelectPage() {
  const router = useRouter(); const windowRoute = useDesktopWindowRoute();
  const [events, setEvents] = useState<EventRow[]>([]); const [loading, setLoading] = useState(true); const [showForm, setShowForm] = useState(false); const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "서공예 졸업앨범 · 선생님 사진", slug: "sgy-2026-teachers", deadline_at: "" });
  const navigate = (href: string) => windowRoute.navigate ? windowRoute.navigate(href, "개인별 사진 셀렉") : router.push(href);
  const load = () => fetch("/api/person-select").then((r) => r.json()).then((data) => { if (data.ok) setEvents(data.events); else setError(data.error); }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  async function create() {
    setError(""); const response = await fetch("/api/person-select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, categories: DEFAULT_PERSON_SELECT_CATEGORIES, retouch_options: DEFAULT_PERSON_SELECT_RETOUCH_OPTIONS }) }); const data = await response.json();
    if (!response.ok) return setError(data.error || "행사를 만들지 못했어요."); navigate(`/person-select/${data.event.id}`);
  }
  return <main className={styles.shell}>
    <header className={styles.header}><div className={styles.headerLeft}><div className={styles.emptyIcon} style={{ margin: 0, width: 44, height: 44 }}><UserCheck size={21} /></div><div><h1>개인별 사진 셀렉</h1><p>행사별 사진 선택과 보정 요청을 관리합니다.</p></div></div><button className={styles.primary} onClick={() => setShowForm((value) => !value)}><Plus size={16} style={{ verticalAlign: -3, marginRight: 6 }} />새 행사</button></header>
    <section className={styles.body}>
      {showForm ? <section className={styles.panel} style={{ padding: 22, marginBottom: 22 }}><div className={styles.formGrid}><div className={`${styles.field} ${styles.fieldFull}`}><label>행사명</label><input className={styles.input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div><div className={styles.field}><label>공개 주소</label><input className={styles.input} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div><div className={styles.field}><label>마감일</label><input className={styles.input} type="datetime-local" value={form.deadline_at} onChange={(e) => setForm({ ...form, deadline_at: e.target.value })} /></div><div className={`${styles.field} ${styles.fieldFull}`}><label>사진 항목 · 보정 체크리스트</label><div className={styles.notice}>기본 항목: {DEFAULT_PERSON_SELECT_CATEGORIES.map((item) => item.label).join(" / ")}<br />기본 보정: {DEFAULT_PERSON_SELECT_RETOUCH_OPTIONS.map((item) => item.label).join(" / ")}</div></div></div>{error ? <div className={styles.warning}>{error}</div> : null}<div className={styles.formActions}><button className={styles.primary} onClick={create}>행사 만들기</button></div></section> : null}
      {loading ? <div className={styles.loading}>행사를 불러오는 중이에요</div> : events.length === 0 ? <div className={styles.empty}><div><div className={styles.emptyIcon}><UserCheck /></div><h2>등록된 행사가 없어요.</h2><p>새 행사를 만들고 사진을 올려주세요.</p></div></div> : <div className={styles.eventList}>{events.map((event) => <button key={event.id} className={styles.eventRow} onClick={() => navigate(`/person-select/${event.id}`)}><div><strong>{event.title}</strong><small>/pick/{event.slug}</small></div><div><small>사람</small><strong>{event.people_count}명</strong></div><div><small>제출 완료</small><strong>{event.submitted_count} / {event.people_count}</strong></div><div><small><CalendarDays size={13} /> 마감</small><strong>{new Date(event.deadline_at).toLocaleDateString("ko-KR")}</strong></div><span className={styles.status}>{event.status}</span><ChevronRight size={17} /></button>)}</div>}
    </section>
  </main>;
}
