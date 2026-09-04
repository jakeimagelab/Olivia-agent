"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Building2, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Copy, Download, Eye, MoreVertical, Pencil, Plus, Search, Settings, Trash2, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ACTIVE_WORKFLOW_STEPS,
  getWorkflowDisplayStepKey,
  resolvePhaseTargetStep,
} from "@/lib/workflow";
import { buildStepAppLink } from "@/lib/clientAppLinks";
import { tryMoveWorkflowStep } from "@/lib/clientWorkspace/stepNavigation";
import { TOOL_LINK_TITLES } from "@/lib/clientWorkspace/nextAction";
import { avatarColor, avatarInitial } from "@/lib/pcrmAvatar";
import { getOrCreatePortalAccessToken, portalUrlFromToken } from "@/lib/clientPortalAccess";
import CurrentStepCard from "@/components/client-workspace/CurrentStepCard";
import ClientListPanel from "@/components/client-workspace/ClientListPanel";
import ProjectWorkflowStepper from "@/components/client-workspace/ProjectWorkflowStepper";
import WorkspaceModal from "@/components/client-workspace/WorkspaceModal";
import type { WorkspacePhase } from "@/lib/clientWorkspace/types";
import ClientFormModal from "@/app/(client-hub)/clients/_components/ClientFormModal";
import NewPcrmProjectDialog from "@/app/(client-hub)/clients/_components/NewPcrmProjectDialog";
import EditPcrmProjectDialog from "@/app/(client-hub)/clients/_components/EditPcrmProjectDialog";
import PcrmActivityTimeline from "@/app/(client-hub)/clients/_components/PcrmActivityTimeline";
import ClientOverviewTab from "@/app/(client-hub)/clients/_components/detail/ClientOverviewTab";
import ClientScheduleTab from "@/app/(client-hub)/clients/_components/detail/ClientScheduleTab";
import ClientRevisionsTab from "@/app/(client-hub)/clients/_components/detail/ClientRevisionsTab";
import ClientPortalTab from "@/app/(client-hub)/clients/_components/detail/ClientPortalTab";
import MissionStatusBar from "@/components/olivia/ui/MissionStatusBar";
import { C } from "@/lib/theme";
import { formatArtifactSize, openWorkflowArtifact, type WorkflowArtifact } from "@/lib/workflowArtifacts";
import { useClientRoster } from "@/app/(client-hub)/clients/_hooks/useClientRoster";
import { useDesktopWindowMode } from "@/lib/desktopWindowContext";

// 견적서/계약서/콘티 빌더와 진행상세 모달은 실제로 모달을 열 때만 필요하다 — 고객 목록 첫 화면에는
// 전혀 안 쓰이는데 지금까지는 정적 import라 항상 초기 JS 번들에 포함됐다. 모달 상태가 열리는
// 순간에만 청크를 받아오도록 next/dynamic으로 분리(코드 요청서 17/18절, ContiBuilder가 특히 큼).
const modalLoading = () => (
  <div className="pcrm-inline-project-state"><span className="pcrm-inline-project-spinner" /><p>불러오는 중...</p></div>
);
const ProgressDetailModal = dynamic(() => import("@/components/client-workspace/ProgressDetailModal"), { ssr: false, loading: modalLoading });
const QuoteBuilder = dynamic(() => import("@/components/quote/QuoteBuilder"), { ssr: false, loading: modalLoading });
const ContractBuilder = dynamic(() => import("@/components/contract/ContractBuilder"), { ssr: false, loading: modalLoading });
const ContiBuilder = dynamic(() => import("@/components/conti/ContiBuilder"), { ssr: false, loading: modalLoading });
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { usePcrmHeaderActions } from "@/components/pcrm/PcrmHeaderActionsSlot";

const STEP_INFO: Record<string, { icon: string; desc: string; href: string }> = {
  consult_meeting:   { icon: "🤝", desc: "병원 기본 정보 등록, 상담 내용 AI 분析",  href: "/consultation" },
  quote:             { icon: "📄", desc: "패키지 선택 및 PDF 견적서 자동 생성",      href: "/quote" },
  contract:          { icon: "✍️", desc: "계약서 생성 및 이메일 전달",               href: "/contract" },
  conti:             { icon: "🎬", desc: "AI 촬영 콘티 및 체크리스트 생성",          href: "/conti" },
  shooting:          { icon: "📸", desc: "촬영 당일 체크리스트 진행 및 완료 처리",   href: "/shooting" },
  payment_confirm:   { icon: "🧾", desc: "잔금 입금과 계산서 처리 상태를 수동 확인", href: "/clients" },
  backup_sorting:    { icon: "🗂️", desc: "RAW/JPG 자동 분류 및 백업 관리",          href: "/photo-sorting?mode=classification" },
  original_delivery: { icon: "📦", desc: "원본 파일 NAS 링크 생성 및 발송",          href: "/original-delivery" },
  client_selection:  { icon: "🖼️", desc: "원본 전달부터 고객 셀렉과 RAW 매칭까지 관리", href: "/select-galleries" },
  retouching:        { icon: "🎨", desc: "색감 보정 및 보정 가이드 작성",             href: "/photo-retouching" },
  revision:          { icon: "🔄", desc: "수정 요청 접수 및 알람 발송",               href: "/mailing" },
  seo_delivery:      { icon: "🔍", desc: "SEO 파일명·ALT·캡션·메타데이터 자동 생성", href: "/seo-delivery" },
  final_delivery:    { icon: "🚀", desc: "최종 파일 + 후기 요청 메일 발송",           href: "/delivery-mail" },
  review_content:    { icon: "⭐", desc: "후기 텍스트 → 리뷰컨텐츠 자동 변환",       href: "/clients/reviews" },
  reward:            { icon: "🎁", desc: "PER 포인트 자동 산출 및 적립",              href: "/per" },
  customer_care:     { icon: "💌", desc: "주기 알람 및 이벤트 메일 발송",             href: "/mailing" },
  content_planning:  { icon: "✏️", desc: "블로그 기반 콘텐츠 기획 및 작성",          href: "/content-writer" },
};

const DETAIL_TABS: { key: string; label: string }[] = [
  { key: "overview", label: "개요" },
  { key: "documents", label: "문서" },
  { key: "schedule", label: "일정" },
  { key: "gallery", label: "갤러리" },
  { key: "revisions", label: "수정·승인" },
  { key: "activity", label: "활동 기록" },
  { key: "info", label: "고객 정보" },
  { key: "portal", label: "포털 관리" },
];

function fmtDot(value?: string | null) {
  if (!value) return "미정";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "미정";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

const MAIL_LABELS: Record<string, string> = {
  quote: "견적서", contract: "계약서", conti: "콘티", gallery: "갤러리",
  original_files: "원본파일", review_form: "후기폼", monthly_report: "리포트", shoot_reminder: "촬영알림",
};

const MAIL_COLOR: Record<string, string> = {
  draft: C.hint, ready: C.orange, sent: C.green, failed: "#DC2626",
};

export default function ClientsWorkspace({ initialClientId, initialWorkflowRunId }: { initialClientId?: string; initialWorkflowRunId?: string } = {}) {
  return (
    <Suspense fallback={<SpinBox />}>
      <ClientsInner initialClientId={initialClientId} initialWorkflowRunId={initialWorkflowRunId} />
    </Suspense>
  );
}

function SpinBox() {
  return (
    <div style={{ padding: "80px 0", textAlign: "center", color: C.hint }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>불러오는 중...</div>
    </div>
  );
}

function ClientsInner({ initialClientId, initialWorkflowRunId }: { initialClientId?: string; initialWorkflowRunId?: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const embedded = useDesktopWindowMode();
  if (embedded) return <ClientWorkspaceView embedded openNewOnLoad={false} initialClientId={initialClientId ?? null} />;
  const id = searchParams.get("id");
  const workflowRunId = initialWorkflowRunId ?? searchParams.get("workflowRunId");
  // 기존 8탭 상세 화면은 그대로 둔다(?id=) — 이번 개편으로 아직 안 옮긴 기능(문서/갤러리 상세관리 등)의
  // 도피처. 새 3단 워크스페이스는 기본 진입(/clients, ?clientId=) 경로로 붙인다.
  if (id) return <DetailView clientId={id} workflowRunId={workflowRunId} onBack={() => router.push("/clients")} />;
  if (workflowRunId) return <DetailView clientId="_by-workflow" workflowRunId={workflowRunId} onBack={() => router.push("/clients")} />;
  return <ClientWorkspaceView embedded={false} openNewOnLoad={searchParams.get("new") === "1"} initialClientId={searchParams.get("clientId")} />;
}

/* ── 2열 워크스페이스 — 왼쪽 고객 목록 | 오른쪽 선택 고객 프로젝트 ── */
function ClientWorkspaceView({ embedded, openNewOnLoad = false, initialClientId }: { embedded: boolean; openNewOnLoad?: boolean; initialClientId: string | null }) {
  const router = useRouter();
  const {
    filtered, loading, search, setSearch,
    formModal, openCreate, closeForm,
    deletingId, deleteClient, load,
  } = useClientRoster();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClientId);
  const filteredClientIds = filtered.map((client) => client.id).join("|");

  useEffect(() => {
    if (openNewOnLoad) openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNewOnLoad]);

  useEffect(() => {
    if (loading) return;
    const requestedId = initialClientId && filtered.some((client) => client.id === initialClientId) ? initialClientId : null;
    const retainedId = selectedClientId && filtered.some((client) => client.id === selectedClientId) ? selectedClientId : null;
    const nextId = requestedId || retainedId || filtered[0]?.id || null;
    if (nextId === selectedClientId) return;
    setSelectedClientId(nextId);
    const selected = filtered.find((client) => client.id === nextId);
    const contextStore = useOliviaContextStore.getState();
    contextStore.setClient(selected?.id, selected?.name);
    contextStore.setProject(undefined, undefined);
    if (!embedded && nextId && initialClientId !== nextId) router.replace(`/clients?clientId=${encodeURIComponent(nextId)}`, { scroll: false });
  // filteredClientIds는 선택 가능한 id 집합만 추적해 검색 입력 중 불필요한 effect 재실행을 막는다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, filteredClientIds, initialClientId, loading, router, selectedClientId]);

  const selectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    const selected = filtered.find((client) => client.id === clientId);
    const contextStore = useOliviaContextStore.getState();
    contextStore.setClient(clientId, selected?.name);
    contextStore.setProject(undefined, undefined);
    if (!embedded) router.replace(`/clients?clientId=${encodeURIComponent(clientId)}`, { scroll: false });
  };

  // openCreate는 useClientRoster가 매 렌더마다 새로 만드는 함수라 deps에 넣으면 헤더 슬롯이
  // 계속 갱신되는 루프가 생긴다 — ref로 "최신 함수"만 따라가고 deps에서는 뺀다.
  const openCreateRef = useRef(openCreate);
  openCreateRef.current = openCreate;
  const headerActions = useMemo(() => (
    <>
      <label className="oa-header__client-search">
        <Search size={15} aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="고객명, 병원명 검색"
          aria-label="고객명 또는 병원명 검색"
        />
      </label>
      <button type="button" className="oa-header__client-create" onClick={() => openCreateRef.current()}>
        <Plus size={15} /> <span>고객 등록</span>
      </button>
    </>
  ), [search, setSearch]);
  usePcrmHeaderActions(headerActions, [headerActions]);

  return (
    <div className="pcrm-dashboard pcrm-dashboard--workspace" style={{ color: C.txt, height: embedded ? "100%" : undefined, minHeight: 0, overflow: embedded ? "hidden" : undefined }}>
      <div
        className="pcrm-workspace-grid"
        style={{ display: "grid", width: "100%", gridTemplateColumns: "310px minmax(0, 1fr)", gap: 18, height: embedded ? "100%" : "calc(100vh - 160px)", minHeight: embedded ? 0 : 560, padding: embedded ? 12 : "0 0 16px" }}
      >
        <ClientListPanel
          clients={filtered}
          loading={loading}
          search={search}
          onSearch={setSearch}
          selectedClientId={selectedClientId}
          onSelect={selectClient}
          deletingId={deletingId}
          onDelete={deleteClient}
        />

        <div className="pcrm-inline-project-column">
          {selectedClientId ? (
            <InlineClientProjectPanel clientId={selectedClientId} embedded={embedded} />
          ) : (
            <div className="pc-card pc-card--padded pcrm-inline-project-empty">
              <p>등록된 고객이 없습니다.</p>
              <button type="button" onClick={openCreate} className="pc-btn pc-btn--orange pc-btn--sm"><Plus size={13} /> 고객 등록</button>
            </div>
          )}
        </div>
      </div>

      <ClientFormModal
        open={formModal !== null}
        mode={formModal?.mode ?? "create"}
        client={formModal?.client}
        onClose={closeForm}
        onSaved={(id) => { closeForm(); void load(false); selectClient(id); }}
        onSavedAndNewProject={(id) => { closeForm(); void load(false); if (!embedded) router.push(`/quote?clientId=${id}`); }}
      />

      <style jsx global>{`
        @media (max-width: 1180px) and (min-width: 761px) {
          .pcrm-workspace-grid { grid-template-columns: 280px minmax(0, 1fr) !important; }
        }
        @media (max-width: 760px) {
          .pcrm-workspace-grid { grid-template-columns: 1fr !important; height: auto !important; min-height: 0 !important; }
          .pcrm-workspace-grid > div { height: auto !important; max-height: none !important; }
        }
      `}</style>
    </div>
  );
}

// 고객 A→B→A처럼 왔다갔다 할 때 A를 처음부터 다시 기다리지 않도록 하는 짧은 메모리 캐시
// (코드 요청서 9/10절) — 캐시가 있으면 그 데이터를 즉시 보여주고, 그 사이에도 항상
// 최신 데이터를 백그라운드로 다시 받아와 조용히 갱신한다(stale-while-revalidate).
const CLIENT_DETAIL_STALE_MS = 45_000;
const clientDetailCache = new Map<string, { data: any; fetchedAt: number }>();

function invalidateClientDetailCache(clientId: string) {
  clientDetailCache.delete(clientId);
}

function InlineClientProjectPanel({ clientId, embedded }: { clientId: string; embedded: boolean }) {
  const router = useRouter();
  const cached = clientDetailCache.get(clientId);
  const [pageData, setPageData] = useState<any>(() => cached?.data ?? null);
  const [loading, setLoading] = useState(() => !cached);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [toolModal, setToolModal] = useState<{ type: "quote" | "contract" | "conti"; resourceId?: string } | null>(null);
  const [toolBuilderRequestClose, setToolBuilderRequestClose] = useState<(() => void) | null>(null);

  const refresh = () => { invalidateClientDetailCache(clientId); setReloadKey((value) => value + 1); };

  useEffect(() => {
    const controller = new AbortController();
    const cachedEntry = clientDetailCache.get(clientId);
    const hasFreshCache = cachedEntry && Date.now() - cachedEntry.fetchedAt < CLIENT_DETAIL_STALE_MS;
    if (cachedEntry) {
      // 캐시된 화면을 그대로 보여주고(스피너로 안 덮음), 아래에서 최신 데이터로 조용히 갱신한다.
      setPageData(cachedEntry.data);
      setLoading(false);
      setLoadError("");
    } else {
      setLoading(true);
      setLoadError("");
      setPageData(null);
    }
    // 캐시가 아주 신선하면(45초 이내) 굳이 다시 안 받아온다 — 그래도 명시적 refresh()(reloadKey 변경)는
    // invalidateClientDetailCache로 캐시를 먼저 지우므로 hasFreshCache가 false가 되어 항상 다시 받는다.
    if (hasFreshCache) return;
    void (async () => {
      try {
        let response = await fetch(`/api/clients/${clientId}`, { cache: "no-store", signal: controller.signal });
        let payload = await response.json().catch(() => null);
        if (response.status === 409 && payload?.healedClientId) {
          response = await fetch(`/api/clients/${payload.healedClientId}`, { cache: "no-store", signal: controller.signal });
          payload = await response.json().catch(() => null);
        }
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "고객 프로젝트를 불러오지 못했습니다.");
        clientDetailCache.set(clientId, { data: payload, fetchedAt: Date.now() });
        setPageData(payload);
        useOliviaContextStore.getState().setClient(payload.client.id, payload.client.name);
        useOliviaContextStore.getState().setProject(payload.workflowRun?.id, payload.workflowRun?.project_name);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (!cachedEntry) setLoadError(error instanceof Error ? error.message : "고객 프로젝트를 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [clientId, reloadKey]);

  if (loading) return <div className="pc-card pc-card--padded pcrm-inline-project-state"><span className="pcrm-inline-project-spinner" /><p>프로젝트를 불러오는 중...</p></div>;
  if (!pageData?.client) return (
    <div className="pc-card pc-card--padded pcrm-inline-project-state is-error">
      <strong>프로젝트를 불러오지 못했어요.</strong>
      <p>{loadError}</p>
      <button type="button" onClick={refresh} className="pc-btn pc-btn--secondary pc-btn--sm">다시 시도</button>
    </div>
  );

  const { client, workflowRun, workflowSummary, resourceIds, activities = [] } = pageData;
  const workflowCompleted = workflowRun?.status === "completed";
  const currentStepKey = workflowCompleted
    ? ACTIVE_WORKFLOW_STEPS[ACTIVE_WORKFLOW_STEPS.length - 1].key
    : workflowRun?.current_step_key || ACTIVE_WORKFLOW_STEPS[0].key;
  const displayStepKey = getWorkflowDisplayStepKey(currentStepKey) || ACTIVE_WORKFLOW_STEPS[0].key;

  const openToolModal = (type: "quote" | "contract" | "conti") => {
    setToolModal({ type, resourceId: resourceIds?.[type] ?? undefined });
  };

  const handlePhaseClick = async (phase: WorkspacePhase) => {
    if (!workflowRun) return;
    const targetStep = resolvePhaseTargetStep(phase.key, workflowRun.current_step_key);
    await tryMoveWorkflowStep(workflowRun.id, targetStep);
    refresh();
    if (targetStep === "quote" || targetStep === "contract" || targetStep === "conti") openToolModal(targetStep);
    else if (!embedded) router.push(buildStepAppLink({ stepKey: targetStep, clientId, workflowRunId: workflowRun.id }));
  };

  return (
    <section className="pcrm-inline-project">
      <header className="pcrm-inline-project__header pc-card">
        <div className="pcrm-inline-project__identity">
          <span><Building2 size={25} strokeWidth={1.7} /></span>
          <div>
            <h2>{client.name}</h2>
            <p>{client.contact_name || "원장 정보 미등록"} · {workflowRun?.manager_name || client.manager_name || "담당자 미지정"} 담당</p>
            <small>최근 작업일: {fmtDot(workflowRun?.updated_at || client.updated_at || client.created_at)}</small>
          </div>
        </div>
        {!embedded ? (
          <div className="pcrm-inline-project__header-actions">
            <Link href={`/clients?id=${encodeURIComponent(clientId)}`}><UserRound size={15} /> 고객 정보</Link>
            <Link href={`/clients?id=${encodeURIComponent(clientId)}#settings`}><Settings size={15} /> 관리 설정</Link>
          </div>
        ) : null}
      </header>

      {workflowRun ? (
        <>
          <section className="pcrm-inline-project__overview pc-card">
            <div className="pcrm-inline-project__project-heading">
              <div>
                <span>현재 프로젝트</span>
                <div><h3>{workflowRun.project_name || `${client.name} 프로젝트`}</h3><b>{workflowCompleted ? "완료" : "진행 중"}</b></div>
                <p>{workflowRun.started_at || workflowRun.created_at ? `시작 ${fmtDot(workflowRun.started_at || workflowRun.created_at)}` : "시작일 미정"}{workflowRun.shoot_date ? ` · 촬영 ${fmtDot(workflowRun.shoot_date)}` : ""}</p>
              </div>
              <Link href={`/clients?id=${encodeURIComponent(clientId)}`}>
                프로젝트 상세 보기 <ChevronRight size={16} />
              </Link>
            </div>
            {workflowSummary ? (
              <div className="pcrm-inline-project__workflow">
                <ProjectWorkflowStepper phases={workflowSummary.phases} progressPercent={workflowSummary.progressPercent} light onSelectPhase={handlePhaseClick} />
              </div>
            ) : null}
          </section>

          <div className="pcrm-inline-project__bottom-grid">
            <section className="pcrm-inline-project__next-action pc-card">
              <h2>지금 할 일</h2>
              <CurrentStepCard
                client={client}
                workflowRun={workflowRun}
                stepIcon={STEP_INFO[displayStepKey]?.icon}
                stepDescription={STEP_INFO[displayStepKey]?.desc}
                onOpenToolModal={openToolModal}
              />
            </section>
            <PcrmActivityTimeline
              activities={activities}
              variant="row"
              onViewAll={() => router.push(`/clients?id=${encodeURIComponent(clientId)}`)}
            />
          </div>
        </>
      ) : (
        <div className="pcrm-inline-project__no-project">
          <span><ClipboardList size={22} strokeWidth={1.5} /></span>
          <div><strong>아직 연결된 프로젝트가 없어요.</strong><p>고객 정보를 유지한 채 첫 프로젝트를 만들어 업무를 시작하세요.</p></div>
          <button type="button" onClick={() => setShowProjectDialog(true)} className="pc-btn pc-btn--orange pc-btn--sm"><Plus size={13} /> 새 프로젝트 생성</button>
        </div>
      )}

      {showProjectDialog ? (
        <NewPcrmProjectDialog clientId={clientId} clientName={client.name} onClose={() => setShowProjectDialog(false)} onCreated={() => { setShowProjectDialog(false); refresh(); }} />
      ) : null}

      {toolModal?.type === "quote" ? (
        <WorkspaceModal open onClose={() => toolBuilderRequestClose?.()} title={`${client.name} · 견적서 작성`}>
          <QuoteBuilder mode="modal" clientId={clientId} workflowRunId={workflowRun?.id} resourceId={toolModal.resourceId} onClose={() => { setToolModal(null); refresh(); }} onPublished={refresh} registerRequestClose={setToolBuilderRequestClose} />
        </WorkspaceModal>
      ) : null}
      {toolModal?.type === "contract" ? (
        <WorkspaceModal open onClose={() => toolBuilderRequestClose?.()} title={`${client.name} · 계약서 작성`}>
          <ContractBuilder mode="modal" clientId={clientId} workflowRunId={workflowRun?.id} resourceId={toolModal.resourceId} onClose={() => { setToolModal(null); refresh(); }} onPublished={refresh} registerRequestClose={setToolBuilderRequestClose} />
        </WorkspaceModal>
      ) : null}
      {toolModal?.type === "conti" ? (
        <WorkspaceModal open onClose={() => toolBuilderRequestClose?.()} title={`${client.name} · 콘티 작성`}>
          <ContiBuilder mode="modal" clientId={clientId} workflowRunId={workflowRun?.id} resourceId={toolModal.resourceId} onClose={() => { setToolModal(null); refresh(); }} onPublished={refresh} registerRequestClose={setToolBuilderRequestClose} />
        </WorkspaceModal>
      ) : null}
    </section>
  );
}

/* ── DETAIL VIEW ── */
function DetailView({ clientId, workflowRunId, onBack }: { clientId: string; workflowRunId: string | null; onBack: () => void }) {
  const router = useRouter();
  const [pageData, setPageData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [showEditProjectDialog, setShowEditProjectDialog] = useState(false);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [linkCopyBusy, setLinkCopyBusy] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  // 코드 요청서 7차(2026-08-16) — resourceId까지 같이 들고 있어야 이미 있는 문서를 그대로
  // 불러온다(버그: resourceId 없이 빌더를 열면 QuoteBuilder/ContractBuilder/ContiBuilder가
  // 전부 빈 문서로 시작함 — 재현: 더힐피부과신사점, 콘티가 이미 있는데 "콘티 작성하기"를 누르면
  // 빈 콘티가 또 열림).
  const [toolModal, setToolModal] = useState<{ type: "quote" | "contract" | "conti"; resourceId?: string } | null>(null);
  const [toolBuilderRequestClose, setToolBuilderRequestClose] = useState<(() => void) | null>(null);

  const deleteClient = async (clientName: string) => {
    if (!window.confirm(`'${clientName}' 고객을 삭제할까요? 휴지통으로 이동되며 30일 안에 복원할 수 있습니다.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "삭제 실패");
      onBack();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeleting(false);
    }
  };

  const openClientPreview = async () => {
    const selectedWorkflowRunId = pageData?.workflowRun?.id || workflowRunId;
    if (!selectedWorkflowRunId) {
      alert("먼저 고객 프로젝트를 생성해 주세요.");
      return;
    }
    setPreviewLoading(true);
    try {
      const existing = await fetch(`/api/admin/client-portal/access?clientId=${clientId}&workflowRunId=${selectedWorkflowRunId}`).then((r) => r.json());
      let token = existing?.activeAccess?.access_token;
      if (!token) {
        const created = await fetch("/api/admin/client-portal/access", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, workflowRunId: selectedWorkflowRunId }),
        }).then((r) => r.json());
        if (!created?.ok) throw new Error(created?.error || "고객 포털을 열 수 없습니다.");
        token = created?.token;
      }
      if (token) window.open(`/client-portal/access/${token}`, "_blank", "noopener,noreferrer");
    } catch (error) {
      alert(error instanceof Error ? error.message : "고객 포털을 열 수 없습니다.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const suffix = workflowRunId ? `?workflowRunId=${encodeURIComponent(workflowRunId)}` : "";
      const res = await fetch(`/api/clients/${clientId}${suffix}`, { cache: "no-store" });
      const d = await res.json();
      if (res.status === 409 && d.healedClientId) {
        // 고객 연결이 방금 자동 복구됨 — 사용자가 새로고침할 필요 없이 바로 다시 불러온다.
        const retryRes = await fetch(`/api/clients/${d.healedClientId}`, { cache: "no-store" });
        const retryData = await retryRes.json();
        if (!retryRes.ok || !retryData.ok) throw new Error(retryData.error || "고객 상세 정보를 불러오지 못했습니다.");
        setPageData(retryData);
        return;
      }
      if (!res.ok || !d.ok) throw new Error(d.error || "고객 상세 정보를 불러오지 못했습니다.");
      setPageData(d);
    } catch (error) {
      setPageData(null);
      setLoadError(error instanceof Error ? error.message : "고객 상세 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [clientId, workflowRunId]);

  if (loading) return <SpinBox />;
  if (!pageData?.client) return (
    <div style={{ padding: "60px 24px", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>❌</div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{loadError || "고객을 찾을 수 없습니다."}</div>
      {loadError && <div style={{ fontSize: 12, color: C.hint, marginBottom: 12 }}>잠시 후 다시 시도하거나 관리자에게 문의해주세요.</div>}
      <button onClick={onBack} style={{ height: 40, padding: "0 20px", background: C.teal, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← 목록으로</button>
    </div>
  );

  const { client, workflowRun, quotes = [], contracts = [], artifacts = [], activities = [], workflowSummary, resourceIds } = pageData;
  const workflowCompleted = workflowRun?.status === "completed";
  const currentStepKey = workflowCompleted
    ? ACTIVE_WORKFLOW_STEPS[ACTIVE_WORKFLOW_STEPS.length - 1].key
    : workflowRun?.current_step_key || ACTIVE_WORKFLOW_STEPS[0].key;
  const displayStepKey = getWorkflowDisplayStepKey(currentStepKey) || ACTIVE_WORKFLOW_STEPS[0].key;
  const activeTabLabel = DETAIL_TABS.find((t) => t.key === activeTab)?.label || "개요";

  // resourceIds(pageData, 코드 요청서 7차)에서 이 workflow_run에 이미 있는 문서 id를 찾아
  // 같이 넘긴다 — 없으면(아직 문서를 안 만든 단계) undefined라 빌더가 빈 문서로 시작한다.
  const openToolModal = (type: "quote" | "contract" | "conti") => {
    setToolModal({ type, resourceId: resourceIds?.[type] ?? undefined });
  };

  // 진행바 phase 클릭 → 즉시 처리 화면 진입(코드 요청서 4차·6차, 2026-08-16) —
  // ClientWorkspaceView의 handlePhaseClick과 완전히 같은 패턴. 지금 단계가 아니어도 항상
  // 클릭 가능하고, 이동이 가드에 막히면(문서 없는 quote/contract/conti) 조용히 무시되고
  // 화면은 그대로 열린다(tryMoveWorkflowStep 참고).
  const handlePhaseClick = async (phase: WorkspacePhase) => {
    if (!workflowRun) return;
    const targetStep = resolvePhaseTargetStep(phase.key, workflowRun.current_step_key);
    await tryMoveWorkflowStep(workflowRun.id, targetStep);
    load();
    if (targetStep === "quote" || targetStep === "contract" || targetStep === "conti") {
      openToolModal(targetStep);
    } else {
      router.push(buildStepAppLink({ stepKey: targetStep, clientId, workflowRunId: workflowRun.id }));
    }
  };

  // 헤더 빠른 실행 버튼 — ClientWorkspaceView의 headerQuickAction과 동일한 규칙(코드 요청서
  // 6차 4-1번 항목). 항상 진행바가 가리키는 현재 단계를 따라가고, 정적 문구를 하드코딩하지 않는다.
  const headerQuickAction = (() => {
    if (!workflowRun) {
      return <button type="button" onClick={() => openToolModal("quote")} className="pc-btn pc-btn--orange pc-btn--sm">+ 견적서 작성</button>;
    }
    if (workflowCompleted) return null;
    if (displayStepKey === "quote" || displayStepKey === "contract" || displayStepKey === "conti") {
      return (
        <button type="button" onClick={() => openToolModal(displayStepKey)} className="pc-btn pc-btn--orange pc-btn--sm">
          + {TOOL_LINK_TITLES[displayStepKey]}
        </button>
      );
    }
    return null;
  })();

  const copyPortalLink = async () => {
    if (!workflowRun?.id) { alert("먼저 프로젝트를 생성해야 링크를 복사할 수 있습니다."); return; }
    setLinkCopyBusy(true);
    try {
      const token = await getOrCreatePortalAccessToken(clientId, workflowRun.id);
      await navigator.clipboard.writeText(portalUrlFromToken(token));
      alert("포털 링크를 복사했습니다.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "링크 복사에 실패했습니다.");
    } finally {
      setLinkCopyBusy(false);
    }
  };

  return (
    <div style={{ color: C.txt }}>
      <section className="pcrm-dashboard" aria-label="고객 프로젝트 요약" style={{ paddingBottom: 0 }}>
      <nav className="pcrm-breadcrumb" aria-label="이동 경로">
        <Link href="/clients">고객 관리</Link><span>/</span><span>고객 상세 · {activeTabLabel}</span>
        <button type="button" onClick={onBack} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3, border: 0, background: "none", color: "#5a7470", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          <ChevronLeft size={13} /> 목록
        </button>
      </nav>

      <div className="pcrm-detail-header">
        <div className="pcrm-detail-header__identity">
          <span className="pcrm-detail-header__logo" style={{ background: avatarColor(client.name) }}>{avatarInitial(client.name)}</span>
          <div className="pcrm-detail-header__body">
            <div className="pcrm-detail-header__name-row">
              <h1>{client.name}</h1>
              <span className="pcrm-badge-soft" data-tone={workflowCompleted ? "done" : "active"}>{workflowCompleted ? "프로젝트 완료" : workflowRun ? "프로젝트 진행 중" : "프로젝트 없음"}</span>
            </div>
            <div className="pcrm-detail-header__fields">
              <div><span>프로젝트명</span><span>{workflowRun?.project_name || "—"}</span></div>
              <div>
                <span>담당 매니저</span>
                <span>
                  {workflowRun?.manager_name && <i className="pcrm-mini-avatar" style={{ background: avatarColor(workflowRun.manager_name) }}>{avatarInitial(workflowRun.manager_name)}</i>}
                  {workflowRun?.manager_name || "미지정"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="pcrm-detail-header__meta">
          <div><CalendarDays size={14} /> 프로젝트 기간 <b>{workflowRun ? `${fmtDot(workflowRun.created_at)} ~ ${workflowRun.shoot_date ? fmtDot(workflowRun.shoot_date) : "미정"}` : "—"}</b></div>
          <div><CalendarDays size={14} /> 촬영 예정일 <b>{workflowRun?.shoot_date ? fmtDot(workflowRun.shoot_date) : "—"}</b></div>
          <div><ClipboardList size={14} /> 프로젝트 상태 <b><span className="pcrm-badge-soft" data-tone={workflowCompleted ? "done" : "active"}>{workflowCompleted ? "완료" : workflowRun ? "진행 중" : "없음"}</span></b></div>
        </div>

        <div className="pcrm-detail-header__actions">
          {headerQuickAction}
          <button onClick={openClientPreview} disabled={previewLoading} className="pc-btn pc-btn--secondary pc-btn--sm">
            <Eye size={13} /> {previewLoading ? "준비 중..." : "고객 포털 보기"}
          </button>
          <button onClick={copyPortalLink} disabled={linkCopyBusy} className="pc-btn pc-btn--ghost pc-btn--sm">
            <Copy size={13} /> {linkCopyBusy ? "복사 중..." : "링크 복사"}
          </button>
          {workflowRun && (
            <button onClick={() => setShowEditProjectDialog(true)} className="pc-btn pc-btn--secondary pc-btn--sm"><Pencil size={13} /> 프로젝트 수정</button>
          )}
          <button onClick={() => setShowProjectDialog(true)} className="pc-btn pc-btn--orange pc-btn--sm"><Plus size={13} /> 프로젝트 생성</button>
          <div className="pcrm-row-menu">
            <button type="button" className="pc-btn pc-btn--ghost pc-btn--sm" aria-label="더보기" onClick={() => setHeaderMenuOpen((v) => !v)}>
              <MoreVertical size={15} />
            </button>
            {headerMenuOpen && (
              <>
                <div className="pcrm-row-menu__scrim" onClick={() => setHeaderMenuOpen(false)} />
                <div className="pcrm-row-menu__panel">
                  <button type="button" className="is-danger" disabled={deleting} onClick={() => { setHeaderMenuOpen(false); deleteClient(client.name); }}>
                    <Trash2 size={13} /> {deleting ? "삭제 중..." : "고객 삭제"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {workflowRun ? (
        <div style={{ marginBottom: 14 }}>
          <MissionStatusBar
            title={`${client.name} ${workflowRun.project_name || "프로젝트"}`}
            status={workflowCompleted ? "완료" : "진행 중"}
            currentStage={ACTIVE_WORKFLOW_STEPS.find((step) => step.key === displayStepKey)?.name}
            nextScheduleLabel={workflowRun.shoot_date ? `${fmtDot(workflowRun.shoot_date)} 촬영` : undefined}
            owner={workflowRun.manager_name || undefined}
            progress={workflowSummary?.progressPercent}
          />
        </div>
      ) : null}

      {workflowRun && workflowSummary ? (
        <div className="pc-card pc-card--padded" style={{ marginBottom: 14 }}>
          <ProjectWorkflowStepper phases={workflowSummary.phases} progressPercent={workflowSummary.progressPercent} onSelectPhase={handlePhaseClick} />
          <button type="button" onClick={() => setProgressModalOpen(true)} style={{ marginTop: 8, border: "none", background: "none", padding: 0, color: C.teal, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            전체 과정 보기 →
          </button>
        </div>
      ) : null}

      <CurrentStepCard
        client={client}
        workflowRun={workflowRun}
        stepIcon={STEP_INFO[displayStepKey]?.icon}
        stepDescription={STEP_INFO[displayStepKey]?.desc}
        onOpenToolModal={openToolModal}
      />

      <nav className="pcrm-detail-tabs" aria-label="고객 상세 탭" style={{ marginTop: 14 }}>
        {DETAIL_TABS.map((tab) => (
          <button key={tab.key} type="button" data-active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
        ))}
      </nav>
      </section>

      {showProjectDialog && (
        <NewPcrmProjectDialog
          clientId={clientId}
          clientName={client.name}
          onClose={() => setShowProjectDialog(false)}
          onCreated={(newWorkflowRunId) => {
            setShowProjectDialog(false);
            router.push(`/clients?id=${encodeURIComponent(clientId)}&workflowRunId=${encodeURIComponent(newWorkflowRunId)}`);
          }}
        />
      )}

      {showEditProjectDialog && workflowRun && (
        <EditPcrmProjectDialog
          clientId={clientId}
          clientName={client.name}
          run={workflowRun}
          onClose={() => setShowEditProjectDialog(false)}
          onUpdated={() => {
            setShowEditProjectDialog(false);
            load();
          }}
        />
      )}

      {workflowRun ? (
        <ProgressDetailModal
          open={progressModalOpen}
          onClose={() => setProgressModalOpen(false)}
          client={client}
          workflowRun={workflowRun}
          onOpenToolModal={openToolModal}
          onRefresh={load}
        />
      ) : null}

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "14px 16px 80px", display: "grid", gridTemplateColumns: "1fr", gap: 14, alignItems: "start" }}>

        {activeTab === "overview" && (
          <ClientOverviewTab client={client} workflowRun={workflowRun} artifacts={artifacts} activities={activities} onRefresh={load} onNavigateTab={setActiveTab} />
        )}

        {activeTab === "documents" && (
          <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
            <ClientRelatedArtifactsSection
              clientId={clientId}
              workflowRunId={workflowRun?.id}
              quotes={quotes}
              contracts={contracts}
              artifacts={artifacts}
            />
            <ClientMailHistorySection clientId={clientId} />
          </div>
        )}

        {activeTab === "schedule" && <ClientScheduleTab hospitalName={client.name} />}

        {activeTab === "gallery" && (
          <ClientGallerySection clientId={clientId} hospitalName={client.name} email={client.email} workflowRunId={workflowRun?.id} />
        )}

        {activeTab === "revisions" && (
          <ClientRevisionsTab clientId={clientId} workflowRunId={workflowRun?.id} managerName={workflowRun?.manager_name || client.contact_name} />
        )}

        {activeTab === "activity" && <PcrmActivityTimeline activities={activities} variant="full" />}

        {activeTab === "info" && <InfoPanel client={client} onUpdate={load} />}

        {activeTab === "portal" && <ClientPortalTab clientId={clientId} workflowRunId={workflowRun?.id} />}

      </div>

      {toolModal?.type === "quote" ? (
        <WorkspaceModal open onClose={() => toolBuilderRequestClose?.()} title={`${client.name} · 견적서 작성`}>
          <QuoteBuilder
            mode="modal"
            clientId={clientId}
            workflowRunId={workflowRun?.id}
            resourceId={toolModal.resourceId}
            onClose={() => { setToolModal(null); load(); }}
            onPublished={load}
            registerRequestClose={setToolBuilderRequestClose}
          />
        </WorkspaceModal>
      ) : null}

      {toolModal?.type === "contract" ? (
        <WorkspaceModal open onClose={() => toolBuilderRequestClose?.()} title={`${client.name} · 계약서 작성`}>
          <ContractBuilder
            mode="modal"
            clientId={clientId}
            workflowRunId={workflowRun?.id}
            resourceId={toolModal.resourceId}
            onClose={() => { setToolModal(null); load(); }}
            onPublished={load}
            registerRequestClose={setToolBuilderRequestClose}
          />
        </WorkspaceModal>
      ) : null}

      {toolModal?.type === "conti" ? (
        <WorkspaceModal open onClose={() => toolBuilderRequestClose?.()} title={`${client.name} · 콘티 작성`}>
          <ContiBuilder
            mode="modal"
            clientId={clientId}
            workflowRunId={workflowRun?.id}
            resourceId={toolModal.resourceId}
            onClose={() => { setToolModal(null); load(); }}
            onPublished={load}
            registerRequestClose={setToolBuilderRequestClose}
          />
        </WorkspaceModal>
      ) : null}
    </div>
  );
}

/* ── 견적서 / 계약서 섹션 (client_id 기준, 부가세 별도 금액 표시) ── */
function ClientRelatedArtifactsSection({
  clientId,
  workflowRunId,
  quotes,
  contracts,
  artifacts,
}: {
  clientId: string;
  workflowRunId?: string;
  quotes: any[];
  contracts: any[];
  artifacts: WorkflowArtifact[];
}) {
  const [publications, setPublications] = useState<any[]>([]);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  useEffect(() => {
    if (!workflowRunId) {
      setPublications([]);
      return;
    }
    fetch(`/api/admin/pcrm/publications?clientId=${encodeURIComponent(clientId)}&workflowRunId=${encodeURIComponent(workflowRunId)}`)
      .then((response) => response.json())
      .then((payload) => {
        if (payload.ok) setPublications(payload.publications ?? []);
      });
  }, [clientId, workflowRunId]);

  if (quotes.length === 0 && contracts.length === 0 && artifacts.length === 0) return null;

  const won = (n: number | null | undefined) => (n ?? 0).toLocaleString("ko-KR") + "원";
  const artifactSources = new Set(artifacts.map((artifact) => `${artifact.source_table}:${artifact.source_id}`));
  const legacyQuotes = quotes.filter((quote: any) => !artifactSources.has(`quotes:${quote.id}`));
  const legacyContracts = contracts.filter((contract: any) => !artifactSources.has(`contracts:${contract.id}`));
  const typeLabel = { quote: "견적서", contract: "계약서", conti: "콘티" } as const;

  const accessArtifact = async (artifact: WorkflowArtifact, mode: "view" | "download") => {
    try {
      await openWorkflowArtifact(artifact.id, mode);
    } catch (error) {
      alert(error instanceof Error ? error.message : "원본 파일을 열지 못했습니다.");
    }
  };

  const togglePublication = async (artifact: WorkflowArtifact) => {
    if (!workflowRunId || publishingId) return;
    const existing = publications.find((item) =>
      item.related_type === "workflow_artifact"
      && item.related_id === artifact.id
      && item.status !== "archived"
    );
    setPublishingId(artifact.id);
    try {
      const response = await fetch("/api/admin/pcrm/publications", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(existing
          ? { id: existing.id, action: "archive" }
          : {
              clientId,
              workflowRunId,
              relatedType: "workflow_artifact",
              relatedId: artifact.id,
              title: artifact.title || artifact.file_name,
            }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "공개 상태를 변경하지 못했습니다.");
      setPublications((current) => existing
        ? current.map((item) => item.id === existing.id ? payload.publication : item)
        : [payload.publication, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "공개 상태를 변경하지 못했습니다.");
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <section style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }} aria-labelledby="client-artifacts-title">
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.03)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div id="client-artifacts-title" style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>📎 관련 자료</div>
          <div style={{ marginTop: 2, fontSize: 10, color: C.muted }}>견적서·계약서·콘티 원본을 한곳에서 확인합니다.</div>
        </div>
        <span style={{ borderRadius: 99, padding: "4px 8px", background: `${C.teal}0D`, color: C.teal, fontSize: 10, fontWeight: 900 }}>{artifacts.length + legacyQuotes.length + legacyContracts.length}건</span>
      </div>

      {artifacts.map((artifact) => (
        <div key={artifact.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ borderRadius: 99, padding: "5px 8px", background: artifact.document_type === "quote" ? "#FFF0E8" : artifact.document_type === "contract" ? "#EAF4F2" : "#EEF6EC", color: artifact.document_type === "quote" ? C.orange : C.teal, fontSize: 9, fontWeight: 900, whiteSpace: "nowrap" }}>
            {typeLabel[artifact.document_type]}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ overflow: "hidden", color: C.txt, fontSize: 12, fontWeight: 800, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artifact.title || artifact.file_name}</div>
            <div style={{ marginTop: 2, overflow: "hidden", color: C.muted, fontSize: 10, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {artifact.file_name} · {new Date(artifact.created_at).toLocaleDateString("ko-KR")}{formatArtifactSize(artifact.file_size) ? ` · ${formatArtifactSize(artifact.file_size)}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => void accessArtifact(artifact, "view")} className="pc-btn pc-btn--sm" style={{ minHeight: 32, padding: "0 10px" }}><Eye size={13}/> 보기</button>
            <button type="button" onClick={() => void accessArtifact(artifact, "download")} className="pc-btn pc-btn--sm" style={{ minHeight: 32, padding: "0 10px" }}><Download size={13}/> 다운로드</button>
            {workflowRunId && (
              <button
                type="button"
                disabled={publishingId === artifact.id}
                onClick={() => void togglePublication(artifact)}
                className="pc-btn pc-btn--sm"
                style={{
                  minHeight: 32,
                  padding: "0 10px",
                  borderColor: publications.some((item) => item.related_type === "workflow_artifact" && item.related_id === artifact.id && item.status !== "archived") ? C.orange : C.teal,
                  background: publications.some((item) => item.related_type === "workflow_artifact" && item.related_id === artifact.id && item.status !== "archived") ? `${C.orange}10` : `${C.teal}08`,
                  color: publications.some((item) => item.related_type === "workflow_artifact" && item.related_id === artifact.id && item.status !== "archived") ? C.orange : C.teal,
                }}
              >
                {publishingId === artifact.id
                  ? "처리 중"
                  : publications.some((item) => item.related_type === "workflow_artifact" && item.related_id === artifact.id && item.status !== "archived")
                    ? "공개 취소"
                    : "고객 공개"}
              </button>
            )}
          </div>
        </div>
      ))}

      {legacyQuotes.length > 0 && (
        <div>
          {legacyQuotes.map((q: any) => (
            <div key={q.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "10px 18px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 9, fontWeight: 900, color: C.orange }}>견적서</span>
              <div><div style={{ fontSize: 12, fontWeight: 700, color: C.txt }}>{q.title || q.quote_number || "견적서"} · {won(q.total_amount)}</div><div style={{ fontSize: 10, color: C.muted }}>공급가액 {won(q.supply_amount)} · {q.created_at ? new Date(q.created_at).toLocaleDateString("ko-KR") : ""}</div></div>
              <span style={{ color: C.hint, fontSize: 10, fontWeight: 800 }}>원본 파일 없음</span>
            </div>
          ))}
        </div>
      )}

      {legacyContracts.length > 0 && (
        <div>
          {legacyContracts.map((contract: any) => (
            <div key={contract.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "10px 18px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 9, fontWeight: 900, color: C.teal }}>계약서</span>
              <div><div style={{ fontSize: 12, fontWeight: 700, color: C.txt }}>{contract.quote_number || "계약서"}</div><div style={{ fontSize: 10, color: C.muted }}>{contract.signature_data_url ? "서명완료" : "서명대기"}{contract.created_at ? ` · ${new Date(contract.created_at).toLocaleDateString("ko-KR")}` : ""}</div></div>
              <span style={{ color: C.hint, fontSize: 10, fontWeight: 800 }}>원본 파일 없음</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── 메일 발송이력 섹션 (client_id 기준 전체 이력, 초안부터 발송/실패까지) ── */
function ClientMailHistorySection({ clientId }: { clientId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/mailing/logs?client_id=${clientId}`).then((r) => r.json()),
      fetch(`/api/mailing?client_id=${clientId}`).then((r) => r.json()),
    ])
      .then(([logsRes, queueRes]) => {
        setLogs(logsRes.ok ? logsRes.logs ?? [] : []);
        setQueue(queueRes.ok ? (queueRes.items ?? []).filter((m: any) => m.status !== "sent") : []);
      })
      .finally(() => setLoading(false));
  }, [clientId]);

  const items = [
    ...logs.map((l: any) => ({ id: `log_${l.id}`, type: l.type, status: l.status, subject: l.subject, at: l.sent_at })),
    ...queue.map((q: any) => ({ id: `q_${q.id}`, type: q.type, status: q.status, subject: q.subject, at: q.created_at })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const STATUS_LABEL: Record<string, string> = { draft: "초안", ready: "대기", sent: "발송", failed: "실패" };

  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.03)" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>📬 메일 발송이력</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>이 고객에게 발송/예정된 메일 전체 (최신순)</div>
      </div>
      {loading ? (
        <div style={{ padding: "16px 18px", fontSize: 12, color: C.muted }}>불러오는 중...</div>
      ) : items.length === 0 ? (
        <div style={{ padding: "16px 18px", fontSize: 12, color: C.hint }}>발송 이력이 없습니다.</div>
      ) : (
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {items.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: `${MAIL_COLOR[m.status] || C.hint}18`, color: MAIL_COLOR[m.status] || C.hint, flexShrink: 0 }}>
                {STATUS_LABEL[m.status] || m.status}
              </span>
              <span style={{ flex: 1, fontSize: 12, color: C.txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {MAIL_LABELS[m.type] || m.type}{m.subject ? ` — ${m.subject}` : ""}
              </span>
              <span style={{ fontSize: 11, color: C.hint, flexShrink: 0 }}>
                {m.at ? new Date(m.at).toLocaleDateString("ko-KR", { year: "2-digit", month: "short", day: "numeric" }) : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 촬영 갤러리 섹션 ── */
function ClientGallerySection({ clientId, hospitalName, email, workflowRunId }: { clientId: string; hospitalName: string; email?: string; workflowRunId?: string }) {
  const [galleries, setGalleries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ nasLink: "", shootDate: "", description: "", galleryType: "final_photo" });
  const [publications, setPublications] = useState<any[]>([]);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (clientId) params.set("client_id", clientId);
      if (hospitalName) params.set("q", hospitalName);
      if (workflowRunId) params.set("workflow_run_id", workflowRunId);
      const query = `/api/galleries?${params.toString()}`;
      const [d, publicationData] = await Promise.all([
        fetch(query).then((res) => res.json()),
        workflowRunId
          ? fetch(`/api/admin/pcrm/publications?clientId=${encodeURIComponent(clientId)}&workflowRunId=${encodeURIComponent(workflowRunId)}`).then((res) => res.json())
          : Promise.resolve({ ok: true, publications: [] }),
      ]);
      if (d.ok) setGalleries(d.galleries || []);
      if (publicationData.ok) setPublications(publicationData.publications || []);
    } finally { setLoading(false); }
  };

  const toggleGalleryPublication = async (gallery: any) => {
    if (!workflowRunId || publishingId) return;
    const existing = publications.find((item) => item.related_type === "gallery" && item.related_id === gallery.id && item.status !== "archived");
    setPublishingId(gallery.id);
    try {
      const response = await fetch("/api/admin/pcrm/publications", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(existing
          ? { id: existing.id, action: "archive" }
          : {
              clientId,
              workflowRunId,
              relatedType: "gallery",
              relatedId: gallery.id,
              title: gallery.description || "촬영 갤러리",
            }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "갤러리 공개 상태를 변경하지 못했습니다.");
      setPublications((current) => existing
        ? current.map((item) => item.id === existing.id ? payload.publication : item)
        : [payload.publication, ...current]);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "갤러리 공개 상태를 변경하지 못했습니다.");
    } finally {
      setPublishingId(null);
    }
  };
  useEffect(() => { load(); }, [clientId, hospitalName, workflowRunId]);

  const save = async () => {
    if (!form.nasLink) { setMsg("NAS 링크를 입력해주세요."); return; }
    setSaving(true); setMsg("");
    try {
      const res = await fetch("/api/galleries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hospitalName,
          contactEmail: email || "",
          nasLink: form.nasLink,
          shootDate: form.shootDate,
          description: form.description,
          galleryType: form.galleryType,
          client_id: clientId || null,
          workflow_run_id: workflowRunId || null,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      setForm({ nasLink: "", shootDate: "", description: "", galleryType: "final_photo" });
      setShowForm(false);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "저장 실패"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.03)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>📷 촬영 갤러리</div>
        <div style={{ display: "flex", gap: 6 }}>
          <a href={`/gallery?client_id=${clientId}${workflowRunId ? `&workflow_run_id=${workflowRunId}` : ""}`}
            style={{ fontSize: 11, fontWeight: 700, color: C.orange, background: `${C.orange}12`, border: `1px solid ${C.orange}30`, borderRadius: 6, padding: "4px 10px", textDecoration: "none" }}>
            갤러리 앱 →
          </a>
          <button onClick={() => setShowForm(v => !v)} style={{ fontSize: 11, fontWeight: 700, color: C.teal, background: "rgba(21,88,85,.06)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
            {showForm ? "닫기" : "+ 빠른 추가"}
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.02)", display: "grid", gap: 10 }}>
          <input value={form.nasLink} onChange={e => setForm(f => ({ ...f, nasLink: e.target.value }))}
            placeholder="NAS 갤러리 링크 *" style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", fontFamily: "inherit", color: C.txt, background: C.white, boxSizing: "border-box" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input type="date" value={form.shootDate} onChange={e => setForm(f => ({ ...f, shootDate: e.target.value }))}
              style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", fontFamily: "inherit", color: C.txt, background: C.white }} />
            <select value={form.galleryType} onChange={e => setForm(f => ({ ...f, galleryType: e.target.value }))}
              style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", fontFamily: "inherit", color: C.txt, background: C.white }}>
              <option value="original_photo">원본사진</option>
              <option value="original_video">원본영상</option>
              <option value="final_photo">완료사진</option>
              <option value="final_video">완료영상</option>
            </select>
          </div>
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="촬영 내용 메모" style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", fontFamily: "inherit", color: C.txt, background: C.white, boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={save} disabled={saving} style={{ height: 34, padding: "0 18px", background: C.teal, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
              {saving ? "저장 중..." : "저장"}
            </button>
            {msg && <span style={{ fontSize: 11, color: msg.includes("실패") || msg.includes("입력") ? C.orange : C.teal, fontWeight: 700 }}>{msg}</span>}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "16px 18px", fontSize: 12, color: C.hint }}>불러오는 중...</div>
      ) : galleries.length === 0 ? (
        <div style={{ padding: "16px 18px", fontSize: 12, color: C.hint, textAlign: "center" }}>
          등록된 갤러리가 없습니다. 위에서 NAS 링크를 추가해주세요.
        </div>
      ) : (
        <div style={{ padding: "8px 0" }}>
          {galleries.map((g: any) => (
            <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${C.border}` }}>
              {g.items?.[0]?.thumbnail_url ? (
                <img src={g.items[0].thumbnail_url} alt="" style={{ width: 48, height: 36, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 48, height: 36, background: C.light, borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 18 }}>📷</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.txt }}>
                  {g.shoot_date ? new Date(g.shoot_date).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" }) : "날짜 미입력"}
                </div>
                {g.description && <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.description}</div>}
              </div>
              <a href={g.nas_link} target="_blank" rel="noreferrer"
                style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: C.teal, background: C.light, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 10px", textDecoration: "none" }}>
                🔗 열기
              </a>
              {workflowRunId && (
                <button
                  type="button"
                  disabled={publishingId === g.id}
                  onClick={() => void toggleGalleryPublication(g)}
                  style={{
                    flexShrink: 0,
                    border: `1px solid ${C.orange}35`,
                    borderRadius: 7,
                    padding: "6px 10px",
                    background: publications.some((item) => item.related_type === "gallery" && item.related_id === g.id && item.status !== "archived") ? `${C.orange}12` : C.white,
                    color: C.orange,
                    fontFamily: "inherit",
                    fontSize: 10,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {publishingId === g.id
                    ? "처리 중"
                    : publications.some((item) => item.related_type === "gallery" && item.related_id === g.id && item.status !== "archived")
                      ? "공개 취소"
                      : "고객 공개"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoPanel({ client, onUpdate }: { client: any; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const startEdit = () => {
    setForm({
      name:             client.hospital_name  || client.name         || "",
      director_name:    client.director_name  || "",
      manager_name:     client.contact_name   || client.manager_name || "",
      phone:            client.phone          || "",
      email:            client.email          || "",
      department:       client.specialty      || client.department   || "",
      address:          client.address        || "",
      website_url:      client.website_url    || "",
      instagram_url:    client.instagram_url  || "",
      naver_place_url:  client.naver_place_url|| "",
      manager_staff:    client.manager_staff  || "",
      referral_source:  client.referral_source|| "",
      notes:            client.notes          || "",
      memo:             client.memo           || "",
    });
    setEditing(true); setMsg("");
  };

  const save = async () => {
    setSaving(true); setMsg("");
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (d.ok) { setEditing(false); onUpdate(); setMsg("저장됐습니다."); }
    else setMsg(d.error || "저장 실패");
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const iS: React.CSSProperties = {
    width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 6,
    padding: "5px 9px", fontSize: 12, fontFamily: "inherit",
    outline: "none", background: C.white, color: C.txt, boxSizing: "border-box",
  };

  const rows: [string, string][] = [
    ["name",            "병원이름"],
    ["director_name",   "원장명"],
    ["manager_name",    "담당자"],
    ["phone",           "연락처"],
    ["email",           "이메일"],
    ["department",      "진료과"],
    ["address",         "주소"],
    ["website_url",     "홈페이지"],
    ["instagram_url",   "인스타그램"],
    ["naver_place_url", "네이버플레이스"],
    ["manager_staff",   "담당 매니저"],
    ["referral_source", "유입 경로"],
    ["notes",           "비고"],
    ["memo",            "내부 메모"],
  ];

  const ALIAS: Record<string, string> = { name: "hospital_name", manager_name: "contact_name", department: "specialty" };
  const LINK_KEYS = ["website_url", "instagram_url", "naver_place_url"];
  const displayVal = (key: string) => {
    const v = client[key] ?? client[ALIAS[key] ?? key];
    if (!v) return "—";
    return String(v);
  };

  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.03)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>고객 기본 정보</div>
        {!editing ? (
          <button onClick={startEdit} style={{ fontSize: 11, fontWeight: 800, color: C.teal, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>수정</button>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { setEditing(false); setMsg(""); }} style={{ fontSize: 11, fontWeight: 700, color: C.muted, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>취소</button>
            <button onClick={save} disabled={saving} style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: saving ? C.hint : C.teal, border: "none", borderRadius: 6, padding: "4px 14px", cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{saving ? "..." : "저장"}</button>
          </div>
        )}
      </div>
      {msg && <div style={{ padding: "8px 18px", background: msg.includes("실패") ? "#FFF0F0" : C.light, fontSize: 12, fontWeight: 700, color: msg.includes("실패") ? C.orange : C.green }}>{msg}</div>}
      <div style={{ padding: "12px 18px", display: "grid", gap: 10 }}>
        {rows.map(([key, label]) => (
          <div key={key} className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, alignItems: "start" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, paddingTop: 3 }}>{label}</span>
            {editing ? (
              key === "memo" || key === "notes" ? (
                <textarea value={form[key] || ""} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} rows={2}
                  style={{ ...iS, height: "auto", padding: "6px 9px", resize: "vertical", lineHeight: 1.5 }} />
              ) : (
                <input type="text" value={form[key] || ""} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} style={iS} />
              )
            ) : (
              <span style={{ fontSize: 12, color: displayVal(key) === "—" ? C.hint : C.txt, wordBreak: "break-word" }}>
                {LINK_KEYS.includes(key) && displayVal(key) !== "—" ? (
                  <a href={displayVal(key).startsWith("http") ? displayVal(key) : `https://${displayVal(key)}`} target="_blank" rel="noreferrer" style={{ color: C.teal, textDecoration: "none" }}>{displayVal(key)} ↗</a>
                ) : displayVal(key)}
              </span>
            )}
          </div>
        ))}
        {(client.original_photos_link || client.retouched_photos_link) && (
          <>
            <div style={{ height: 1, background: C.border, margin: "2px 0" }} />
            {client.original_photos_link && (
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, alignItems: "start" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, paddingTop: 3 }}>원본사진공유링크</span>
                <a href={client.original_photos_link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.teal, textDecoration: "none", wordBreak: "break-word" }}>{client.original_photos_link} ↗</a>
              </div>
            )}
            {client.retouched_photos_link && (
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, alignItems: "start" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, paddingTop: 3 }}>보정사진공유링크</span>
                <a href={client.retouched_photos_link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.teal, textDecoration: "none", wordBreak: "break-word" }}>{client.retouched_photos_link} ↗</a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
