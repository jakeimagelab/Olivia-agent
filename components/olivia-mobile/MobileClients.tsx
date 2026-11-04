"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, CalendarDays, ChevronLeft, ChevronRight, FileSignature, FileText, Images, Layers3, MessageCircle, Pencil, Phone, Plus, Search, UserRound } from "lucide-react";
import ClientFormModal, { type ClientEditSource } from "@/app/(client-hub)/clients/_components/ClientFormModal";
import type { MobileResourceType } from "@/lib/olivia/mobile/navigation";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import MobileBottomSheet from "./MobileBottomSheet";
import styles from "./OliviaMobileShell.module.css";

type ClientListItem = {
  id: string;
  hospital_name?: string | null;
  name?: string | null;
  contact_name?: string | null;
  manager_name?: string | null;
  phone?: string | null;
  specialty?: string | null;
  email?: string | null;
  director_name?: string | null;
  address?: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  naver_place_url?: string | null;
  manager_staff?: string | null;
  referral_source?: string | null;
  notes?: string | null;
  memo?: string | null;
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
  director_name?: string | null;
  address?: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  naver_place_url?: string | null;
  manager_staff?: string | null;
  referral_source?: string | null;
  notes?: string | null;
  memo?: string | null;
};

type ClientDetailResponse = {
  client: ClientDetail;
  workflowRun?: { id: string; project_name?: string | null; current_step_key?: string | null; status?: string | null; updated_at?: string | null; created_at?: string | null } | null;
  workflowRuns?: Array<{ id: string; project_name?: string | null; client_name?: string | null; current_step_key?: string | null; status?: string | null; updated_at?: string | null; created_at?: string | null }>;
  workflowSummary?: {
    progressPercent?: number;
    phases?: Array<{ name?: string; status?: "active" | "completed" | "pending" }>;
  } | null;
  activities?: Array<{ id: string; title?: string | null; description?: string | null; created_at?: string | null }>;
  resourceIds?: { quote?: string | null; contract?: string | null; conti?: string | null };
  quotes?: Array<{ id: string; quote_number?: string | null; title?: string | null }>;
  contracts?: Array<{ id: string; quote_number?: string | null }>;
  personSelectEvent?: { id: string; title: string } | null;
};

type ClientFilter = "all" | "active" | "shooting" | "completed";

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

export default function MobileClients({ initialClientId, initialWorkflowRunId, onClientChange, onWorkflowRunChange, onOpenPreview, onOpenConti, onOpenPersonSelect }: {
  initialClientId?: string | null;
  initialWorkflowRunId?: string | null;
  onClientChange?: (clientId: string | null) => void;
  onWorkflowRunChange?: (workflowRunId: string | null) => void;
  onOpenPreview: (resource: { resourceType: MobileResourceType; resourceId: string }) => void;
  onOpenConti: (runId: string) => void;
  onOpenPersonSelect: (eventId: string) => void;
}) {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialClientId ?? null);
  const [detail, setDetail] = useState<ClientDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [runSheetOpen, setRunSheetOpen] = useState(false);
  const detailRequestRef = useRef(0);

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

  const openClient = useCallback(async (clientId: string, workflowRunId?: string | null) => {
    const requestId = ++detailRequestRef.current;
    setSelectedId(clientId);
    setDetail(null);
    setDetailLoading(true);
    setError("");
    try {
      const [response, eventsResponse] = await Promise.all([
        fetch(`/api/clients/${encodeURIComponent(clientId)}?${workflowRunId ? `workflowRunId=${encodeURIComponent(workflowRunId)}&strictWorkflowRunId=1` : "workflowMode=client-only"}`, { cache: "no-store" }),
        fetch("/api/person-select", { cache: "no-store" }).catch(() => null),
      ]);
      const [payload, eventsPayload] = await Promise.all([response.json().catch(() => null), eventsResponse?.json().catch(() => null)]);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "고객 정보를 불러오지 못했어요.");
      if (detailRequestRef.current !== requestId) return;
      const personSelectEvent = Array.isArray(eventsPayload?.events) ? eventsPayload.events.find((event: { client_id?: string | null }) => event.client_id === clientId) ?? null : null;
      setDetail({ ...payload, personSelectEvent });
      const client = payload.client as ClientDetail;
      useOliviaContextStore.getState().setWorkspace("clients", clientId);
      useOliviaContextStore.getState().setContextLink({
        clientId,
        clientName: clientName(client),
        projectId: workflowRunId ? payload.workflowRun?.id : undefined,
        projectName: payload.workflowRun?.project_name,
        clientSource: "explicit",
      });
    } catch (loadError) {
      if (detailRequestRef.current !== requestId) return;
      setError(loadError instanceof Error ? loadError.message : "고객 정보를 불러오지 못했어요.");
    } finally {
      if (detailRequestRef.current === requestId) setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void loadClients(); }, [loadClients]);
  useEffect(() => {
    if (initialClientId) {
      void openClient(initialClientId, initialWorkflowRunId);
      return;
    }
    detailRequestRef.current += 1;
    setSelectedId(null);
    setDetail(null);
    setDetailLoading(false);
  }, [initialClientId, initialWorkflowRunId, openClient]);
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
    return clients.filter((client) => {
      if (filter === "active" && (!client.active_run || client.active_run.status === "completed")) return false;
      if (filter === "shooting" && !/shoot|촬영/i.test(`${client.active_run?.current_step_key || ""} ${client.next_action?.currentStepName || ""}`)) return false;
      if (filter === "completed" && client.active_run?.status !== "completed") return false;
      return !normalized || `${clientName(client)} ${contactName(client)} ${client.phone || ""}`.toLocaleLowerCase("ko-KR").includes(normalized);
    });
  }, [clients, filter, query]);

  if (selectedId) {
    const fallback = clients.find((client) => client.id === selectedId) || null;
    const client = detail?.client || fallback;
    const phone = client?.phone?.trim() || "";
    const activity = detail?.activities?.[0];
    const workflow = detail?.workflowSummary;
    const currentPhase = workflow?.phases?.find((phase) => phase.status === "active")
      ?? workflow?.phases?.find((phase) => phase.status === "completed");
    const editClient: ClientEditSource | null = client ? {
      id: client.id,
      name: clientName(client),
      director_name: client.director_name || "",
      manager_name: contactName(client) === "담당자 미등록" ? "" : contactName(client),
      phone: client.phone || "",
      department: client.specialty || "",
      email: client.email || "",
      address: client.address || "",
      website_url: client.website_url || "",
      instagram_url: client.instagram_url || "",
      naver_place_url: client.naver_place_url || "",
      manager_staff: client.manager_staff || "",
      referral_source: client.referral_source || "",
      notes: client.notes || "",
      memo: client.memo || "",
    } : null;
    return (
      <section className={`${styles.screen} ${styles.mobileClientsScreen}`} aria-label="모바일 고객 상세" data-mobile-swipe-lock>
        <button type="button" className={styles.mobileClientsBack} onClick={() => {
          detailRequestRef.current += 1;
          useOliviaContextStore.getState().clearWindowLink();
          setSelectedId(null);
          setDetail(null);
          setError("");
          onWorkflowRunChange?.(null);
          onClientChange?.(null);
        }}>
          <ChevronLeft size={18} /> 고객 목록
        </button>
        {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void openClient(selectedId, initialWorkflowRunId)}>다시 시도</button></div> : detailLoading || !client ? (
          <div className={styles.emptyState}>고객 정보를 확인하고 있어요...</div>
        ) : (
          <article className={styles.mobileClientDetail}>
            <span className={styles.mobileClientAvatar}><Building2 size={23} /></span>
            <h1>{clientName(client)}</h1>
            <p>{contactName(client)}{client.specialty ? ` · ${client.specialty}` : ""}</p>
            <div className={styles.mobileClientDetailActions}>
              <button type="button" className={styles.mobileClientEdit} onClick={() => setEditOpen(true)}><Pencil size={16} />고객 정보 수정</button>
              <button type="button" className={styles.mobileClientEdit} onClick={() => setRunSheetOpen(true)}><Layers3 size={16} />{detail?.workflowRun ? "촬영 건 변경" : "촬영 건 선택"}</button>
            </div>

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
            <section className={styles.mobileClientDocuments}>
              <h2>연결 문서</h2>
              <button type="button" disabled={!detail?.resourceIds?.quote && !detail?.quotes?.[0]?.id} onClick={() => { const id = detail?.resourceIds?.quote || detail?.quotes?.[0]?.id; if (id) onOpenPreview({ resourceType: "quote", resourceId: id }); }}><FileText size={18} /><span><strong>견적서</strong><small>{detail?.resourceIds?.quote || detail?.quotes?.[0]?.id ? "문서 확인" : "연결 문서 없음"}</small></span><ChevronRight size={17} /></button>
              <button type="button" disabled={!detail?.resourceIds?.contract && !detail?.contracts?.[0]?.id} onClick={() => { const id = detail?.resourceIds?.contract || detail?.contracts?.[0]?.id; if (id) onOpenPreview({ resourceType: "contract", resourceId: id }); }}><FileSignature size={18} /><span><strong>계약서</strong><small>{detail?.resourceIds?.contract || detail?.contracts?.[0]?.id ? "서명·공개 상태 확인" : "연결 문서 없음"}</small></span><ChevronRight size={17} /></button>
              <button type="button" disabled={!detail?.resourceIds?.conti} onClick={() => detail?.resourceIds?.conti && onOpenConti(detail.resourceIds.conti)}><CalendarDays size={18} /><span><strong>촬영 콘티</strong><small>{detail?.resourceIds?.conti ? "장면 확인" : "연결 문서 없음"}</small></span><ChevronRight size={17} /></button>
              <button type="button" disabled={!detail?.personSelectEvent} onClick={() => detail?.personSelectEvent && onOpenPersonSelect(detail.personSelectEvent.id)}><Images size={18} /><span><strong>사진선택</strong><small>{detail?.personSelectEvent?.title || "연결 행사 없음"}</small></span><ChevronRight size={17} /></button>
            </section>
          </article>
        )}
        <ClientFormModal open={editOpen} mode="edit" client={editClient} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); void loadClients(); void openClient(selectedId, detail?.workflowRun?.id); }} />
        <MobileBottomSheet open={runSheetOpen} title="촬영 건 선택" description="선택한 촬영 건의 진행 단계와 연결 문서만 표시합니다." onClose={() => setRunSheetOpen(false)}>
          <div className={styles.mobileRunList}>
            <button type="button" data-active={!detail?.workflowRun} onClick={() => {
              setRunSheetOpen(false);
              if (onWorkflowRunChange) onWorkflowRunChange(null);
              else void openClient(selectedId, null);
            }}><span><strong>고객 정보만 보기</strong><small>촬영 건을 연결하지 않음</small></span><ChevronRight size={17} /></button>
            {(detail?.workflowRuns || []).map((run) => <button type="button" key={run.id} data-active={detail?.workflowRun?.id === run.id} onClick={() => {
              setRunSheetOpen(false);
              if (onWorkflowRunChange) onWorkflowRunChange(run.id);
              else void openClient(selectedId, run.id);
            }}><span><strong>{run.project_name || run.client_name || "촬영 건"}</strong><small>{run.current_step_key || "단계 미설정"} · {run.status || "상태 미설정"}</small></span><ChevronRight size={17} /></button>)}
          </div>
        </MobileBottomSheet>
      </section>
    );
  }

  return (
    <section className={`${styles.screen} ${styles.mobileClientsScreen}`} aria-label="모바일 고객관리" data-mobile-swipe-lock>
      <div className={styles.mobileClientsTitle}><div><span>고객관리</span><small>최근 등록 순</small></div><div className={styles.mobileClientsTitleActions}><span>{loading ? "" : `${filteredClients.length}`}</span><button type="button" onClick={() => setCreateOpen(true)} aria-label="고객 등록"><Plus size={18} />등록</button></div></div>
      <label className={styles.searchField}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="병원명 또는 담당자 검색" /></label>
      <div className={styles.filterChips}>{(["all", "active", "shooting", "completed"] as const).map((item) => <button type="button" key={item} className={filter === item ? styles.filterActive : undefined} onClick={() => setFilter(item)}>{item === "all" ? "전체" : item === "active" ? "진행 중" : item === "shooting" ? "촬영 예정" : "완료"}</button>)}</div>
      {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void loadClients()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>고객을 불러오고 있어요...</div> : filteredClients.length ? (
        <div className={styles.mobileClientList}>{filteredClients.map((client) => (
          <button type="button" key={client.id} onClick={() => onClientChange ? onClientChange(client.id) : void openClient(client.id)}>
            <span className={styles.mobileClientAvatar}><Building2 size={19} /></span>
            <span className={styles.mobileClientCopy}><strong>{clientName(client)}</strong><small>{contactName(client)}</small><p>{progressText(client)}</p></span>
            <span className={styles.mobileClientDate}>{recentDate(client.active_run?.updated_at || client.created_at)}<ChevronRight size={16} /></span>
          </button>
        ))}</div>
      ) : <div className={styles.emptyState}><Building2 size={22} /><span>{query ? "검색 결과가 없어요." : "등록된 고객이 없어요."}</span></div>}
      <ClientFormModal open={createOpen} mode="create" onClose={() => setCreateOpen(false)} onSaved={(clientId) => {
        setCreateOpen(false);
        void loadClients();
        onClientChange?.(clientId);
      }} />
    </section>
  );
}
