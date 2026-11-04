"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowLeft, CalendarClock, ChevronRight, Clipboard, Plus, Search, UserCheck, X } from "lucide-react";
import { defaultSeoulDeadlineInput, formatSeoulDeadline, formatSeoulDateTimeInput } from "@/lib/person-select/date";
import { DEFAULT_PERSON_SELECT_CATEGORIES, DEFAULT_PERSON_SELECT_RETOUCH_OPTIONS } from "@/lib/person-select/types";
import type { MobileOliviaTarget } from "@/lib/olivia/mobile/navigation";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import styles from "./OliviaMobileShell.module.css";

type EventRow = {
  id: string;
  title: string;
  slug: string;
  deadline_at: string;
  status: "draft" | "open" | "closed";
  people_count: number;
  submitted_count: number;
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

type DetailPayload = { event: EventRow & { client_id?: string | null }; people: Person[] };
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
  const [form, setForm] = useState({ title: "", slug: "", deadline_at: defaultSeoulDeadlineInput() });
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
        body: JSON.stringify({ ...form, categories: DEFAULT_PERSON_SELECT_CATEGORIES, retouch_options: DEFAULT_PERSON_SELECT_RETOUCH_OPTIONS }),
      });
      setCreating(false);
      await loadEvents();
      setSelectedId(payload.event.id);
      onEventChange?.(payload.event.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "행사를 만들지 못했어요."); }
    finally { setBusy(false); }
  };

  if (selectedId) {
    const submitted = detail?.people.filter((person) => person.submitted_at).length ?? 0;
    const total = detail?.people.length ?? 0;
    const progress = percentage(submitted, total);
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
            <div className={styles.mobileEventStats}><span><strong>{total}</strong><small>전체</small></span><span><strong>{submitted}</strong><small>제출</small></span><span><strong>{total - submitted}</strong><small>미제출</small></span></div>
            <div className={styles.mobileProgressLabel}><strong>제출률 {progress}%</strong><span>{submitted} / {total}명</span></div>
            <div className={styles.mobileProgressBar}><i style={{ width: `${progress}%` }} /></div>
            <div className={styles.mobileEventDeadline}><CalendarClock size={18} /><span><small>마감</small><strong>{formatSeoulDeadline(detail.event.deadline_at)}</strong></span></div>
            <div className={styles.mobileEventLink}><span><small>선택 링크</small><strong>/pick/{detail.event.slug}</strong></span><button type="button" onClick={async () => { await navigator.clipboard.writeText(`${location.origin}/pick/${detail.event.slug}`); setNotice("선택 링크를 복사했어요."); }}><Clipboard size={16} />복사</button></div>
          </section>

          <section className={styles.mobileEventControls}>
            <label><span>마감 시간</span><input type="datetime-local" defaultValue={formatSeoulDateTimeInput(detail.event.deadline_at)} onBlur={(event) => { if (event.target.value && event.target.value !== formatSeoulDateTimeInput(detail.event.deadline_at)) void updateEvent({ deadline_at: event.target.value }); }} /></label>
            <div><button type="button" disabled={busy || detail.event.status === "open"} onClick={() => void updateEvent({ status: "open" })}>행사 열기</button><button type="button" disabled={busy || detail.event.status === "closed"} onClick={() => { if (window.confirm("행사를 종료할까요? 고객은 더 이상 제출할 수 없습니다.")) void updateEvent({ status: "closed" }); }}>행사 종료</button></div>
          </section>

          <div className={styles.mobilePersonToolbar}>
            <div className={styles.filterChips}>{(["all", "submitted", "pending"] as const).map((filter) => <button type="button" key={filter} className={peopleFilter === filter ? styles.filterActive : undefined} onClick={() => setPeopleFilter(filter)}>{filter === "all" ? "전체" : filter === "submitted" ? "제출 완료" : "미제출"}</button>)}</div>
            <label className={styles.mobileCompactSearch}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 검색" /></label>
          </div>
          <div className={styles.mobilePeopleList}>{filteredPeople.map((person) => <button type="button" key={person.id} onClick={() => setSelectedPerson(person)}>
            <span className={styles.mobilePersonThumb}>{person.choices[0]?.person_select_images?.thumb_url || person.representative_image?.thumb_url ? <Image src={person.choices[0]?.person_select_images?.thumb_url || person.representative_image?.thumb_url || ""} alt="" width={52} height={52} unoptimized /> : <UserCheck size={20} />}</span>
            <span><strong>{person.display_name}</strong><small>{person.group_label || ""}{person.choices.length ? `${person.group_label ? " · " : ""}${person.choices.length}장 선택` : " · 선택 없음"}</small></span>
            <em data-done={Boolean(person.submitted_at)}>{person.submitted_at ? "제출 완료" : person.status_label}</em>
            <ChevronRight size={17} />
          </button>)}</div>
          {!filteredPeople.length ? <div className={styles.emptyState}>해당하는 참가자가 없어요.</div> : null}
          {notice ? <p className={styles.mobileNotice}>{notice}</p> : null}
        </>}
      </div>
      {selectedPerson ? <div className={styles.mobileSheetBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPerson(null); }}>
        <section className={styles.mobileBottomSheet} role="dialog" aria-modal="true" aria-label={`${selectedPerson.display_name} 선택 결과`}>
          <div className={styles.mobileSheetHandle} />
          <button type="button" className={styles.mobileSheetClose} onClick={() => setSelectedPerson(null)} aria-label="닫기"><X size={20} /></button>
          <h2>{selectedPerson.display_name}</h2><p>{selectedPerson.submitted_at ? "제출 완료" : selectedPerson.status_label} · 선택 {selectedPerson.choices.length}장</p>
          <div className={styles.mobileChoiceGrid}>{selectedPerson.choices.map((choice) => <article key={choice.id}>{choice.person_select_images?.thumb_url ? <Image src={choice.person_select_images.thumb_url} alt={choice.person_select_images.original_file_name} width={640} height={420} unoptimized /> : null}<strong>{choice.person_select_images?.original_file_name || "사진"}</strong>{choice.memo ? <small>{choice.memo}</small> : null}</article>)}</div>
          {!selectedPerson.choices.length ? <div className={styles.emptyState}>아직 고른 사진이 없어요.</div> : null}
        </section>
      </div> : null}
    </section>;
  }

  return <section className={`${styles.screenWithHeader} ${styles.mobilePersonSelect}`} aria-label="사진선택 행사 목록" data-mobile-swipe-lock>
    <header className={styles.mobilePageHeading}><div><small>관리</small><h1>사진선택</h1></div><button type="button" onClick={() => setCreating(true)} aria-label="새 행사"><Plus size={21} /></button></header>
    <div className={styles.mobilePersonSelectBody}>
      <div className={styles.filterChips}>{(["all", "open", "urgent", "closed"] as const).map((filter) => <button type="button" key={filter} className={eventFilter === filter ? styles.filterActive : undefined} onClick={() => setEventFilter(filter)}>{filter === "all" ? "전체" : filter === "open" ? "진행 중" : filter === "urgent" ? "마감 임박" : "완료"}</button>)}</div>
      {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void loadEvents()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>행사를 불러오고 있어요...</div> : <div className={styles.mobileEventList}>{filteredEvents.map((event) => {
        const progress = percentage(event.submitted_count, event.people_count);
        return <button type="button" key={event.id} onClick={() => { setSelectedId(event.id); onEventChange?.(event.id); }}>
          <span className={styles.mobileEventCardTop}><strong>{event.title}</strong><em data-status={event.status}>{isUrgent(event) ? "마감 임박" : statusLabel(event.status)}</em></span>
          <span className={styles.mobileEventMeta}>{event.people_count}명 · 마감 {formatSeoulDeadline(event.deadline_at)}</span>
          <span className={styles.mobileProgressLabel}><b>{event.submitted_count} / {event.people_count} 제출</b><small>{progress}%</small></span>
          <span className={styles.mobileProgressBar}><i style={{ width: `${progress}%` }} /></span>
        </button>;
      })}</div>}
      {!loading && !error && !filteredEvents.length ? <div className={styles.emptyState}>해당하는 행사가 없어요.</div> : null}
    </div>
    {creating ? <div className={styles.mobileSheetBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false); }}><section className={styles.mobileBottomSheet} role="dialog" aria-modal="true" aria-label="새 사진선택 행사">
      <div className={styles.mobileSheetHandle} /><button type="button" className={styles.mobileSheetClose} onClick={() => setCreating(false)} aria-label="닫기"><X size={20} /></button>
      <h2>새 사진선택 행사</h2>
      <label className={styles.mobileSheetField}><span>행사명</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="예: 서공예 선생님 사진" /></label>
      <label className={styles.mobileSheetField}><span>공개 주소</span><input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="seogongye-2026" /></label>
      <label className={styles.mobileSheetField}><span>마감</span><input type="datetime-local" value={form.deadline_at} onChange={(event) => setForm({ ...form, deadline_at: event.target.value })} /></label>
      {error ? <p className={styles.mobileFormError}>{error}</p> : null}
      <button type="button" className={styles.mobilePrimaryAction} disabled={busy} onClick={() => void createEvent()}>{busy ? "만드는 중" : "행사 만들기"}</button>
    </section></div> : null}
  </section>;
}
