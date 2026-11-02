"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ChevronRight, Download, FileCheck2, FileImage, FileSpreadsheet,
  FileText, LoaderCircle, MessageCircle, PencilLine, Plus, Search, Send, UserRound,
} from "lucide-react";
import ClientFormModal, { type ClientEditSource } from "@/app/(client-hub)/clients/_components/ClientFormModal";
import PcrmActivityTimeline from "@/app/(client-hub)/clients/_components/PcrmActivityTimeline";
import { ACTIVE_WORKFLOW_STEPS, getWorkflowDisplayStepKey } from "@/lib/workflow";
import { buildStepAppLink } from "@/lib/clientAppLinks";
import { useDesktopAppLauncher } from "@/components/olivia-os/useDesktopAppLauncher";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";
import styles from "./ClientDocumentWorkspace.module.css";

const loadingEditor = () => <div className={styles.editorLoading}><LoaderCircle size={22} /> 문서를 불러오는 중...</div>;
const QuoteBuilder = dynamic(() => import("@/components/quote/QuoteBuilder"), { ssr: false, loading: loadingEditor });
const ContractBuilder = dynamic(() => import("@/components/contract/ContractBuilder"), { ssr: false, loading: loadingEditor });
const ContiV2App = dynamic(() => import("@/components/conti/v2/ContiWorkspaceAdapter"), { ssr: false, loading: loadingEditor });

type DocumentType = "quote" | "contract" | "conti";
type PendingQuote = {
  id: string; hospital_name: string; contact_name?: string | null; phone?: string | null;
  total_amount?: number | null; created_at: string; status?: string | null;
};
type ClientRow = {
  id: string; name: string; hospital_name: string; department?: string; specialty?: string;
  phone?: string; created_at?: string; active_run?: any; next_action?: any;
};
type ClientListPayload = { ok: boolean; clients: ClientRow[]; pendingQuotes: PendingQuote[]; error?: string };

const STEP_LABELS: Record<string, string> = {
  quote: "견적", contract: "계약", conti: "콘티", shooting: "촬영", payment_confirm: "잔금 확인",
  backup_sorting: "백업·분류", client_selection: "고객 셀렉", raw_matching: "RAW 승인",
  retouching: "보정", final_delivery: "완료사진 전달", revision: "수정", reward: "리워드",
};

function won(value: unknown) {
  return `${(Number(value) || 0).toLocaleString("ko-KR")}원`;
}

function shortDate(value?: string | null) {
  if (!value) return "날짜 미정";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "날짜 미정" : date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }).replace(/\. /g, "/").replace(".", "");
}

function elapsedDays(value: string) {
  const then = new Date(value);
  then.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000));
}

function progressFor(run: any) {
  if (!run) return null;
  if (run.status === "completed") return { index: ACTIVE_WORKFLOW_STEPS.length, percent: 100, label: "완료", complete: true };
  const key = getWorkflowDisplayStepKey(run.current_step_key) ?? ACTIVE_WORKFLOW_STEPS[0].key;
  const index = Math.max(0, ACTIVE_WORKFLOW_STEPS.findIndex((step) => step.key === key));
  return { index: index + 1, percent: ((index + 1) / ACTIVE_WORKFLOW_STEPS.length) * 100, label: STEP_LABELS[key] || key, complete: false };
}

function Progress({ run, compact = false }: { run: any; compact?: boolean }) {
  const progress = progressFor(run);
  if (!progress) return <div className={styles.progressEmpty} aria-label="진행 중인 촬영 없음" />;
  return (
    <div className={styles.progress} data-complete={progress.complete} data-compact={compact}>
      <div className={styles.progressTrack}><i style={{ width: `${progress.percent}%` }} /></div>
      <div className={styles.progressMeta}><span>{progress.label}</span><span>{progress.index} / {ACTIVE_WORKFLOW_STEPS.length}</span></div>
    </div>
  );
}

export default function ClientDocumentWorkspace({
  initialClientId, initialWorkflowRunId, embedded = false,
}: { initialClientId?: string | null; initialWorkflowRunId?: string | null; embedded?: boolean }) {
  const launchHref = useDesktopAppLauncher();
  const [list, setList] = useState<ClientListPayload>({ ok: true, clients: [], pendingQuotes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(initialClientId ?? null);
  const [workflowRunId, setWorkflowRunId] = useState<string | null>(initialWorkflowRunId ?? null);
  const [detail, setDetail] = useState<any>(null);
  const [workDoc, setWorkDoc] = useState<DocumentType | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [approvalChoice, setApprovalChoice] = useState<{ quoteId: string; clientId: string; candidates: Array<{ id: string; hospital_name: string }> } | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const closeEditorRef = useRef<null | (() => void)>(null);
  const pendingNavigationRef = useRef<null | (() => void)>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailGenerationRef = useRef(0);

  const loadList = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/clients?scope=list", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "고객 목록을 불러오지 못했습니다.");
      setList(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "고객 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (targetClientId: string | null, targetWorkflowRunId: string | null) => {
    const generation = ++detailGenerationRef.current;
    detailAbortRef.current?.abort();
    if (!targetClientId) { setDetail(null); return; }
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const params = targetWorkflowRunId
      ? `?workflowRunId=${encodeURIComponent(targetWorkflowRunId)}&strictWorkflowRunId=1`
      : "";
    try {
      const response = await fetch(`/api/clients/${targetClientId}${params}`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "고객 문서를 불러오지 못했습니다.");
      if (payload.client?.id !== targetClientId) throw new Error("요청한 고객과 다른 고객 정보가 반환되었습니다.");
      if (targetWorkflowRunId && payload.workflowRun?.id !== targetWorkflowRunId) throw new Error("요청한 촬영 건을 찾을 수 없습니다.");
      if (generation !== detailGenerationRef.current || controller.signal.aborted) return;
      setDetail(payload);
      setWorkflowRunId(payload.workflowRun?.id ?? null);
    } catch (err) {
      if (controller.signal.aborted || generation !== detailGenerationRef.current) return;
      setError(err instanceof Error ? err.message : "고객 문서를 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    void loadDetail(clientId, workflowRunId);
    return () => detailAbortRef.current?.abort();
  }, [clientId, loadDetail, workflowRunId]);
  useEffect(() => {
    if (!clientId || embedded) return;
    const url = new URL(window.location.href);
    url.searchParams.set("clientId", clientId);
    if (workflowRunId) url.searchParams.set("workflowRunId", workflowRunId); else url.searchParams.delete("workflowRunId");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [clientId, embedded, workflowRunId]);

  useEffect(() => {
    if (!clientId) {
      emitShellSelection({ clear: true, sourceAppId: "customer", sourceWindowId: "customer", context: { contextScope: "none", routeHref: "/clients" } });
      return;
    }
    if (!detail?.client) {
      emitShellSelection({
        sourceAppId: "customer",
        sourceWindowId: "customer",
        itemId: clientId,
        title: "고객 정보 불러오는 중",
        subtitle: "선택한 고객과 촬영 건을 확인하고 있습니다.",
        next: "고객 정보를 불러온 뒤 문서를 이어서 작업합니다.",
        appId: "customer",
        context: { contextScope: "client", clientId, workflowRunId: workflowRunId ?? undefined, projectId: workflowRunId ?? undefined },
        featureItemId: workflowRunId ?? clientId,
      });
      return;
    }
    const ownedRunId = detail.workflowRun?.id ?? workflowRunId ?? undefined;
    emitShellSelection({
      sourceAppId: "customer",
      sourceWindowId: "customer",
      itemId: ownedRunId ?? clientId,
      title: detail.client.name ?? detail.client.hospital_name ?? "선택 고객",
      subtitle: detail.workflowRun?.project_name ?? "고객 정보",
      next: detail.listClient?.next_action?.label ?? "고객과 촬영건 자료를 확인합니다.",
      appId: "customer",
      href: `/clients?clientId=${encodeURIComponent(clientId)}${ownedRunId ? `&workflowRunId=${encodeURIComponent(ownedRunId)}` : ""}`,
      context: { contextScope: "client", clientId, clientName: detail.client.name ?? detail.client.hospital_name, workflowRunId: ownedRunId, projectId: ownedRunId, projectName: detail.workflowRun?.project_name, featureItemId: ownedRunId ?? clientId },
      featureItemId: ownedRunId ?? clientId,
    });
  }, [clientId, detail, workflowRunId]);

  const clients = useMemo(() => list.clients
    .filter((client) => !query.trim() || client.hospital_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => Number(Boolean(b.active_run && b.active_run.status !== "completed")) - Number(Boolean(a.active_run && a.active_run.status !== "completed"))
      || new Date(b.active_run?.updated_at || b.created_at || 0).getTime() - new Date(a.active_run?.updated_at || a.created_at || 0).getTime()), [list.clients, query]);

  const approveQuote = async (quoteId: string, chosenClientId?: string) => {
    setApprovingId(quoteId);
    setError("");
    try {
      const response = await fetch(`/api/clients/quotes/${quoteId}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chosenClientId ? { clientId: chosenClientId } : {}),
      });
      const payload = await response.json();
      if (response.status === 409 && payload.requiresClientChoice) {
        setApprovalChoice({ quoteId, clientId: payload.candidates[0]?.id || "", candidates: payload.candidates });
        return;
      }
      if (!response.ok || !payload.ok) throw new Error(payload.error || "견적을 승인하지 못했습니다.");
      setApprovalChoice(null);
      await loadList();
      setClientId(payload.clientId);
      setWorkflowRunId(payload.workflowRunId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "견적을 승인하지 못했습니다.");
    } finally {
      setApprovingId(null);
    }
  };

  const finishEditorClose = () => {
    closeEditorRef.current = null;
    setWorkDoc(null);
    const next = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    next?.();
  };
  const protectEditorNavigation = (next: () => void) => {
    if (workDoc && closeEditorRef.current) {
      pendingNavigationRef.current = next;
      closeEditorRef.current();
      return;
    }
    next();
  };
  const returnToList = () => protectEditorNavigation(() => {
    setClientId(null); setWorkflowRunId(null); setDetail(null); setWorkDoc(null);
    if (!embedded) window.history.replaceState(null, "", "/clients");
  });
  const refreshAll = () => { void loadList(); void loadDetail(clientId, workflowRunId); };

  useEffect(() => {
    if ((initialClientId ?? null) === clientId && (initialWorkflowRunId ?? null) === workflowRunId) return;
    if (!initialClientId) return;
    protectEditorNavigation(() => {
      setDetail(null);
      setClientId(initialClientId);
      setWorkflowRunId(initialWorkflowRunId ?? null);
    });
    // The navigation guard intentionally owns the current editor dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClientId, initialWorkflowRunId]);

  useEffect(() => {
    const onShellTab = (event: Event) => {
      const next = (event as CustomEvent<{ appId?: string; tab?: string }>).detail;
      if (next?.appId !== "customer") return;
      if (next.tab === "customer") returnToList();
    };
    window.addEventListener("olivia-shell-tab", onShellTab);
    return () => window.removeEventListener("olivia-shell-tab", onShellTab);
  });

  if (loading) return <div className={styles.state}><LoaderCircle size={24} /> 고객 문서를 준비하는 중...</div>;

  return (
    <div className={styles.shell} data-embedded={embedded}>
      {error ? <div className={styles.error}>{error}</div> : null}
      {!clientId ? (
        <main className={styles.listPage}>
          <header className={styles.listHeader}>
            <div><p className={styles.eyebrow}>문서 작업</p><h1>고객관리</h1></div>
            <button className={styles.primaryButton} type="button" onClick={() => setFormOpen(true)}><Plus size={15} /> 고객 등록</button>
          </header>
          <label className={styles.search}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="병원 이름으로 찾기" /></label>

          <section className={styles.listSection}>
            <div className={styles.sectionTitle}><strong>승인 대기</strong><span>{list.pendingQuotes.length}</span><small>견적은 보냈고 아직 고객이 아닙니다</small></div>
            {list.pendingQuotes.length ? <div className={styles.pendingList}>{list.pendingQuotes.map((quote) => {
              const days = elapsedDays(quote.created_at);
              const choice = approvalChoice?.quoteId === quote.id ? approvalChoice : null;
              return <div className={styles.pendingRow} key={quote.id}>
                <strong>{quote.hospital_name || "병원명 미입력"}</strong><span>{shortDate(quote.created_at)} 보냄</span><span>{won(quote.total_amount)}</span><span data-overdue={days > 14}>{days}일째</span>
                {choice ? <div className={styles.approvalChoice}><select value={choice.clientId} onChange={(event) => setApprovalChoice({ ...choice, clientId: event.target.value })}>{choice.candidates.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.hospital_name}</option>)}</select><button type="button" onClick={() => void approveQuote(quote.id, choice.clientId)}>선택 고객에 연결</button></div>
                  : <button className={styles.rowPrimary} type="button" disabled={approvingId === quote.id} onClick={() => void approveQuote(quote.id)}>{approvingId === quote.id ? "처리 중" : "승인됨"}</button>}
              </div>;
            })}</div> : <p className={styles.empty}>승인을 기다리는 견적이 없습니다.</p>}
          </section>

          <section className={styles.listSection}>
            <div className={styles.sectionTitle}><strong>등록 고객</strong><span>{clients.length}곳</span><small>진행 중 {clients.filter((client) => client.active_run?.status === "active").length}건</small></div>
            <div className={styles.clientList}>{clients.map((client) => {
              const run = client.active_run;
              const myTurn = client.next_action && !["run_current_step", "completed"].includes(client.next_action.primaryAction);
              return <button className={styles.clientRow} type="button" key={client.id} onClick={() => protectEditorNavigation(() => { setDetail(null); setClientId(client.id); setWorkflowRunId(run?.id ?? null); })}>
                <span className={styles.clientIdentity}><strong>{client.hospital_name}</strong><small>{client.department || client.specialty || "진료과 미정"}</small></span>
                <span>{run?.shoot_date ? shortDate(run.shoot_date) : "촬영일 미정"}</span>
                <span className={styles.nextAction}>{myTurn ? <i>내 차례</i> : null}{client.next_action?.label || (run ? "문서를 확인하세요" : "진행 중인 촬영 없음")}</span>
                <Progress run={run} compact />
                <span className={styles.openLabel}>열기 <ChevronRight size={14} /></span>
              </button>;
            })}{!clients.length ? <p className={styles.empty}>검색 결과가 없습니다.</p> : null}</div>
          </section>
          <ClientFormModal open={formOpen} mode="create" onClose={() => setFormOpen(false)} onSaved={(id) => { setFormOpen(false); void loadList(); setClientId(id); }} />
        </main>
      ) : detail ? (
        <ClientCase
          detail={{ ...detail, listClient: list.clients.find((client) => client.id === clientId) }} workDoc={workDoc} returnToList={returnToList}
          closeEditorRef={closeEditorRef} refreshAll={refreshAll} launchHref={launchHref}
          requestDocument={(doc) => protectEditorNavigation(() => setWorkDoc(doc))} onEditorClosed={finishEditorClose}
        />
      ) : <div className={styles.state}><LoaderCircle size={24} /> 고객 문서를 불러오는 중...</div>}
    </div>
  );
}

function ClientCase({ detail, workDoc, returnToList, closeEditorRef, refreshAll, launchHref, requestDocument, onEditorClosed }: {
  detail: any; workDoc: DocumentType | null;
  returnToList: () => void; closeEditorRef: React.MutableRefObject<null | (() => void)>; refreshAll: () => void;
  launchHref: (href: string, title?: string) => void;
  requestDocument: (doc: DocumentType | null) => void;
  onEditorClosed: () => void;
}) {
  const client = detail.client;
  const run = detail.workflowRun;
  const ids = detail.resourceIds || {};
  const quote = ids.quote ? detail.quotes?.find((item: any) => item.id === ids.quote) : null;
  const contract = ids.contract ? detail.contracts?.find((item: any) => item.id === ids.contract) : null;
  const contact = [client.manager_name, client.phone].filter(Boolean).join(" ");
  const nextAction = run ? detail.workflowRun?.status === "completed" ? "완료" : (detail.listClient?.next_action?.primaryActionLabel || "지금 할 일 열기") : "진행 중인 촬영 없음";
  const [editOpen, setEditOpen] = useState(false);
  const editClient: ClientEditSource = {
    id: client.id,
    name: client.name ?? client.hospital_name ?? "",
    director_name: client.director_name ?? "",
    manager_name: client.manager_name ?? client.contact_name ?? "",
    phone: client.phone ?? "",
    department: client.department ?? client.specialty ?? "",
    email: client.email ?? "",
    address: client.address ?? "",
    website_url: client.website_url ?? "",
    instagram_url: client.instagram_url ?? "",
    naver_place_url: client.naver_place_url ?? "",
    manager_staff: client.manager_staff ?? "",
    referral_source: client.referral_source ?? "",
    notes: client.notes ?? "",
    memo: client.memo ?? "",
  };
  const openNext = () => {
    const key = getWorkflowDisplayStepKey(run?.current_step_key || "");
    if (key && ["quote", "contract", "conti"].includes(key)) requestDocument(key as DocumentType);
    else if (run) launchHref(buildStepAppLink({ stepKey: run.current_step_key, clientId: client.id, workflowRunId: run.id }), client.name);
  };

  const docs = [
    { key: "quote" as const, icon: FileText, label: "견적서", exists: Boolean(ids.quote), status: quote ? `${won(quote.total_amount)} · ${shortDate(quote.created_at)} ${quote.status === "approved" ? "승인" : "저장"}` : "견적을 만들면 생깁니다" },
    { key: "contract" as const, icon: FileCheck2, label: "계약서", exists: Boolean(ids.contract), status: contract ? `${shortDate(contract.created_at)} · ${contract.signature_data_url ? "서명 완료" : "작성 중"}` : "견적 승인 뒤에 생깁니다" },
    { key: "conti" as const, icon: FileSpreadsheet, label: "촬영 콘티", exists: Boolean(ids.conti), status: ids.conti ? "콘티가 준비되어 있습니다" : "계약 뒤에 생깁니다" },
    { key: "original" as const, icon: FileImage, label: "원본 사진", exists: Boolean(client.original_photos_link), status: client.original_photos_link ? "원본 사진 링크가 준비되었습니다" : "촬영 뒤에 생깁니다" },
    { key: "final" as const, icon: Download, label: "완료 사진", exists: Boolean(client.retouched_photos_link), status: client.retouched_photos_link ? "완료 사진 링크가 준비되었습니다" : "보정 뒤에 생깁니다" },
  ];

  return (
    <main className={styles.casePage} data-working={Boolean(workDoc)}>
      {workDoc ? <div className={styles.collapsedHeader}>
        <button type="button" onClick={() => requestDocument(null)}><ArrowLeft size={14} /> 닫기</button>
        <strong>{client.name}</strong><span>{client.department || "진료과 미정"} · {run?.shoot_date ? shortDate(run.shoot_date) : "촬영일 미정"} · {STEP_LABELS[getWorkflowDisplayStepKey(run?.current_step_key || "") || ""] || "문서"}</span>
        <Progress run={run} compact />
      </div> : <header className={styles.caseHeader}>
        <button className={styles.backButton} type="button" onClick={returnToList}><ArrowLeft size={15} /> 고객관리</button>
        <div className={styles.caseTitle}><div className={styles.caseTitleLine}><h1>{client.name}</h1><button type="button" onClick={() => setEditOpen(true)}><PencilLine size={13} /> 고객 정보 수정</button></div><p>{client.department || "진료과 미정"} · {run?.shoot_date ? shortDate(run.shoot_date) : "촬영일 미정"} {contact ? `· ${contact}` : ""}</p></div>
        <Progress run={run} />
        <button className={styles.primaryButton} type="button" disabled={!run || run.status === "completed"} onClick={openNext}>{nextAction}</button>
      </header>}

      <div className={styles.caseGrid}>
        <section className={styles.caseMain}>
          {workDoc ? <DocumentWorkspace active={workDoc} requestActive={requestDocument} detail={detail} closeEditorRef={closeEditorRef} refreshAll={refreshAll} onEditorClosed={onEditorClosed} /> : <>
            <section className={styles.documentsCard}>
              <div className={styles.cardHeader}><strong>문서</strong><span>누르면 아래에 작업창이 열립니다</span></div>
              {docs.map((doc) => {
                const Icon = doc.icon;
                const href = doc.key === "original" ? client.original_photos_link : doc.key === "final" ? client.retouched_photos_link : null;
                return <div className={styles.documentRow} data-muted={!doc.exists} key={doc.key}>
                  <span className={styles.documentIcon}><Icon size={16} /></span><span><strong>{doc.label}</strong><small>{doc.status}</small></span>
                  {doc.key === "quote" || doc.key === "contract" || doc.key === "conti" ? <button type="button" disabled={!doc.exists} onClick={() => requestDocument(doc.key)}>수정</button>
                    : <a href={href || undefined} aria-disabled={!href} target="_blank" rel="noreferrer">열기</a>}
                </div>;
              })}
            </section>
            <section className={styles.activityCard}><div className={styles.cardHeader}><strong>최근</strong></div><PcrmActivityTimeline activities={detail.activities || []} variant="row" /></section>
          </>}
        </section>
        <ClientChatPanel client={client} run={run} documentType={workDoc} onChanged={refreshAll} />
      </div>
      <ClientFormModal open={editOpen} mode="edit" client={editClient} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); refreshAll(); }} />
    </main>
  );
}

function DocumentWorkspace({ active, requestActive, detail, closeEditorRef, refreshAll, onEditorClosed }: {
  active: DocumentType; requestActive: (doc: DocumentType | null) => void; detail: any;
  closeEditorRef: React.MutableRefObject<null | (() => void)>; refreshAll: () => void;
  onEditorClosed: () => void;
}) {
  const ids = detail.resourceIds || {};
  const tabs: Array<{ key: DocumentType; label: string }> = [{ key: "quote", label: "견적서" }, { key: "contract", label: "계약서" }, { key: "conti", label: "콘티" }];
  const registerClose = useCallback((fn: (() => void) | null) => { closeEditorRef.current = fn; }, [closeEditorRef]);
  useEffect(() => () => { closeEditorRef.current = null; }, [closeEditorRef]);
  const common = { clientId: detail.client.id, workflowRunId: detail.workflowRun?.id, onClose: () => { onEditorClosed(); refreshAll(); }, onPublished: refreshAll, registerRequestClose: registerClose };
  return <section className={styles.workCard}>
    <div className={styles.workTabs}>{tabs.map((tab) => <button type="button" key={tab.key} data-active={active === tab.key} disabled={!ids[tab.key]} onClick={() => requestActive(tab.key)}>{tab.label}</button>)}</div>
    <div className={styles.editorHost}>
      {active === "quote" ? <QuoteBuilder key={`quote:${detail.client.id}:${ids.quote}`} mode="modal" documentOnly {...common} resourceId={ids.quote} /> : null}
      {active === "contract" ? <ContractBuilder key={`contract:${detail.client.id}:${ids.contract}`} mode="modal" documentOnly {...common} resourceId={ids.contract} /> : null}
      {active === "conti" ? <ContiV2App key={`conti:${detail.client.id}:${ids.conti}`} documentOnly {...common} resourceId={ids.conti} /> : null}
    </div>
  </section>;
}

function ClientChatPanel({ client, run, documentType, onChanged }: { client: any; run: any; documentType: DocumentType | null; onChanged: () => void }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const scopeLabel = documentType ? `${client.name} · ${documentType === "quote" ? "견적서" : documentType === "contract" ? "계약서" : "콘티"}` : client.name;

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/olivia/client-chat?clientId=${client.id}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "대화를 불러오지 못했습니다.");
      setMessages(payload.messages || []);
    } catch (err) { setError(err instanceof Error ? err.message : "대화를 불러오지 못했습니다."); }
  }, [client.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput(""); setSending(true); setError("");
    setMessages((current) => [...current, { id: `local-${Date.now()}`, role: "user", content: text }]);
    try {
      const response = await fetch("/api/olivia/client-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: client.id, workflowRunId: run?.id, documentType, message: text }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
      await load();
      if (payload.executedTools?.some((tool: any) => tool.success)) {
        window.dispatchEvent(new CustomEvent("olivia-resource-refresh", { detail: { clientId: client.id, documentType } }));
        onChanged();
      }
    } catch (err) { setError(err instanceof Error ? err.message : "요청을 처리하지 못했습니다."); }
    finally { setSending(false); }
  };

  return <aside className={styles.chat}>
    <header><div><strong>이 고객 전용 채팅</strong><span><UserRound size={12} /> {scopeLabel}</span></div><MessageCircle size={18} /></header>
    <div className={styles.messages}>{messages.length ? messages.map((message) => <div className={styles.message} data-role={message.role} key={message.id}><p>{message.content}</p></div>) : <p className={styles.chatEmpty}>{client.name}에 대해 시키세요.</p>}{sending ? <div className={styles.chatThinking}><LoaderCircle size={14} /> 처리하는 중...</div> : null}<div ref={endRef} /></div>
    {error ? <p className={styles.chatError}>{error}</p> : null}
    <div className={styles.composer}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={`${scopeLabel}에 대해 시키세요`} /><button type="button" aria-label="보내기" disabled={!input.trim() || sending} onClick={() => void send()}><Send size={15} /></button></div>
  </aside>;
}
