"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, MessageCircle, Phone, Search, UserRound } from "lucide-react";
import styles from "./OliviaMobileShell.module.css";

type ClientListItem = {
  id: string;
  hospital_name?: string | null;
  name?: string | null;
  contact_name?: string | null;
  manager_name?: string | null;
  phone?: string | null;
  specialty?: string | null;
  created_at?: string | null;
  next_action?: { currentStepName?: string; label?: string; progress?: number } | null;
  active_run?: { current_step_key?: string | null; status?: string | null; updated_at?: string | null } | null;
};

type ClientDetail = {
  id: string;
  hospital_name?: string | null;
  name?: string | null;
  contact_name?: string | null;
  manager_name?: string | null;
  phone?: string | null;
  email?: string | null;
  specialty?: string | null;
};

type ClientDetailResponse = {
  client: ClientDetail;
  workflowRun?: { current_step_key?: string | null; status?: string | null; updated_at?: string | null } | null;
  workflowSummary?: {
    progressPercent?: number;
    phases?: Array<{ name?: string; status?: "active" | "completed" | "pending" }>;
  } | null;
  activities?: Array<{ id: string; title?: string | null; description?: string | null; created_at?: string | null }>;
};

function clientName(client: Pick<ClientListItem | ClientDetail, "hospital_name" | "name">) {
  return client.hospital_name || client.name || "이름 없는 고객";
}

function contactName(client: Pick<ClientListItem | ClientDetail, "contact_name" | "manager_name">) {
  return client.contact_name || client.manager_name || "담당자 미등록";
}

function phoneHref(phone: string) {
  return phone.replace(/[^0-9+]/g, "");
}

function recentDate(value?: string | null) {
  if (!value) return "최근 기록 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "최근 기록 없음";
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

function progressText(client: ClientListItem) {
  const action = client.next_action;
  if (action?.label) return action.label;
  if (action?.currentStepName) return `${action.currentStepName} 진행 중`;
  return client.active_run ? "프로젝트 진행 중" : "최근 진행 기록이 없습니다.";
}

export default function MobileClients() {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/clients?scope=list", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "고객 목록을 불러오지 못했어요.");
      setClients(Array.isArray(payload.clients) ? payload.clients : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "고객 목록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openClient = useCallback(async (clientId: string) => {
    setSelectedId(clientId);
    setDetail(null);
    setDetailLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "고객 정보를 불러오지 못했어요.");
      setDetail(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "고객 정보를 불러오지 못했어요.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void loadClients(); }, [loadClients]);
  useEffect(() => {
    const refresh = () => void loadClients();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadClients]);

  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalized) return clients;
    return clients.filter((client) => `${clientName(client)} ${contactName(client)} ${client.phone || ""}`.toLocaleLowerCase("ko-KR").includes(normalized));
  }, [clients, query]);

  if (selectedId) {
    const fallback = clients.find((client) => client.id === selectedId) || null;
    const client = detail?.client || fallback;
    const phone = client?.phone?.trim() || "";
    const activity = detail?.activities?.[0];
    const workflow = detail?.workflowSummary;
    const currentPhase = workflow?.phases?.find((phase) => phase.status === "active")
      ?? workflow?.phases?.find((phase) => phase.status === "completed");
    return (
      <section className={`${styles.screen} ${styles.mobileClientsScreen}`} aria-label="모바일 고객 상세" data-mobile-swipe-lock>
        <button type="button" className={styles.mobileClientsBack} onClick={() => { setSelectedId(null); setDetail(null); setError(""); }}>
          <ChevronLeft size={18} /> 고객 목록
        </button>
        {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void openClient(selectedId)}>다시 시도</button></div> : detailLoading || !client ? (
          <div className={styles.emptyState}>고객 정보를 확인하고 있어요...</div>
        ) : (
          <article className={styles.mobileClientDetail}>
            <span className={styles.mobileClientAvatar}><Building2 size={23} /></span>
            <h1>{clientName(client)}</h1>
            <p>{contactName(client)}{client.specialty ? ` · ${client.specialty}` : ""}</p>

            <div className={styles.mobileClientInfo}>
              <span><UserRound size={16} />담당자</span><strong>{contactName(client)}</strong>
              <span><Phone size={16} />연락처</span><strong>{phone || "등록된 연락처가 없습니다."}</strong>
            </div>
            {phone ? <div className={styles.mobileClientContactActions}>
              <a href={`tel:${phoneHref(phone)}`}><Phone size={17} />전화</a>
              <a href={`sms:${phoneHref(phone)}`}><MessageCircle size={17} />문자</a>
            </div> : null}

            <section className={styles.mobileClientProgress}>
              <span>최근 진행 상황</span>
              <strong>{currentPhase?.name || detail?.workflowRun?.current_step_key || "진행 중인 프로젝트가 없습니다."}</strong>
              {typeof workflow?.progressPercent === "number" ? <div><i style={{ width: `${Math.max(0, Math.min(100, workflow.progressPercent))}%` }} /><small>{workflow.progressPercent}%</small></div> : null}
              {activity?.title || activity?.description ? <p>{activity.title || activity.description}</p> : <p>최근 활동 기록이 없습니다.</p>}
            </section>
          </article>
        )}
      </section>
    );
  }

  return (
    <section className={`${styles.screen} ${styles.mobileClientsScreen}`} aria-label="모바일 고객관리" data-mobile-swipe-lock>
      <div className={styles.mobileClientsTitle}><div><span>고객관리</span><small>최근 등록 순</small></div><span>{loading ? "" : `${filteredClients.length}`}</span></div>
      <label className={styles.searchField}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="병원명 또는 담당자 검색" /></label>
      {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void loadClients()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>고객을 불러오고 있어요...</div> : filteredClients.length ? (
        <div className={styles.mobileClientList}>{filteredClients.map((client) => (
          <button type="button" key={client.id} onClick={() => void openClient(client.id)}>
            <span className={styles.mobileClientAvatar}><Building2 size={19} /></span>
            <span className={styles.mobileClientCopy}><strong>{clientName(client)}</strong><small>{contactName(client)}</small><p>{progressText(client)}</p></span>
            <span className={styles.mobileClientDate}>{recentDate(client.active_run?.updated_at || client.created_at)}<ChevronRight size={16} /></span>
          </button>
        ))}</div>
      ) : <div className={styles.emptyState}><Building2 size={22} /><span>{query ? "검색 결과가 없어요." : "등록된 고객이 없어요."}</span></div>}
    </section>
  );
}
