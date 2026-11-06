"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, Plus, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDesktopWindowRoute } from "@/lib/desktopWindowContext";
import { categoriesForProjectType, DEFAULT_PERSON_SELECT_RETOUCH_OPTIONS, type PersonSelectAccessMode, type PersonSelectCustomerViewMode, type PersonSelectProjectType } from "@/lib/person-select/types";
import { PERSON_SELECT_ACCESS_MODE_LABELS, PERSON_SELECT_CUSTOMER_VIEW_LABELS, PERSON_SELECT_PROJECT_TYPE_LABELS } from "@/lib/person-select/projectSettings";
import { defaultSeoulDeadlineInput, formatSeoulDeadline } from "@/lib/person-select/date";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

type EventRow = { id: string; title: string; slug: string; deadline_at: string; status: string; people_count: number; submitted_count: number; project_type?: PersonSelectProjectType; access_mode?: PersonSelectAccessMode; customer_view_mode?: PersonSelectCustomerViewMode };

export default function PersonSelectPage() {
  const router = useRouter(); const windowRoute = useDesktopWindowRoute();
  const [events, setEvents] = useState<EventRow[]>([]); const [loading, setLoading] = useState(true); const [showForm, setShowForm] = useState(false); const [error, setError] = useState("");
  const [form, setForm] = useState(() => ({ title: "", slug: "", deadline_at: defaultSeoulDeadlineInput(), project_type: "general" as PersonSelectProjectType, access_mode: "individual" as PersonSelectAccessMode, customer_view_mode: "classic" as PersonSelectCustomerViewMode }));
  const navigate = (href: string) => windowRoute.navigate ? windowRoute.navigate(href, "사진선택") : router.push(href);
  const load = () => fetch("/api/person-select").then((r) => r.json()).then((data) => { if (data.ok) setEvents(data.events); else setError(data.error); }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    emitShellSelection({
      sourceAppId: "person-select",
      sourceWindowId: "person-select",
      itemId: "event-list",
      title: "프로젝트 목록",
      subtitle: "사진선택 프로젝트",
      next: "프로젝트를 고르면 진행 현황과 사진을 확인할 수 있습니다.",
      context: { contextScope: "none", routeHref: "/person-select", documentTitle: "프로젝트 목록" },
    });
  }, []);
  async function create() {
    setError(""); const response = await fetch("/api/person-select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, categories: categoriesForProjectType(form.project_type), retouch_options: DEFAULT_PERSON_SELECT_RETOUCH_OPTIONS }) }); const data = await response.json();
    if (!response.ok) return setError(data.error || "프로젝트를 만들지 못했어요."); navigate(`/person-select/${data.event.id}`);
  }
  return <main className={styles.shell}>
    <header className={styles.header}><div className={styles.headerLeft}><div className={styles.emptyIcon} style={{ margin: 0, width: 44, height: 44 }}><UserCheck size={21} /></div><div><h1>사진선택</h1><p>개인별 또는 프로젝트 공용 사진선택을 관리합니다.</p></div></div><button className={showForm ? styles.secondary : styles.primary} onClick={() => setShowForm((value) => !value)}><Plus size={16} strokeWidth={2} />{showForm ? "입력 닫기" : "새 프로젝트"}</button></header>
    <section className={styles.body}>
      {showForm ? <section className={styles.panel} style={{ padding: 22, marginBottom: 22 }}><div className={styles.formGrid}><div className={`${styles.field} ${styles.fieldFull}`}><label>프로젝트명</label><input className={styles.input} value={form.title} placeholder="예: 건축사협회 프로필 사진선택" onChange={(e) => setForm({ ...form, title: e.target.value })} /></div><div className={styles.field}><label>공개 주소</label><input className={styles.input} value={form.slug} placeholder="예: architect-2026 (영문·숫자·-)" onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div><div className={styles.field}><label>마감일 (KST)</label><input className={styles.input} type="datetime-local" value={form.deadline_at} onChange={(e) => setForm({ ...form, deadline_at: e.target.value })} /></div><div className={styles.field}><label>프로젝트 유형</label><select className={styles.select} value={form.project_type} onChange={(e) => setForm({ ...form, project_type: e.target.value as PersonSelectProjectType })}>{Object.entries(PERSON_SELECT_PROJECT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className={styles.field}><label>접근 방식</label><select className={styles.select} value={form.access_mode} onChange={(e) => setForm({ ...form, access_mode: e.target.value as PersonSelectAccessMode })}>{Object.entries(PERSON_SELECT_ACCESS_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className={styles.field}><label>고객 화면 방식</label><select className={styles.select} value={form.customer_view_mode} onChange={(e) => setForm({ ...form, customer_view_mode: e.target.value as PersonSelectCustomerViewMode })}>{Object.entries(PERSON_SELECT_CUSTOMER_VIEW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className={`${styles.field} ${styles.fieldFull}`}><label>추천 사진 항목</label><div className={styles.notice}>{categoriesForProjectType(form.project_type).map((item) => `${item.label} ${item.pick}장`).join(" / ")}<br />생성한 뒤 항목명과 장수를 프로젝트별로 바꿀 수 있습니다. 상품과 추가 보정은 새 프로젝트에 자동 적용되지 않습니다.</div></div></div>{error ? <div className={styles.warning}>{error}</div> : null}<div className={styles.formActions}><button className={styles.primary} disabled={!form.title.trim() || !form.slug.trim()} onClick={create}>프로젝트 만들기</button></div></section> : null}
      {loading ? <div className={styles.loading}>프로젝트를 불러오는 중이에요</div> : events.length === 0 ? <div className={styles.empty}><div><div className={styles.emptyIcon}><UserCheck /></div><h2>등록된 프로젝트가 없어요.</h2><p>새 프로젝트를 만들고 사진을 올려주세요.</p></div></div> : <div className={styles.eventList}>{events.map((event) => { const shared = event.access_mode === "project_shared"; return <button key={event.id} className={styles.eventRow} onClick={() => navigate(`/person-select/${event.id}`)}><div><strong>{event.title}</strong><small>{shared ? PERSON_SELECT_ACCESS_MODE_LABELS.project_shared : PERSON_SELECT_ACCESS_MODE_LABELS.individual} · {PERSON_SELECT_CUSTOMER_VIEW_LABELS[event.customer_view_mode ?? "classic"]}</small></div><div><small>{shared ? "공유" : "사람"}</small><strong>{shared ? "프로젝트" : `${event.people_count}명`}</strong></div><div><small>제출 완료</small><strong>{shared ? (event.submitted_count ? "제출" : "미제출") : `${event.submitted_count} / ${event.people_count}`}</strong></div><div><small><CalendarDays size={13} /> 마감</small><strong>{formatSeoulDeadline(event.deadline_at)}</strong></div><span className={`${styles.status} ${event.status === "open" ? "" : styles.statusIdle}`}>{event.status === "open" ? "열림" : event.status === "closed" ? "마감" : "준비 중"}</span><ChevronRight size={17} /></button>; })}</div>}
    </section>
  </main>;
}
