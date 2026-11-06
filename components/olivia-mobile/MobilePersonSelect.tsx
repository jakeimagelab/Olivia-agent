"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowLeft, CalendarClock, ChevronRight, Clipboard, Plus, Search, UserCheck } from "lucide-react";
import { defaultSeoulDeadlineInput, formatSeoulDeadline, formatSeoulDateTimeInput } from "@/lib/person-select/date";
import type { PersonSelectAccessMode, PersonSelectCustomerViewMode, PersonSelectProjectType } from "@/lib/person-select/types";
import { PERSON_SELECT_ACCESS_MODE_LABELS, PERSON_SELECT_CUSTOMER_VIEW_LABELS, PERSON_SELECT_PROJECT_TYPE_LABELS } from "@/lib/person-select/projectSettings";
import type { MobileOliviaTarget } from "@/lib/olivia/mobile/navigation";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import MobileBottomSheet from "./MobileBottomSheet";
import styles from "./OliviaMobileShell.module.css";

type EventRow = {
  id: string;
  title: string;
  slug: string;
  deadline_at: string;
  status: "draft" | "open" | "closed";
  people_count: number;
  submitted_count: number;
  project_type?: PersonSelectProjectType;
  access_mode?: PersonSelectAccessMode;
  customer_view_mode?: PersonSelectCustomerViewMode;
  shared_token?: string | null;
  shared_submitted_at?: string | null;
};

type Choice = {
  id: string;
  category_key: string;
  memo: string;
  person_select_images: { original_file_name: string; thumb_url: string } | null;
};

type Person = {
  id: string;
  display_name: string;
  group_label: string | null;
  submitted_at: string | null;
  status_label: string;
  latest_activity_at: string | null;
  choices: Choice[];
  representative_image?: { thumb_url: string; original_file_name: string } | null;
  order?: { total: number };
};

type SharedSelection = { submitted_at: string; items: Array<{ image_id: string; customer_rating: number | null; memo: string; image: { original_file_name: string; thumb_url: string } | null }> };
type DetailPayload = { event: EventRow & { client_id?: string | null }; people: Person[]; shared?: { image_count: number; selection: SharedSelection | null } | null };
type EventFilter = "all" | "open" | "urgent" | "closed";
type PeopleFilter = "all" | "submitted" | "pending";

function isUrgent(event: EventRow) {
  const remaining = new Date(event.deadline_at).getTime() - Date.now();
  return event.status === "open" && remaining >= 0 && remaining <= 3 * 24 * 60 * 60 * 1000;
}

function statusLabel(status: EventRow["status"]) {
  return status === "open" ? "진행 중" : status === "closed" ? "완료" : "준비 중";
}

function percentage(done: number, total: number) {
  return total > 0 ? Math.round(done / total * 100) : 0;
}

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || "사진선택 정보를 불러오지 못했어요.");
  return payload;
}

export default function MobilePersonSelect({ initialEventId = null, onEventChange, onRequestOlivia }: { initialEventId?: string | null; onEventChange?: (eventId: string | null) => void; onRequestOlivia: (target: MobileOliviaTarget) => void }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialEventId);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{ title: string; slug: string; deadline_at: string; project_type: PersonSelectProjectType; access_mode: PersonSelectAccessMode; customer_view_mode: PersonSelectCustomerViewMode }>({ title: "", slug: "", deadline_at: defaultSeoulDeadlineInput(), project_type: "general", access_mode: "individual", customer_view_mode: "classic" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadEvents = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const payload = await jsonRequest("/api/person-select");
      setEvents(Array.isArray(payload.events) ? payload.events : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "행사를 불러오지 못했어요.");
    } finally { setLoading(false); }
  }, []);

  const loadDetail = useCallback(async (eventId: string) => {
    setLoading(true); setError("");
    try {
      const payload = await jsonRequest(`/api/person-select/${encodeURIComponent(eventId)}`);
      setDetail({ event: payload.event, people: payload.people || [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "행사를 불러오지 못했어요.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadEvents(); }, [loadEvents]);
  useEffect(() => { setSelectedId(initialEventId); }, [initialEventId]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [loadDetail, selectedId]);
  useEffect(() => {
    const store = useOliviaContextStore.getState();
    store.clearWindowLink();
    store.setWorkspace("person-select", selectedId || undefined);
  }, [selectedId]);

  const filteredEvents = useMemo(() => events.filter((event) => {
    if (eventFilter === "open") return event.status === "open";
    if (eventFilter === "urgent") return isUrgent(event);
    if (eventFilter === "closed") return event.status === "closed";
    return true;
  }), [eventFilter, events]);

  const filteredPeople = useMemo(() => (detail?.people || []).filter((person) => {
    if (peopleFilter === "submitted" && !person.submitted_at) return false;
    if (peopleFilter === "pending" && person.submitted_at) return false;
    return !query.trim() || person.display_name.includes(query.trim());
  }), [detail?.people, peopleFilter, query]);

  const updateEvent = async (patch: Record<string, unknown>) => {
    if (!selectedId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await jsonRequest(`/api/person-select/${encodeURIComponent(selectedId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      await Promise.all([loadDetail(selectedId), loadEvents()]);
      setNotice("행사 설정을 저장했어요.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "저장하지 못했어요."); }
    finally { setBusy(false); }
  };

  const createEvent = async () => {
    if (!form.title.trim() || !form.slug.trim()) return setError("행사명과 공개 주소를 입력해 주세요.");
    setBusy(true); setError("");
    try {
      const payload = await jsonRequest("/api/person-select", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setCreating(false);
      await loadEvents();
      setSelectedId(payload.event.id);
      onEventChange?.(payload.event.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "행사를 만들지 못했어요."); }
    finally { setBusy(false); }
  };

  if (selectedId) {
    const shared = detail?.event.access_mode === "project_shared";
    const submitted = shared ? (detail?.shared?.selection ? 1 : 0) : detail?.people.filter((person) => person.submitted_at).length ?? 0;
    const total = shared ? 1 : detail?.people.length ?? 0;
    const progress = percentage(submitted, total);
    const sharedPath = detail?.event.shared_token ? `/pick/shared/${detail.event.shared_token}` : "";
    const publicPath = shared ? sharedPath : `/pick/${detail?.event.slug ?? ""}`;
    return <section className={`${styles.screenWithHeader} ${styles.mobilePersonSelect}`} aria-label="사진선택 행사 관리자" data-mobile-swipe-lock>
      <header className={styles.mobileSubHeader}>
        <button type="button" onClick={() => { setSelectedId(null); setDetail(null); setSelectedPerson(null); setNotice(""); onEventChange?.(null); }} aria-label="행사 목록"><ArrowLeft size={21} /></button>
        <div><small>사진선택</small><h1>{detail?.event.title || "행사"}</h1></div>
        <button type="button" onClick={() => detail && onRequestOlivia({ source: "person-select", title: detail.event.title, eventId: detail.event.id })} aria-label="Olivia에게 행사 요청">Olivia</button>
      </header>
      <div className={styles.mobilePersonSelectBody}>
        {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void loadDetail(selectedId)}>다시 시도</button></div> : null}
        {loading || !detail ? <div className={styles.emptyState}>행사를 불러오고 있어요...</div> : <>
          <section className={styles.mobileEventSummary}>
            <div className={styles.mobileEventStats}>{shared ? <><span><strong>{detail.shared?.image_count ?? 0}</strong><small>등록 사진</small></span><span><strong>{detail.shared?.selection?.items.length ?? 0}</strong><small>고객 셀렉</small></span><span><strong>{submitted ? "완료" : "대기"}</strong><small>제출</small></span></> : <><span><strong>{total}</strong><small>전체</small></span><span><strong>{submitted}</strong><small>제출</small></span><span><strong>{total - submitted}</strong><small>미제출</small></span></>}</div>
            <div className={styles.mobileProgressLabel}><strong>{shared ? (submitted ? "공동 셀렉 제출 완료" : "공동 셀렉 제출 전") : `제출률 ${progress}%`}</strong><span>{shared ? PERSON_SELECT_CUSTOMER_VIEW_LABELS[detail.event.customer_view_mode ?? "classic"] : `${submitted} / ${total}명`}</span></div>
            <div className={styles.mobileProgressBar}><i style={{ width: `${progress}%` }} /></div>
            <div className={styles.mobileEventDeadline}><CalendarClock size={18} /><span><small>마감</small><strong>{formatSeoulDeadline(detail.event.deadline_at)}</strong></span></div>
            <div className={styles.mobileEventLink}><span><small>선택 링크</small><strong>{publicPath || "공용 링크 준비 중"}</strong></span><button type="button" disabled={!publicPath} onClick={async () => { await navigator.clipboard.writeText(`${location.origin}${publicPath}`); setNotice("선택 링크를 복사했어요."); }}><Clipboard size={16} />복사</button></div>
          </section>

          <section className={styles.mobileEventControls}>
            <label><span>마감 시간</span><input type="datetime-local" defaultValue={formatSeoulDateTimeInput(detail.event.deadline_at)} onBlur={(event) => { if (event.target.value && event.target.value !== formatSeoulDateTimeInput(detail.event.deadline_at)) void updateEvent({ deadline_at: event.target.value }); }} /></label>
            <div><button type="button" disabled={busy || detail.event.status === "open"} onClick={() => void updateEvent({ status: "open" })}>행사 열기</button><button type="button" disabled={busy || detail.event.status === "closed"} onClick={() => { if (window.confirm("행사를 종료할까요? 고객은 더 이상 제출할 수 없습니다.")) void updateEvent({ status: "closed" }); }}>행사 종료</button></div>
          </section>

          {!shared ? <><div className={styles.mobilePersonToolbar}>
            <div className={styles.filterChips}>{(["all", "submitted", "pending"] as const).map((filter) => <button type="button" key={filter} className={peopleFilter === filter ? styles.filterActive : undefined} onClick={() => setPeopleFilter(filter)}>{filter === "all" ? "전체" : filter === "submitted" ? "제출 완료" : "미제출"}</button>)}</div>
            <label className={styles.mobileCompactSearch}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 검색" /></label>
          </div>
          <div className={styles.mobilePeopleList}>{filteredPeople.map((person) => <button type="button" key={person.id} onClick={() => setSelectedPerson(person)}>
            <span className={styles.mobilePersonThumb}>{person.choices[0]?.person_select_images?.thumb_url || person.representative_image?.thumb_url ? <Image src={person.choices[0]?.person_select_images?.thumb_url || person.representative_image?.thumb_url || ""} alt="" width={52} height={52} unoptimized /> : <UserCheck size={20} />}</span>
            <span><strong>{person.display_name}</strong><small>{person.group_label || ""}{person.choices.length ? `${person.group_label ? " · " : ""}${person.choices.length}장 선택` : " · 선택 없음"}</small></span>
            <em data-done={Boolean(person.submitted_at)}>{person.submitted_at ? "제출 완료" : person.status_label}</em>
            <ChevronRight size={17} />
          </button>)}</div>
          {!filteredPeople.length ? <div className={styles.emptyState}>해당하는 참가자가 없어요.</div> : null}</> : <div className={styles.mobileChoiceGrid}>{detail.shared?.selection?.items.map((item) => <article key={item.image_id}>{item.image?.thumb_url ? <Image src={item.image.thumb_url} alt={item.image.original_file_name} width={640} height={420} unoptimized /> : null}<strong>{item.image?.original_file_name || "사진"}</strong><small>{item.customer_rating ? `${item.customer_rating}점` : "선택"}{item.memo ? ` · ${item.memo}` : ""}</small></article>)}</div>}
          {notice ? <p className={styles.mobileNotice}>{notice}</p> : null}
        </>}
      </div>
      <MobileBottomSheet open={Boolean(selectedPerson)} title={selectedPerson?.display_name || "선택 결과"} description={selectedPerson ? `${selectedPerson.submitted_at ? "제출 완료" : selectedPerson.status_label} · 선택 ${selectedPerson.choices.length}장` : undefined} onClose={() => setSelectedPerson(null)}>
        {selectedPerson ? <>
          <div className={styles.mobileChoiceGrid}>{selectedPerson.choices.map((choice) => <article key={choice.id}>{choice.person_select_images?.thumb_url ? <Image src={choice.person_select_images.thumb_url} alt={choice.person_select_images.original_file_name} width={640} height={420} unoptimized /> : null}<strong>{choice.person_select_images?.original_file_name || "사진"}</strong>{choice.memo ? <small>{choice.memo}</small> : null}</article>)}</div>
          {!selectedPerson.choices.length ? <div className={styles.emptyState}>아직 고른 사진이 없어요.</div> : null}
        </> : null}
      </MobileBottomSheet>
    </section>;
  }

  return <section className={`${styles.screenWithHeader} ${styles.mobilePersonSelect}`} aria-label="사진선택 행사 목록" data-mobile-swipe-lock>
    <header className={styles.mobilePageHeading}><div><small>관리</small><h1>사진선택</h1></div><button type="button" onClick={() => setCreating(true)} aria-label="새 행사"><Plus size={21} /></button></header>
    <div className={styles.mobilePersonSelectBody}>
      <div className={styles.filterChips}>{(["all", "open", "urgent", "closed"] as const).map((filter) => <button type="button" key={filter} className={eventFilter === filter ? styles.filterActive : undefined} onClick={() => setEventFilter(filter)}>{filter === "all" ? "전체" : filter === "open" ? "진행 중" : filter === "urgent" ? "마감 임박" : "완료"}</button>)}</div>
      {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void loadEvents()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>행사를 불러오고 있어요...</div> : <div className={styles.mobileEventList}>{filteredEvents.map((event) => {
        const shared = event.access_mode === "project_shared";
        const progress = shared ? (event.shared_submitted_at ? 100 : 0) : percentage(event.submitted_count, event.people_count);
        return <button type="button" key={event.id} onClick={() => { setSelectedId(event.id); onEventChange?.(event.id); }}>
          <span className={styles.mobileEventCardTop}><strong>{event.title}</strong><em data-status={event.status}>{isUrgent(event) ? "마감 임박" : statusLabel(event.status)}</em></span>
          <span className={styles.mobileEventMeta}>{shared ? "프로젝트 공용 셀렉" : `${event.people_count}명`} · 마감 {formatSeoulDeadline(event.deadline_at)}</span>
          <span className={styles.mobileProgressLabel}><b>{shared ? (event.shared_submitted_at ? "공동 셀렉 제출 완료" : "공동 셀렉 제출 전") : `${event.submitted_count} / ${event.people_count} 제출`}</b><small>{progress}%</small></span>
          <span className={styles.mobileProgressBar}><i style={{ width: `${progress}%` }} /></span>
        </button>;
      })}</div>}
      {!loading && !error && !filteredEvents.length ? <div className={styles.emptyState}>해당하는 행사가 없어요.</div> : null}
    </div>
    <MobileBottomSheet open={creating} title="새 사진선택 프로젝트" onClose={() => setCreating(false)}>
      <label className={styles.mobileSheetField}><span>프로젝트명</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="예: 건축사협회 프로필 촬영" /></label>
      <label className={styles.mobileSheetField}><span>공개 주소</span><input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="seogongye-2026" /></label>
      <label className={styles.mobileSheetField}><span>마감</span><input type="datetime-local" value={form.deadline_at} onChange={(event) => setForm({ ...form, deadline_at: event.target.value })} /></label>
      <label className={styles.mobileSheetField}><span>프로젝트 유형</span><select value={form.project_type} onChange={(event) => setForm({ ...form, project_type: event.target.value as PersonSelectProjectType })}>{Object.entries(PERSON_SELECT_PROJECT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className={styles.mobileSheetField}><span>접근 방식</span><select value={form.access_mode} onChange={(event) => setForm({ ...form, access_mode: event.target.value as PersonSelectAccessMode })}>{Object.entries(PERSON_SELECT_ACCESS_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className={styles.mobileSheetField}><span>고객 화면</span><select value={form.customer_view_mode} onChange={(event) => setForm({ ...form, customer_view_mode: event.target.value as PersonSelectCustomerViewMode })}>{Object.entries(PERSON_SELECT_CUSTOMER_VIEW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {error ? <p className={styles.mobileFormError}>{error}</p> : null}
      <button type="button" className={styles.mobilePrimaryAction} disabled={busy} onClick={() => void createEvent()}>{busy ? "만드는 중" : "프로젝트 만들기"}</button>
    </MobileBottomSheet>
  </section>;
}
