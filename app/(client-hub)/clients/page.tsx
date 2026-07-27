"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ClipboardList, Copy, Download, Eye, MoreVertical, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ACTIVE_WORKFLOW_STEPS,
  STEP_NAME,
  WORKFLOW_STAGES,
  WORKFLOW_STEPS,
  getWorkflowDisplayStepKey,
} from "@/lib/workflow";
import { buildStepAppLink } from "@/lib/clientAppLinks";
import { avatarColor, avatarInitial } from "@/lib/pcrmAvatar";
import { getOrCreatePortalAccessToken, portalUrlFromToken } from "@/lib/clientPortalAccess";
import NextActionCard from "@/components/NextActionCard";
import PcrmDashboard from "./_components/PcrmDashboard";
import ClientFormModal from "./_components/ClientFormModal";
import NewPcrmProjectDialog from "./_components/NewPcrmProjectDialog";
import PcrmActivityTimeline from "./_components/PcrmActivityTimeline";
import PcrmCollaborationPanel from "./_components/PcrmCollaborationPanel";
import ClientOverviewTab from "./_components/detail/ClientOverviewTab";
import ClientScheduleTab from "./_components/detail/ClientScheduleTab";
import ClientRevisionsTab from "./_components/detail/ClientRevisionsTab";
import ClientPortalTab from "./_components/detail/ClientPortalTab";
import { C } from "@/lib/theme";
import OliviaProjectPanel from "@/components/olivia/OliviaProjectPanel";
import { formatArtifactSize, openWorkflowArtifact, type WorkflowArtifact } from "@/lib/workflowArtifacts";
import { useClientRoster } from "./_hooks/useClientRoster";

const STEP_INFO: Record<string, { icon: string; desc: string; href: string }> = {
  consult_meeting:   { icon: "🤝", desc: "병원 기본 정보 등록, 상담 내용 AI 분析",  href: "/consultation" },
  quote:             { icon: "📄", desc: "패키지 선택 및 PDF 견적서 자동 생성",      href: "/quote" },
  contract:          { icon: "✍️", desc: "계약서 생성 및 이메일 전달",               href: "/contract" },
  conti:             { icon: "🎬", desc: "AI 촬영 콘티 및 체크리스트 생성",          href: "/conti" },
  shooting:          { icon: "📸", desc: "촬영 당일 체크리스트 진행 및 완료 처리",   href: "/shooting" },
  payment_confirm:   { icon: "🧾", desc: "잔금 입금과 계산서 처리 상태를 수동 확인", href: "/clients" },
  backup_sorting:    { icon: "🗂️", desc: "RAW/JPG 자동 분류 및 백업 관리",          href: "/photo-sorting" },
  original_delivery: { icon: "📦", desc: "원본 파일 NAS 링크 생성 및 발송",          href: "/original-delivery" },
  client_selection:  { icon: "🖼️", desc: "원본 전달부터 고객 셀렉과 RAW 매칭까지 관리", href: "/select-galleries" },
  retouching:        { icon: "🎨", desc: "색감 보정 및 보정 가이드 작성",             href: "/photo-retouching" },
  revision:          { icon: "🔄", desc: "수정 요청 접수 및 알람 발송",               href: "/mailing" },
  seo_delivery:      { icon: "🔍", desc: "SEO 파일명·ALT·캡션·메타데이터 자동 생성", href: "/seo-delivery" },
  final_delivery:    { icon: "🚀", desc: "최종 파일 + 후기 요청 메일 발송",           href: "/delivery-mail" },
  review_content:    { icon: "⭐", desc: "후기 텍스트 → 리뷰컨텐츠 자동 변환",       href: "/review-studio" },
  reward:            { icon: "🎁", desc: "PER 포인트 자동 산출 및 적립",              href: "/per" },
  customer_care:     { icon: "💌", desc: "주기 알람 및 이벤트 메일 발송",             href: "/mailing" },
  content_planning:  { icon: "✏️", desc: "블로그 기반 콘텐츠 기획 및 작성",          href: "/content-writer" },
};

const DETAIL_TABS: { key: string; label: string }[] = [
  { key: "overview", label: "개요" },
  { key: "projects", label: "프로젝트" },
  { key: "documents", label: "문서" },
  { key: "schedule", label: "일정" },
  { key: "gallery", label: "갤러리" },
  { key: "revisions", label: "수정·승인" },
  { key: "activity", label: "활동 기록" },
  { key: "info", label: "고객 정보" },
  { key: "portal", label: "포털 관리" },
];

const PROMO_APPS = [
  { title: "아이디어 제안",    desc: "오늘의 홍보 콘텐츠 아이디어 AI 제안",   href: "/daily-ideas",      icon: "💡" },
  { title: "홍보 콘텐츠 제작", desc: "블로그·인스타 콘텐츠 클라이언트별 제작", href: "/sns-manager",      icon: "📢" },
  { title: "유튜브 콘텐츠 기획", desc: "URL 벤치마킹·스토리·썸네일 제작",      href: "/sns-manager?tab=youtube", icon: "▶️" },
  { title: "AI 추천 병원 역분석", desc: "반복 추천 병원군과 클라이언트 신뢰 격차 분석", href: "/ai-trust-gap", icon: "🛡️" },
  { title: "병원이미지 진단",  desc: "병원 현황 맞춤 사진 방향 AI 진단",      href: "/diagnosis",        icon: "🔬" },
  { title: "채널 분석",        desc: "인스타·홈페이지·블로그 함께 분析",      href: "/channel-analyzer", icon: "📊" },
  { title: "AI 이미지 제작",   desc: "실사 병원 이미지 AI 생성·디렉팅",      href: "/image-generator",  icon: "🎨" },
  { title: "홈페이지 제작",    desc: "병원 홈페이지 제작 기획 정리",          href: "/website-builder",  icon: "🌐" },
];

function fmtDot(value?: string | null) {
  if (!value) return "미정";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "미정";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function buildPromoAppHref(appHref: string, clientId: string, workflowRunId: string | undefined, stepKey: string) {
  const [path, query = ""] = appHref.split("?");
  const params = new URLSearchParams(query);
  params.set("clientId", clientId);
  params.set("client_id", clientId);
  if (workflowRunId) params.set("workflowRunId", workflowRunId);
  params.set("stepKey", stepKey);
  return `${path}?${params.toString()}`;
}

const MAIL_LABELS: Record<string, string> = {
  quote: "견적서", contract: "계약서", conti: "콘티", gallery: "갤러리",
  original_files: "원본파일", review_form: "후기폼", monthly_report: "리포트", shoot_reminder: "촬영알림",
};
const MAIL_COLOR: Record<string, string> = {
  draft: C.hint, ready: C.orange, sent: C.green, failed: "#DC2626",
};

const SHOOTING_DEFAULT = [
  "원장님 프로필 (단독)", "원장님 + 직원 단체사진",
  "진료실 / 시술실 공간", "대기실 / 로비 공간",
  "시술 연출 (협조 필요)", "의료 장비 / 기기",
  "외부 전경 / 간판",     "상품 / 패키지 이미지",
];

function stepBadgeColor(key: string) {
  const idx = WORKFLOW_STEPS.findIndex((s) => s.key === key);
  if (idx < 4) return C.orange;
  if (idx < 7) return "#7C3AED";
  if (idx < 11) return C.teal;
  return C.green;
}


export default function ClientsPage() {
  return (
    <Suspense fallback={<SpinBox />}>
      <ClientsInner />
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

function ClientsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");
  const workflowRunId = searchParams.get("workflowRunId");
  if (id) return <DetailView clientId={id} workflowRunId={workflowRunId} onBack={() => router.push("/clients")} />;
  if (workflowRunId) return <DetailView clientId="_by-workflow" workflowRunId={workflowRunId} onBack={() => router.push("/clients")} />;
  return <ListView openNewOnLoad={searchParams.get("new") === "1"} />;
}

/* ── LIST VIEW (대시보드 탭) ── */
function ListView({ openNewOnLoad = false }: { openNewOnLoad?: boolean }) {
  const router = useRouter();
  const {
    filtered, dashboard, loading, search, setSearch,
    formModal, openCreate, closeForm,
    projectDialogFor, setProjectDialogFor,
    deletingId, deleteClient, load,
  } = useClientRoster();

  useEffect(() => {
    if (openNewOnLoad) openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNewOnLoad]);

  return (
    <div style={{ color: C.txt }}>
      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "0 0 80px" }}>
        {loading ? <SpinBox /> : (
          <PcrmDashboard
            clients={filtered}
            dashboard={dashboard}
            search={search}
            onSearch={setSearch}
            deletingId={deletingId}
            onOpen={(clientId) => router.push(`/clients?id=${clientId}`)}
            onDelete={deleteClient}
            onCreate={openCreate}
          />
        )}
      </div>

      <ClientFormModal
        open={formModal !== null}
        mode={formModal?.mode ?? "create"}
        client={formModal?.client}
        onClose={closeForm}
        onSaved={(id) => { closeForm(); void load(false); router.push(`/clients?id=${id}`); }}
        onSavedAndNewProject={(id) => {
          closeForm();
          void load(false);
          const created = filtered.find((c) => c.id === id);
          setProjectDialogFor({ id, name: created?.name || "" });
        }}
      />
      {projectDialogFor && (
        <NewPcrmProjectDialog
          clientId={projectDialogFor.id}
          clientName={projectDialogFor.name}
          onClose={() => setProjectDialogFor(null)}
          onCreated={(workflowRunId) => {
            setProjectDialogFor(null);
            router.push(`/clients?id=${encodeURIComponent(projectDialogFor.id)}&workflowRunId=${encodeURIComponent(workflowRunId)}`);
          }}
        />
      )}
    </div>
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
  const [openStepKey, setOpenStepKey] = useState<string | null>(null);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [linkCopyBusy, setLinkCopyBusy] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

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

  useEffect(() => {
    if (!pageData?.client) return;
    const params = new URLSearchParams({ clientId: pageData.client.id, hospitalName: pageData.client.name || pageData.client.hospital_name || "" });
    if (pageData.workflowRun?.id) params.set("workflowRunId", pageData.workflowRun.id);
    fetch(`/api/admin/pcrm/client-summary?${params.toString()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((d) => { if (d.ok) setSummary(d.summary); })
      .catch(() => {});
  }, [pageData?.client?.id, pageData?.workflowRun?.id]);

  if (loading) return <SpinBox />;
  if (!pageData?.client) return (
    <div style={{ padding: "60px 24px", textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>❌</div>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{loadError || "고객을 찾을 수 없습니다."}</div>
      {loadError && <div style={{ fontSize: 12, color: C.hint, marginBottom: 12 }}>잠시 후 다시 시도하거나 관리자에게 문의해주세요.</div>}
      <button onClick={onBack} style={{ height: 40, padding: "0 20px", background: C.teal, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>← 목록으로</button>
    </div>
  );

  const { client, workflowRun, quotes = [], contracts = [], artifacts = [], activities = [] } = pageData;
  const workflowCompleted = workflowRun?.status === "completed";
  const currentStepKey = workflowCompleted
    ? ACTIVE_WORKFLOW_STEPS[ACTIVE_WORKFLOW_STEPS.length - 1].key
    : workflowRun?.current_step_key || ACTIVE_WORKFLOW_STEPS[0].key;
  const displayStepKey = getWorkflowDisplayStepKey(currentStepKey) || ACTIVE_WORKFLOW_STEPS[0].key;
  const currentIdx = ACTIVE_WORKFLOW_STEPS.findIndex((s) => s.key === displayStepKey);
  const progressStep = workflowCompleted ? ACTIVE_WORKFLOW_STEPS.length : Math.max(currentIdx + 1, 1);

  const workflowStepDef = WORKFLOW_STEPS.find((s) => s.key === displayStepKey);
  const currentStageKey = workflowCompleted ? WORKFLOW_STAGES[WORKFLOW_STAGES.length - 1].key : (workflowStepDef?.stage || WORKFLOW_STAGES[0].key);
  const currentStageIdx = Math.max(0, WORKFLOW_STAGES.findIndex((s) => s.key === currentStageKey));
  const stageDisplayName: Record<string, string> = { data_sharing: "데이터·보정", feedback_done: "납품·완료" };
  const activeTabLabel = DETAIL_TABS.find((t) => t.key === activeTab)?.label || "개요";

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
          <button onClick={openClientPreview} disabled={previewLoading} className="pc-btn pc-btn--secondary pc-btn--sm">
            <Eye size={13} /> {previewLoading ? "준비 중..." : "고객 포털 보기"}
          </button>
          <button onClick={copyPortalLink} disabled={linkCopyBusy} className="pc-btn pc-btn--ghost pc-btn--sm">
            <Copy size={13} /> {linkCopyBusy ? "복사 중..." : "링크 복사"}
          </button>
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

      <div className="pcrm-stage-stepper" aria-label="프로젝트 진행 단계">
        {WORKFLOW_STAGES.map((stage, i) => {
          const state = i < currentStageIdx ? "done" : i === currentStageIdx ? "current" : "pending";
          return (
            <div className="pcrm-stage-stepper__step" key={stage.key}>
              <span className="pcrm-stage-stepper__circle" data-state={state}>{state === "pending" ? stage.order : <Check size={16} />}</span>
              <div className="pcrm-stage-stepper__text">
                <b>{stage.order} {stageDisplayName[stage.key] || stage.name}</b>
                <small data-state={state}>{state === "done" ? "완료" : state === "current" ? "현재 단계" : "대기"}</small>
              </div>
              {i < WORKFLOW_STAGES.length - 1 && <span className="pcrm-stage-stepper__line" data-filled={i < currentStageIdx} />}
            </div>
          );
        })}
      </div>

      <NextActionCard client={client} workflowRun={workflowRun} stepIcon={STEP_INFO[displayStepKey]?.icon} stepDescription={STEP_INFO[displayStepKey]?.desc} onRefresh={load} />

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

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "14px 16px 80px", display: "grid", gridTemplateColumns: "1fr", gap: 14, alignItems: "start" }}>

        {activeTab === "overview" && (
          <ClientOverviewTab client={client} workflowRun={workflowRun} artifacts={artifacts} activities={activities} onRefresh={load} onNavigateTab={setActiveTab} />
        )}

        {activeTab === "projects" && (
          <>
            {pageData.workflowRuns?.length > 1 && (
              <nav aria-label="프로젝트 실행 선택" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
                {pageData.workflowRuns.map((run: any) => {
                  const active = run.id === workflowRun?.id;
                  return (
                    <Link key={run.id} href={`/clients?id=${encodeURIComponent(clientId)}&workflowRunId=${encodeURIComponent(run.id)}`}
                      style={{ flexShrink: 0, padding: "9px 13px", borderRadius: 10, textDecoration: "none", border: `1px solid ${active ? C.orange : C.border}`, background: active ? `${C.orange}10` : C.white, color: active ? C.orange : C.muted, fontSize: 12, fontWeight: 800 }}>
                      {run.run_kind === "additional_shooting" ? "추가 촬영 · " : "기본 · "}{run.project_name || "촬영 프로젝트"}
                    </Link>
                  );
                })}
              </nav>
            )}
            {pageData.workflowRuns?.length === 0 && (
              <div style={{ padding: "22px", border: `1px dashed ${C.border}`, borderRadius: 12, background: C.mint, textAlign: "center" }}>
                <strong style={{ display: "block", color: C.teal, fontSize: 14 }}>아직 프로젝트가 없습니다.</strong>
                <span style={{ display: "block", marginTop: 5, color: C.muted, fontSize: 11 }}>고객 정보는 저장되었습니다. 실제 업무를 시작할 프로젝트를 생성해 주세요.</span>
                <button onClick={() => setShowProjectDialog(true)} style={{ marginTop: 12, height: 40, padding: "0 18px", border: 0, borderRadius: 9, background: C.orange, color: "#fff", fontFamily: "inherit", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>새 프로젝트 생성</button>
              </div>
            )}
            <div className="pc-workflow-phase-bar" aria-label="프로젝트 4스테이지 진행 상태">
              {WORKFLOW_STAGES.map((stage, index) => {
                const stageSteps = ACTIVE_WORKFLOW_STEPS.filter((step) => step.stage === stage.key);
                const stageStart = ACTIVE_WORKFLOW_STEPS.findIndex((step) => step.key === stageSteps[0]?.key);
                const stageEnd = stageStart + stageSteps.length - 1;
                const isDone = workflowCompleted || currentIdx > stageEnd;
                const isCurrent = !workflowCompleted && currentIdx >= stageStart && currentIdx <= stageEnd;
                return (
                  <div key={stage.key} className={`pc-workflow-phase ${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`} style={{ "--phase-color": stage.color } as React.CSSProperties}>
                    <span>{isDone ? "✓" : String(index + 1).padStart(2, "0")}</span>
                    <div><strong>{stage.name}</strong><small>{stageSteps.length}단계</small></div>
                  </div>
                );
              })}
            </div>

            <OliviaProjectPanel workflowRunId={workflowRun?.id}/>

            <section className="pc-smart-timeline" aria-labelledby="smart-timeline-title">
              <header className="pc-smart-timeline__header">
                <div>
                  <span>SMART TIMELINE</span>
                  <h2 id="smart-timeline-title">프로젝트 전체 진행</h2>
                  <p>완료 단계는 접어두고, 현재 단계의 실행 도구와 다음 액션을 바로 보여줍니다.</p>
                </div>
                <strong>{progressStep} / {ACTIVE_WORKFLOW_STEPS.length}</strong>
              </header>
              <div className="pc-smart-timeline__list">
                {ACTIVE_WORKFLOW_STEPS.map((step, idx) => {
                  const isDone = workflowCompleted || idx < currentIdx;
                  const isCurrent = !workflowCompleted && step.key === displayStepKey;
                  const isOpenHere = openStepKey ? step.key === openStepKey : isCurrent;
                  return (
                    <article
                      key={step.key}
                      className={`pc-smart-timeline__item ${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""} ${isDone ? "pc-smart-timeline__item--clickable" : ""}`}
                      onClick={isDone ? () => setOpenStepKey((prev) => (prev === step.key ? null : step.key)) : undefined}
                      role={isDone ? "button" : undefined}
                      tabIndex={isDone ? 0 : undefined}
                    >
                      <div className="pc-smart-timeline__rail">
                        <span>{isDone ? "✓" : idx + 1}</span>
                        {idx < ACTIVE_WORKFLOW_STEPS.length - 1 && <i/>}
                      </div>
                      <div className="pc-smart-timeline__content">
                        <div className="pc-smart-timeline__summary">
                          <div>
                            <small>{WORKFLOW_STAGES.find((stage) => stage.key === step.stage)?.name}</small>
                            <strong>{STEP_NAME[step.key] || step.key}</strong>
                          </div>
                          <b>{isDone ? "완료" : isCurrent ? "현재 단계" : "대기"}</b>
                        </div>
                        {isOpenHere && (
                          <div className="pc-smart-timeline__action" onClick={(e) => e.stopPropagation()}>
                            <StepPanel
                              key={step.key}
                              selectedStepKey={step.key}
                              currentStepKey={displayStepKey}
                              currentIdx={currentIdx}
                              client={client}
                              workflowRun={workflowRun}
                              onAdvance={load}
                              onRevert={() => { setOpenStepKey(null); load(); }}
                              clientId={clientId}
                            />
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <div>
              <div style={{ fontSize: 11, fontWeight: 900, color: C.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12, paddingLeft: 2 }}>
                📢 홍보 콘텐츠 앱
              </div>
              <div className="pc-promo-app-grid">
                {PROMO_APPS.map((app) => (
                  <Link key={app.href} href={buildPromoAppHref(app.href, clientId, workflowRun?.id, currentStepKey)}
                    className="pc-promo-app-card">
                    <span className="pc-promo-app-icon" aria-hidden="true">{app.icon}</span>
                    <div>
                      <div className="pc-promo-app-title">{app.title}</div>
                      <div className="pc-promo-app-description">{app.desc}</div>
                    </div>
                    <span className="pc-promo-app-action">열기 <i aria-hidden="true">→</i></span>
                  </Link>
                ))}
              </div>
            </div>
          </>
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
  const [form, setForm] = useState({ nasLink: "", shootDate: "", description: "" });
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
          client_id: clientId || null,
          workflow_run_id: workflowRunId || null,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      setForm({ nasLink: "", shootDate: "", description: "" });
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
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="촬영 내용 메모" style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none", fontFamily: "inherit", color: C.txt, background: C.white }} />
          </div>
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

/* ── STEP PANEL (인라인 전환) ── */
type SPProps = {
  selectedStepKey: string;
  currentStepKey: string;
  currentIdx: number;
  client: any;
  workflowRun: any;
  onAdvance: () => void;
  onRevert?: () => void;
  clientId: string;
};

function StepPanel({ selectedStepKey, currentStepKey, currentIdx, client, workflowRun, onAdvance, onRevert, clientId }: SPProps) {
  const selectedIdx = ACTIVE_WORKFLOW_STEPS.findIndex((s) => s.key === selectedStepKey);
  const isCurrent = selectedStepKey === currentStepKey;
  const [reverting, setReverting] = useState(false);
  const [revertMsg, setRevertMsg] = useState("");

  const revertToThisStep = async () => {
    if (!workflowRun?.id) return;
    if (!window.confirm(`정말 "${STEP_NAME[selectedStepKey] || selectedStepKey}" 단계로 되돌릴까요? 이후 진행된 단계는 다시 진행해야 합니다.`)) return;
    setReverting(true);
    setRevertMsg("");
    try {
      const res = await fetch("/api/workflow/revert-step", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_run_id: workflowRun.id, to_step_key: selectedStepKey }),
      });
      const d = await res.json();
      if (d.ok) onRevert?.();
      else setRevertMsg(d.error || "되돌리기에 실패했습니다.");
    } finally {
      setReverting(false);
    }
  };
  const isDone = selectedIdx < currentIdx;
  const info = STEP_INFO[selectedStepKey] ?? { icon: "📌", desc: "", href: "/" };
  const nextStepKey = ACTIVE_WORKFLOW_STEPS[selectedIdx + 1]?.key;
  const nextStepName = nextStepKey ? (STEP_NAME[nextStepKey] || nextStepKey) : null;

  const [advancing, setAdvancing] = useState(false);
  const [advMsg, setAdvMsg] = useState("");
  const [nasLink, setNasLink] = useState("");
  const [fileCount, setFileCount] = useState("");
  const [checklist, setChecklist] = useState(SHOOTING_DEFAULT.map((item) => ({ item, done: false })));
  const [notes, setNotes] = useState("");
  // final_delivery 전용
  const [finalNasLink, setFinalNasLink] = useState("");
  const [finalFileCount, setFinalFileCount] = useState("");
  const [finalPackage, setFinalPackage] = useState("");

  const advance = async (toKey: string) => {
    if (!workflowRun?.id) return;
    setAdvancing(true);
    const payload: Record<string, unknown> = { workflow_run_id: workflowRun.id, to_step_key: toKey };
    // 최종 전달 완료 시 배송 데이터 전달
    if (selectedStepKey === "final_delivery" && toKey === "revision" && finalNasLink) {
      payload.deliveryData = { nasLink: finalNasLink, fileCount: finalFileCount, packageName: finalPackage };
    }
    const res = await fetch("/api/workflow/advance", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (d.ok) {
      if (d.automated && d.action === "final_delivery_queued") {
        setAdvMsg("✅ 보정본 배송 메일이 메일링함에 자동 등록됐습니다.");
        setTimeout(() => { setAdvMsg(""); onAdvance(); }, 2000);
      } else {
        onAdvance();
      }
    } else {
      setAdvMsg(d.error || "오류가 발생했습니다.");
    }
    setAdvancing(false);
  };

  const completeWithReward = async () => {
    if (!workflowRun?.id) return;
    setAdvancing(true);
    setAdvMsg("");
    try {
      const res = await fetch("/api/workflow/run-current-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowRunId: workflowRun.id }),
      });
      const d = await res.json();
      setAdvMsg(d.ok ? "✅ 공급가 기준 1% 리워드를 적립하고 최종 완료 처리를 시작했습니다." : d.error || "최종 완료 처리에 실패했습니다.");
      if (d.ok) setTimeout(onAdvance, 900);
    } finally {
      setAdvancing(false);
    }
  };

  const toggleCheck = (idx: number) =>
    setChecklist((prev) => prev.map((c, i) => (i === idx ? { ...c, done: !c.done } : c)));

  const headerBg = isCurrent ? C.teal : isDone ? "#F0FDF8" : "rgba(21,88,85,.03)";
  const headerTxt = isCurrent ? "#fff" : C.teal;
  const checkDone = checklist.filter((c) => c.done).length;

  return (
    <div style={{
      background: C.white, borderRadius: 14, overflow: "hidden", marginBottom: 16,
      border: `1.5px solid ${isCurrent ? C.teal : isDone ? "rgba(34,135,106,.3)" : C.border}`,
    }}>
      {/* 헤더 */}
      <div style={{ padding: "14px 20px", background: headerBg, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 26 }}>{info.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: headerTxt, lineHeight: 1.2 }}>
                Step {selectedIdx + 1} · {STEP_NAME[selectedStepKey] || selectedStepKey}
              </div>
              <div style={{ fontSize: 11, color: isCurrent ? "rgba(255,255,255,.7)" : C.muted, marginTop: 3 }}>{info.desc}</div>
            </div>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 800, padding: "4px 12px", borderRadius: 99, flexShrink: 0,
            background: isCurrent ? "rgba(255,255,255,.2)" : isDone ? "rgba(34,135,106,.12)" : C.light,
            color: isCurrent ? "#fff" : isDone ? C.green : C.muted,
            border: isCurrent ? "1px solid rgba(255,255,255,.3)" : "none",
          }}>
            {isCurrent ? "▶ 진행 중" : isDone ? "✓ 완료" : "대기 중"}
          </span>
        </div>
      </div>

      {/* 바디 */}
      <div style={{ padding: "20px" }}>

        {/* ── 완료된 단계 ── */}
        {isDone && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ fontSize: 13, color: C.muted }}>이 단계는 완료됐습니다. 앱에서 내용을 재확인할 수 있습니다.</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href={buildStepAppLink({ stepKey: selectedStepKey, clientId, workflowRunId: workflowRun?.id })}
                  style={{ padding: "8px 18px", background: C.light, color: C.teal, borderRadius: 8, fontSize: 12, fontWeight: 800, textDecoration: "none", border: `1px solid rgba(21,88,85,.2)` }}>
                  {STEP_NAME[selectedStepKey]} 앱 열기 →
                </Link>
                {!isCurrent && (
                  <button type="button" onClick={revertToThisStep} disabled={reverting}
                    style={{ padding: "8px 18px", background: "#FFF0EB", color: C.orange, borderRadius: 8, fontSize: 12, fontWeight: 800, border: `1px solid rgba(232,93,44,.25)`, cursor: reverting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {reverting ? "되돌리는 중..." : "↩ 이 단계로 되돌리기"}
                  </button>
                )}
              </div>
            </div>
            {revertMsg && <div style={{ marginTop: 10, fontSize: 12, color: C.orange, fontWeight: 700 }}>{revertMsg}</div>}
          </div>
        )}

        {/* ── 대기 중인 단계 ── */}
        {!isCurrent && !isDone && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>아직 이 단계에 도달하지 않았습니다.</div>
              <div style={{ fontSize: 11, color: C.hint }}>현재 단계: {STEP_NAME[currentStepKey]}</div>
            </div>
            <Link href={buildStepAppLink({ stepKey: selectedStepKey, clientId, workflowRunId: workflowRun?.id })}
              style={{ padding: "8px 18px", background: "rgba(21,88,85,.04)", color: C.muted, borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: "none", border: `1px solid ${C.border}` }}>
              미리 열기
            </Link>
          </div>
        )}

        {/* ── 현재 진행 단계 ── */}
        {isCurrent && (
          <>
            {/* 촬영 — 인라인 체크리스트 */}
            {selectedStepKey === "shooting" && (
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", background: "rgba(21,88,85,.04)", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>촬영 체크리스트</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: checkDone === checklist.length ? C.green : C.muted }}>{checkDone}/{checklist.length}</span>
                  </div>
                  <div style={{ padding: "6px" }}>
                    {checklist.map((item, idx) => (
                      <label key={idx} onClick={() => toggleCheck(idx)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px", borderRadius: 6, cursor: "pointer", background: item.done ? C.light : "transparent" }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `2px solid ${item.done ? C.green : C.border}`, background: item.done ? C.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {item.done && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 12, color: item.done ? C.muted : C.txt, textDecoration: item.done ? "line-through" : "none" }}>{item.item}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 2 }}>촬영 현장 메모</div>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={7}
                    placeholder="특이사항, 추가 요청, 컷 수 등"
                    style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "inherit", resize: "none", outline: "none", color: C.txt, boxSizing: "border-box", flex: 1 }} />
                </div>
              </div>
            )}

            {/* 원본 전달 — NAS 링크 인라인 */}
            {selectedStepKey === "original_delivery" && (
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>NAS 공유 링크</label>
                  <input value={nasLink} onChange={(e) => setNasLink(e.target.value)} placeholder="https://nas.example.com/share/..."
                    style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit", outline: "none", color: C.txt, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>파일 수량</label>
                  <input value={fileCount} onChange={(e) => setFileCount(e.target.value)} placeholder="예: RAW 324컷 / JPG 324컷"
                    style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit", outline: "none", color: C.txt, boxSizing: "border-box" }} />
                </div>
              </div>
            )}

            {/* 상담/미팅 — 고객 정보 요약 */}
            {selectedStepKey === "consult_meeting" && (
              <div style={{ background: C.light, borderRadius: 10, padding: "14px 18px", marginBottom: 18, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                {[
                  ["병원이름", client.name], ["원장이름", client.director_name],
                  ["진료과", client.department], ["의료진 수", client.doctor_count ? `${client.doctor_count}명` : null],
                  ["주요 시술", client.main_treatments], ["특이사항", client.special_notes],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label as string}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, color: C.txt, fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 최종 전달 — 배송 정보 + 자동 메일 */}
            {selectedStepKey === "final_delivery" && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ background: "#FFF8F5", border: `1px solid ${C.orange}30`, borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.orange, marginBottom: 10 }}>
                    ✉️ 완료 시 보정본 배송 메일이 자동으로 메일링함에 등록됩니다
                  </div>
                  <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>NAS 공유 링크 *</label>
                      <input value={finalNasLink} onChange={(e) => setFinalNasLink(e.target.value)} placeholder="https://nas.example.com/share/..."
                        style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit", outline: "none", color: C.txt, boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>전달 수량</label>
                      <input value={finalFileCount} onChange={(e) => setFinalFileCount(e.target.value)} placeholder="예: 85"
                        style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit", outline: "none", color: C.txt, boxSizing: "border-box" }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 }}>폴더 구성 (패키지명)</label>
                    <input value={finalPackage} onChange={(e) => setFinalPackage(e.target.value)} placeholder="예: 프리미엄 패키지 : 프로필, 연출, 인테리어"
                      style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit", outline: "none", color: C.txt, boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>
            )}

            {/* 고객 셀렉 단계 */}
            {selectedStepKey === "client_selection" && (
              <SelectionStepPanel clientId={clientId} workflowRunId={workflowRun?.id} />
            )}

            {/* RAW 매칭 단계 */}
            {selectedStepKey === "raw_matching" && (
              <RawMatchingStepPanel clientId={clientId} workflowRunId={workflowRun?.id} />
            )}

            {/* 보정 단계 — 갤러리 등록 버튼 추가 */}
            {selectedStepKey === "retouching" && (
              <div style={{ marginBottom: 18, display: "grid", gap: 10 }}>
                <div style={{ padding: "14px 18px", background: C.light, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ fontSize: 13, color: C.teal, lineHeight: 1.6 }}>
                    <strong>{client.name}</strong>의 <strong>색감 보정</strong> 단계를 진행하세요.
                  </div>
                  <Link href={buildStepAppLink({ stepKey: selectedStepKey, clientId, workflowRunId: workflowRun?.id })}
                    style={{ padding: "10px 22px", background: C.white, color: C.teal, borderRadius: 8, fontSize: 13, fontWeight: 800, textDecoration: "none", border: `1.5px solid ${C.teal}`, whiteSpace: "nowrap" }}>
                    보정 앱 열기 →
                  </Link>
                </div>
                <div style={{ padding: "14px 18px", background: "#FFF8F5", borderRadius: 10, border: `1px solid ${C.orange}30`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: C.orange, marginBottom: 4 }}>🎉 보정 완료 후 갤러리 등록</div>
                    <div style={{ fontSize: 11, color: C.muted }}>저장 시 메일 draft 자동 생성 + 다음 단계로 자동 전진</div>
                  </div>
                  <Link href={`/gallery?client_id=${clientId}${workflowRun?.id ? `&workflow_run_id=${workflowRun.id}` : ""}`}
                    style={{ padding: "10px 22px", background: C.orange, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 900, textDecoration: "none", whiteSpace: "nowrap" }}>
                    📷 갤러리 등록 (보정 완료) →
                  </Link>
                </div>
              </div>
            )}

            {/* 기본 단계 — 설명 + 앱 링크 */}
            {!["shooting", "original_delivery", "consult_meeting", "final_delivery", "client_selection", "raw_matching", "retouching"].includes(selectedStepKey) && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18, padding: "14px 18px", background: C.light, borderRadius: 10 }}>
                <div style={{ fontSize: 13, color: C.teal, lineHeight: 1.6 }}>
                  <strong>{client.name}</strong>의 <strong>{STEP_NAME[selectedStepKey]}</strong> 단계를 진행하세요.
                </div>
                <Link href={buildStepAppLink({ stepKey: selectedStepKey, clientId, workflowRunId: workflowRun?.id })}
                  style={{ padding: "10px 22px", background: C.white, color: C.teal, borderRadius: 8, fontSize: 13, fontWeight: 800, textDecoration: "none", border: `1.5px solid ${C.teal}`, whiteSpace: "nowrap" }}>
                  전체 앱에서 열기 →
                </Link>
              </div>
            )}

            {/* 완료 버튼 */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              {advMsg && <div style={{ fontSize: 12, color: C.orange, width: "100%" }}>{advMsg}</div>}
              {nextStepKey ? (
                <>
                  <span style={{ fontSize: 11, color: C.hint }}>완료 후 다음 단계: <strong style={{ color: C.teal }}>{nextStepName}</strong></span>
                  <button onClick={() => advance(nextStepKey)} disabled={advancing}
                    style={{ height: 42, padding: "0 24px", background: advancing ? C.hint : C.green, color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 900, cursor: advancing ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {advancing ? "처리 중..." : `✓ 완료 → ${nextStepName}`}
                  </button>
                </>
              ) : (
                selectedStepKey === "reward" ? (
                  <>
                    <span style={{ fontSize: 11, color: C.hint }}>완료 시 공급가 기준 1% PER 포인트가 중복 없이 적립됩니다.</span>
                    <button onClick={completeWithReward} disabled={advancing}
                      style={{ height: 42, padding: "0 24px", background: advancing ? C.hint : C.orange, color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 900, cursor: advancing ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {advancing ? "처리 중..." : "✓ 최종 완료 · 1% 리워드 적립"}
                    </button>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>🎉 12단계 모두 완료! 워크플로우가 마무리됐습니다.</div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── INFO PANEL ── */
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

/* ── 셀렉 단계 인라인 패널 ── */
function SelectionStepPanel({ clientId, workflowRunId }: { clientId: string; workflowRunId?: string }) {
  const [gallery, setGallery] = useState<any>(null);
  const [selection, setSelection] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    // workflowRunId 우선, 없으면 clientId 기준 최신
    const qs = workflowRunId ? `workflowRunId=${workflowRunId}` : `clientId=${clientId}`;
    fetch(`/api/select-galleries?${qs}`)
      .then(r => r.json())
      .then(async d => {
        let g = d.ok && d.galleries.length > 0 ? d.galleries[0] : null;
        // workflowRunId로 못 찾았으면 clientId로 재조회
        if (!g && workflowRunId) {
          const d2 = await fetch(`/api/select-galleries?clientId=${clientId}`).then(r => r.json());
          g = d2.ok && d2.galleries.length > 0 ? d2.galleries[0] : null;
        }
        if (g) {
          setGallery(g);
          if (["selection_submitted", "raw_matched", "raw_matching"].includes(g.status)) {
            fetch(`/api/select-galleries/${g.id}`)
              .then(r => r.json())
              .then(d3 => { if (d3.ok) setSelection(d3.selection); });
          }
        }
      })
      .finally(() => setLoading(false));
  }, [clientId, workflowRunId]);

  const params = new URLSearchParams();
  params.set("clientId", clientId);
  if (workflowRunId) params.set("workflowRunId", workflowRunId);
  params.set("stepKey", "client_selection");

  if (loading) return <div style={{ fontSize: 13, color: C.muted, padding: "10px 0", marginBottom: 18 }}>셀렉 갤러리 확인 중...</div>;

  return (
    <div style={{ background: C.light, borderRadius: 10, padding: "14px 18px", marginBottom: 18 }}>
      {gallery ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.teal, marginBottom: 8 }}>📸 셀렉 갤러리 연결됨</div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.muted, flexWrap: "wrap", marginBottom: 10 }}>
            <span>상태: <strong style={{ color: C.txt }}>{gallery.status}</strong></span>
            <span>이미지: <strong>{gallery.total_jpg_count}장</strong></span>
            {gallery.selected_count > 0 && <span style={{ color: C.green, fontWeight: 700 }}>선택 완료 {gallery.selected_count}장</span>}
          </div>
          {selection?.customer_memo && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400E", marginBottom: 10 }}>
              💬 {selection.customer_memo}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
          연결된 셀렉 갤러리가 없습니다. 사진 분류 완료 후 갤러리를 생성하세요.
        </div>
      )}
      <Link href={`/select-galleries?${params.toString()}`}
        style={{ display: "inline-block", padding: "9px 20px", background: C.teal, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
        셀렉 갤러리 열기 →
      </Link>
    </div>
  );
}

/* ── RAW 매칭 단계 인라인 패널 ── */
function RawMatchingStepPanel({ clientId, workflowRunId }: { clientId: string; workflowRunId?: string }) {
  const [gallery, setGallery] = useState<any>(null);
  const [selection, setSelection] = useState<any>(null);
  const [rawMatches, setRawMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    const qs = workflowRunId ? `workflowRunId=${workflowRunId}` : `clientId=${clientId}`;
    fetch(`/api/select-galleries?${qs}`)
      .then(r => r.json())
      .then(async d => {
        let g = d.ok && d.galleries.length > 0 ? d.galleries[0] : null;
        if (!g && workflowRunId) {
          const d2 = await fetch(`/api/select-galleries?clientId=${clientId}`).then(r => r.json());
          g = d2.ok && d2.galleries.length > 0 ? d2.galleries[0] : null;
        }
        if (g) {
          setGallery(g);
          fetch(`/api/select-galleries/${g.id}`)
            .then(r => r.json())
            .then(d3 => {
              if (d3.ok) { setSelection(d3.selection); setRawMatches(d3.rawMatches ?? []); }
            });
        }
      })
      .finally(() => setLoading(false));
  }, [clientId]);

  const params = new URLSearchParams();
  params.set("clientId", clientId);
  if (workflowRunId) params.set("workflowRunId", workflowRunId);
  params.set("stepKey", "raw_matching");

  if (loading) return <div style={{ fontSize: 13, color: C.muted, padding: "10px 0", marginBottom: 18 }}>데이터 로딩 중...</div>;

  const matchedCount = rawMatches.filter(m => m.status === "matched").length;
  const missingCount = rawMatches.filter(m => m.status === "raw_missing").length;
  const isMatched = rawMatches.length > 0;

  return (
    <div style={{ background: C.light, borderRadius: 10, padding: "14px 18px", marginBottom: 18 }}>
      {selection ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.teal, marginBottom: 8 }}>
            {isMatched ? "✅ RAW 매칭 완료" : "⏳ 고객 선택 완료 — RAW 매칭 대기 중"}
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ color: C.green, fontWeight: 700 }}>선택 {selection.selected_count}장</span>
            {isMatched && <span style={{ color: C.green, fontWeight: 700 }}>RAW 매칭 {matchedCount}장</span>}
            {isMatched && missingCount > 0 && <span style={{ color: "#DC2626", fontWeight: 700 }}>누락 {missingCount}장</span>}
          </div>
          {selection.customer_memo && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400E", marginBottom: 10 }}>
              💬 {selection.customer_memo}
            </div>
          )}
          {!isMatched && (
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
              선택 파일명:&nbsp;
              {selection.selected_files.slice(0, 5).join(", ")}
              {selection.selected_files.length > 5 ? ` 외 ${selection.selected_files.length - 5}개` : ""}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>고객이 아직 사진을 선택하지 않았습니다.</div>
      )}
      <Link href={gallery ? `/select-galleries/${gallery.id}?${params.toString()}` : `/select-galleries?${params.toString()}`}
        style={{ display: "inline-block", padding: "9px 20px", background: C.teal, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
        {isMatched ? "RAW 매칭 리포트 보기 →" : "RAW 자동 매칭 시작 →"}
      </Link>
    </div>
  );
}
