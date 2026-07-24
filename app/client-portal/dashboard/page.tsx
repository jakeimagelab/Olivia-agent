"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  CircleCheck,
  FileText,
  Heart,
  Images,
  MessageCircle,
  PenLine,
  ShieldCheck,
} from "lucide-react";
import { usePortalSession } from "../_hooks/usePortalSession";
import {
  PortalCard,
  PortalError,
  PortalLoading,
  PortalPageShell,
  StatusBadge,
} from "../_components/PortalShell";
import PortalWorkflowProgress from "../_components/PortalWorkflowProgress";
import { getClientNextAction } from "@/lib/pcrm/clientWorkflow";

type DashboardData = {
  client: any;
  galleries: any[];
  revisions: any[];
  hasReview: boolean;
  per: any;
  events: any[];
  approvedSteps: any[];
  workflowRun: any;
  quotes: any[];
  contracts: any[];
  contiSaves: any[];
  publications: any[];
  activities: any[];
};

export default function PortalDashboard() {
  const { session, loading, error, token } = usePortalSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    if (!token || loading) return;
    const controller = new AbortController();
    fetch("/api/client-portal/dashboard", {
      headers: { "x-portal-token": token },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "프로젝트 정보를 불러오지 못했습니다.");
        setData(payload);
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setDataError(fetchError instanceof Error ? fetchError.message : "프로젝트 정보를 불러오지 못했습니다.");
      })
      .finally(() => setDataLoading(false));
    return () => controller.abort();
  }, [token, loading]);

  if (loading || dataLoading) return <PortalLoading />;
  if (error || dataError) return <PortalError message={error || dataError} />;
  if (!session || !data) return <PortalError message="세션 정보를 불러올 수 없습니다." />;

  const workflow = data.workflowRun;
  const nextAction = getClientNextAction(workflow?.current_step_key);
  const gallery = data.galleries?.[0];
  const resources = [
    ...data.quotes.map((item) => ({ id: item.id, type: "견적서", title: item.title || item.quote_number, artifactId: item.artifactId })),
    ...data.contracts.map((item) => ({ id: item.id, type: "계약서", title: item.quote_number || "프로젝트 계약서", artifactId: item.artifactId })),
    ...data.contiSaves.map((item) => ({ id: item.id, type: "콘티", title: item.title || "촬영 콘티", artifactId: null })),
  ].slice(0, 5);

  const openArtifact = async (artifactId: string) => {
    const response = await fetch(`/api/client-portal/artifact/${artifactId}`, {
      headers: { "x-portal-token": token },
    });
    const payload = await response.json();
    if (payload.ok && payload.url) window.open(payload.url, "_blank", "noopener,noreferrer");
  };

  return (
    <PortalPageShell session={session} active="홈">
      <main className="pcrm-client-dashboard">
        <section className="pcrm-client-hero">
          <div className="pcrm-client-identity">
            <span>PCRM · PROJECT</span>
            <div><h1>{session.clientName}</h1>{data.client?.specialty && <b>{data.client.specialty}</b>}</div>
            <p>담당 매니저 <strong>{session.managerName || "배정 중"}</strong></p>
          </div>
          <div className="pcrm-client-project-meta">
            <span>현재 프로젝트</span>
            <h2>{session.projectName}</h2>
            <p>{formatPeriod(workflow?.start_date, workflow?.expected_completion_date)}</p>
          </div>
          <div className="pcrm-client-current-state">
            <span>현재 상태</span>
            <StatusBadge status={session.currentStepName} />
            <small>최근 업데이트 {formatDate(workflow?.updated_at)}</small>
          </div>
        </section>

        <PortalCard className="pcrm-client-progress-card">
          <header><h2>진행 과정</h2><strong>{session.projectProgress}%</strong></header>
          <PortalWorkflowProgress currentStepKey={session.currentStepKey} completed={session.projectStatus === "completed"} />
        </PortalCard>

        <div className="pcrm-client-main-grid">
          <div className="pcrm-client-main-column">
            <PortalCard className="pcrm-client-approval-card">
              <header><h2>확인 및 승인 항목</h2><span>{data.approvedSteps.length + data.publications.length}건</span></header>
              {data.approvedSteps.length === 0 && data.publications.length === 0 ? (
                <div className="pcrm-client-empty">현재 확인이 필요한 공개 자료가 없습니다.</div>
              ) : (
                <div className="pcrm-client-list">
                  {data.publications.slice(0, 4).map((item) => (
                    <article key={item.id}>
                      <FileText size={17} />
                      <div><strong>{item.title || item.related_type}</strong><span>{item.description || "프로젝트 자료를 확인해 주세요."}</span></div>
                      <StatusBadge status={publicationLabel(item.status)} />
                    </article>
                  ))}
                  {data.approvedSteps.slice(0, 4).map((item) => (
                    <article key={item.id}>
                      <CircleCheck size={17} />
                      <div><strong>{item.stepName || item.title}</strong><span>{item.description || "담당자가 공개한 진행 결과입니다."}</span></div>
                      <StatusBadge status={item.status === "revision_requested" ? "수정 요청" : "공개"} />
                    </article>
                  ))}
                </div>
              )}
            </PortalCard>

            <PortalCard className="pcrm-client-resource-card">
              <header><h2>프로젝트 자료</h2><Link href="/client-portal/documents">문서함 전체 보기 <ChevronRight size={13} /></Link></header>
              {resources.length === 0 ? (
                <div className="pcrm-client-empty">아직 공개된 프로젝트 자료가 없습니다.</div>
              ) : resources.map((item) => (
                <article key={`${item.type}-${item.id}`}>
                  <span>{item.type}</span>
                  <strong>{item.title}</strong>
                  {item.artifactId
                    ? <button onClick={() => openArtifact(item.artifactId)}>파일 보기</button>
                    : <small>상세 화면에서 확인</small>}
                </article>
              ))}
            </PortalCard>

            {gallery && (
              <PortalCard className="pcrm-client-gallery-preview">
                <header><h2>최근 갤러리</h2><Link href="/client-portal/gallery">전체 보기 <ChevronRight size={13} /></Link></header>
                <div>
                  <Images size={28} />
                  <span><strong>{gallery.description || "프로젝트 갤러리"}</strong><small>촬영일 {formatDate(gallery.shoot_date)}</small></span>
                  {gallery.nas_link && <a href={gallery.nas_link} target="_blank" rel="noreferrer">갤러리 열기</a>}
                </div>
              </PortalCard>
            )}
          </div>

          <aside className="pcrm-client-side-column">
            <PortalCard className="pcrm-client-next-action">
              <header><span>오늘 해야 할 일</span><CircleCheck size={17} /></header>
              <h2>{nextAction.title}</h2>
              <Link href={nextAction.href}>지금 확인하기 <ChevronRight size={15} /></Link>
            </PortalCard>

            <PortalCard className="pcrm-client-note-card">
              <header><PenLine size={16} /><h2>담당자 메모</h2></header>
              <p>{workflow?.project_memo || data.client?.memo || "프로젝트 관련 안내는 이곳에 표시됩니다."}</p>
            </PortalCard>

            <PortalCard className="pcrm-client-schedule-card">
              <header><CalendarDays size={16} /><h2>촬영 일정</h2></header>
              <strong>{formatDate(workflow?.shoot_date)}</strong>
              <span>{workflow?.shooting_type || "상세 일정은 담당 매니저에게 문의해 주세요."}</span>
            </PortalCard>

            <PortalCard className="pcrm-client-link-stack">
              <Link href="/client-portal/revision"><PenLine size={16} /><span><strong>수정 요청</strong>결과물 의견 남기기</span><ChevronRight size={14} /></Link>
              <Link href="/client-portal/review"><Heart size={16} /><span><strong>리뷰</strong>프로젝트 경험 작성</span><ChevronRight size={14} /></Link>
              <Link href="/client-portal/per"><ShieldCheck size={16} /><span><strong>PER 포인트</strong>{(data.per?.available_points ?? 0).toLocaleString()}P 사용 가능</span><ChevronRight size={14} /></Link>
              <a href={`mailto:${data.client?.email || ""}`}><MessageCircle size={16} /><span><strong>문의하기</strong>담당자에게 문의 남기기</span><ChevronRight size={14} /></a>
            </PortalCard>
          </aside>
        </div>
      </main>
    </PortalPageShell>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "일정 미정";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatPeriod(start?: string | null, end?: string | null) {
  if (!start && !end) return "프로젝트 기간 미정";
  return `${formatDate(start)} ~ ${formatDate(end)}`;
}

function publicationLabel(status: string) {
  const labels: Record<string, string> = {
    published: "확인 필요",
    viewed: "열람",
    revision_requested: "수정 요청",
    approved: "승인 완료",
    completed: "완료",
  };
  return labels[status] || status;
}
