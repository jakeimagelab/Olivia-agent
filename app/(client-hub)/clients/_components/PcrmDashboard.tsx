"use client";

import { useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FolderKanban,
  Hourglass,
  MessageCircle,
  PenLine,
  Plus,
  Search,
  Trash2,
  UsersRound,
} from "lucide-react";
import { C, R } from "@/lib/theme";
import { STEP_NAME } from "@/lib/workflow";

type ClientRow = {
  id: string;
  name: string;
  manager_name?: string;
  department?: string;
  created_at?: string;
  active_run?: {
    id: string;
    project_name?: string;
    current_step_key?: string;
    status?: string;
    shoot_date?: string | null;
    manager_name?: string;
    updated_at?: string;
  } | null;
  waiting_approval_count?: number;
  open_task_count?: number;
  next_action?: { label?: string; severity?: string } | null;
};

type DashboardSummary = {
  newClientsThisWeek: number;
  newActiveProjectsThisWeek: number;
  completedThisMonth: number;
  newApprovalsLast24h: number;
  newTasksLast24h: number;
  pendingApprovalsByType: { type: string; label: string; count: number }[];
  todaySchedule: { id: string; title: string; category?: string; time?: string | null; location?: string | null }[];
  recentActivity: { id: string; clientName: string; actionType: string; title: string; createdAt: string }[];
  recentInquiries: { id: string; clientId: string; clientName: string; title: string; preview: string; status: string; lastMessageAt: string }[];
  perPoints: { available: number; earnedThisMonth: number; usedThisMonth: number };
};

type Props = {
  clients: ClientRow[];
  dashboard: DashboardSummary | null;
  search: string;
  onSearch: (value: string) => void;
  deletingId: string | null;
  onOpen: (clientId: string) => void;
  onDelete: (event: React.MouseEvent, clientId: string, clientName: string) => void;
  onCreate: () => void;
};

const cardStyle: React.CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: R.lg,
  boxShadow: "0 5px 18px rgba(21,88,85,.055)",
};

const TABS: { key: "all" | "active" | "waiting" | "upcoming" | "done"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "active", label: "진행 중" },
  { key: "waiting", label: "승인 대기" },
  { key: "upcoming", label: "촬영 예정" },
  { key: "done", label: "완료" },
];

const CALENDAR_CATEGORY_LABEL: Record<string, string> = {
  shooting: "촬영", client: "고객", admin: "행정", personal: "개인", general: "기타",
};

const PROJECT_PAGE_SIZE = 4;

export default function PcrmDashboard({ clients, dashboard, search, onSearch, deletingId, onOpen, onDelete, onCreate }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [projectPage, setProjectPage] = useState(1);

  const active = clients.filter((client) => client.active_run?.status === "active");
  const completed = clients.filter((client) => client.active_run?.status === "completed");
  const waitingApproval = clients.reduce((sum, client) => sum + (client.waiting_approval_count ?? 0), 0);
  const openTasks = clients.reduce((sum, client) => sum + (client.open_task_count ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const shoots = clients.filter((client) => {
    const date = client.active_run?.shoot_date;
    return !!date && date >= today && date <= weekEnd;
  });
  const weekRangeLabel = `${formatDate(today)} ~ ${formatDate(weekEnd)}`;

  const summaries = [
    { label: "전체 고객", value: clients.length, Icon: UsersRound, delta: dashboard ? `+${dashboard.newClientsThisWeek} (이번 주)` : undefined },
    { label: "진행 중 프로젝트", value: active.length, Icon: FolderKanban, delta: dashboard ? `+${dashboard.newActiveProjectsThisWeek} (이번 주)` : undefined },
    { label: "고객 승인 대기", value: waitingApproval, Icon: Hourglass, delta: dashboard ? `+${dashboard.newApprovalsLast24h} (어제 대비)` : undefined },
    { label: "관리자 작업 대기", value: openTasks, Icon: PenLine, delta: dashboard ? `+${dashboard.newTasksLast24h} (어제 대비)` : undefined },
    { label: "이번 주 촬영", value: shoots.length, Icon: CalendarDays, delta: weekRangeLabel },
    { label: "완료 프로젝트", value: completed.length, Icon: CheckCircle2, delta: dashboard ? `+${dashboard.completedThisMonth} (이번 달)` : undefined },
  ];

  const tabbedClients = clients.filter((client) => {
    if (tab === "active") return client.active_run?.status === "active";
    if (tab === "waiting") return (client.waiting_approval_count ?? 0) > 0;
    if (tab === "upcoming") {
      const date = client.active_run?.shoot_date;
      return !!date && date >= today;
    }
    if (tab === "done") return client.active_run?.status === "completed";
    return true;
  });

  const totalProjectPages = Math.max(1, Math.ceil(tabbedClients.length / PROJECT_PAGE_SIZE));
  const currentProjectPage = Math.min(projectPage, totalProjectPages);
  const pagedClients = tabbedClients.slice(
    (currentProjectPage - 1) * PROJECT_PAGE_SIZE,
    currentProjectPage * PROJECT_PAGE_SIZE,
  );

  const changeTab = (nextTab: (typeof TABS)[number]["key"]) => {
    setTab(nextTab);
    setProjectPage(1);
  };

  return (
    <div className="pcrm-dashboard pcrm-home-dashboard">
      <div className="pcrm-dashboard-title">
        <div>
          <span>PCRM · PHOTOCLINIC CRM</span>
          <h1>관리자 대시보드</h1>
        </div>
        <div className="pcrm-dashboard-actions">
          <label>
            <Search size={15} />
            <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="병원명 · 진료과 검색" />
          </label>
          <button type="button" onClick={onCreate}><Plus size={16} /> 고객 등록</button>
        </div>
      </div>

      <section className="pcrm-summary-grid" aria-label="PCRM 주요 현황">
        {summaries.map(({ label, value, Icon, delta }) => (
          <article key={label} style={cardStyle}>
            <Icon size={25} strokeWidth={1.7} />
            <div>
              <span>{label}</span>
              <strong>{value.toLocaleString()}</strong>
              {delta && <small>{delta}</small>}
            </div>
          </article>
        ))}
      </section>

      <div className="pcrm-dashboard-grid">
        <section className="pcrm-project-panel" style={cardStyle}>
          <header>
            <div><h2>최근 프로젝트 현황</h2><span>고객과 프로젝트의 현재 단계를 확인하세요.</span></div>
            <div className="pcrm-project-panel-meta">
              <b>{tabbedClients.length}개 고객</b>
              {totalProjectPages > 1 && (
                <div className="pcrm-project-pager">
                  <button
                    type="button"
                    className="is-arrow"
                    disabled={currentProjectPage <= 1}
                    aria-label="이전 페이지"
                    onClick={() => setProjectPage((p) => Math.max(1, p - 1))}
                  ><ChevronLeft size={14} /></button>
                  <span>{currentProjectPage} / {totalProjectPages}</span>
                  <button
                    type="button"
                    className="is-arrow"
                    disabled={currentProjectPage >= totalProjectPages}
                    aria-label="다음 페이지"
                    onClick={() => setProjectPage((p) => Math.min(totalProjectPages, p + 1))}
                  ><ChevronRight size={14} /></button>
                </div>
              )}
            </div>
          </header>
          <div className="pcrm-project-tabs" role="tablist" aria-label="프로젝트 상태 필터">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} data-active={tab === t.key} onClick={() => changeTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="pcrm-project-table">
            <div className="pcrm-project-row pcrm-project-row--head">
              <span>프로젝트명</span><span>고객명</span><span>단계</span><span>담당 매니저</span><span>촬영 예정일</span><span>최근 활동</span><span className="pcrm-row-actions" />
            </div>
            {tabbedClients.length === 0 ? (
              <p className="pcrm-empty-copy">해당 조건의 프로젝트가 없습니다.</p>
            ) : pagedClients.map((client) => {
              const run = client.active_run;
              const completedProject = run?.status === "completed";
              const stepLabel = completedProject
                ? "완료"
                : run?.current_step_key
                  ? STEP_NAME[run.current_step_key] ?? run.current_step_key
                  : "프로젝트 미생성";
              return (
                <div
                  key={client.id}
                  className="pcrm-project-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(client.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") onOpen(client.id);
                  }}
                >
                  <span><FolderKanban size={15} />{run?.project_name || "새 프로젝트가 필요합니다"}</span>
                  <span>{client.name}<small>{client.department || "진료과 미등록"}</small></span>
                  <span><i data-state={completedProject ? "done" : run ? "active" : "empty"}>{stepLabel}</i></span>
                  <span>{run?.manager_name || "—"}</span>
                  <span>{formatDate(run?.shoot_date)}</span>
                  <span>{timeAgo(run?.updated_at)}</span>
                  <span className="pcrm-row-actions">
                    <button
                      type="button"
                      aria-label={`${client.name} 삭제`}
                      disabled={deletingId === client.id}
                      onClick={(event) => onDelete(event, client.id, client.name)}
                    ><Trash2 size={14} /></button>
                    <ChevronRight size={15} />
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section style={cardStyle} className="pcrm-side-card">
          <header><h2>승인 대기 항목</h2><Hourglass size={17} /></header>
          {!dashboard || dashboard.pendingApprovalsByType.length === 0 ? (
            <p className="pcrm-empty-copy">현재 승인 대기 항목이 없습니다.</p>
          ) : dashboard.pendingApprovalsByType.slice(0, 4).map((item) => (
            <button key={item.type} type="button" onClick={() => changeTab("waiting")}>
              <span>{item.label}</span>
              <b>{item.count}건</b>
            </button>
          ))}
        </section>

        <section style={cardStyle} className="pcrm-side-card">
          <header><h2>오늘의 일정</h2><CalendarDays size={17} /></header>
          {!dashboard || dashboard.todaySchedule.length === 0 ? (
            <p className="pcrm-empty-copy">오늘 등록된 일정이 없습니다.</p>
          ) : dashboard.todaySchedule.slice(0, 4).map((item) => (
            <button key={item.id} type="button" onClick={() => { window.location.href = "/calendar"; }}>
              <span>{item.title}<small>{CALENDAR_CATEGORY_LABEL[item.category ?? "general"] ?? item.category}</small></span>
              <b>{item.time ? item.time.slice(0, 5) : "종일"}</b>
            </button>
          ))}
        </section>
      </div>

      <div className="pcrm-bottom-grid">
        <section style={cardStyle} className="pcrm-activity-card">
          <header><h2>최근 활동</h2><Clock3 size={17} /></header>
          {!dashboard || dashboard.recentActivity.length === 0 ? (
            <p className="pcrm-empty-copy">최근 활동이 없습니다.</p>
          ) : dashboard.recentActivity.slice(0, 4).map((item) => {
            const tag = activityTag(item.actionType);
            return (
              <div key={item.id} className="pcrm-activity-row">
                <span className={`pcrm-activity-tag pcrm-activity-tag--${tag.tone}`}>{tag.label}</span>
                <span className="pcrm-activity-text"><strong>{item.clientName}</strong>{item.title}</span>
                <small>{timeAgo(item.createdAt)}</small>
              </div>
            );
          })}
        </section>

        <section style={cardStyle} className="pcrm-inquiry-card">
          <header><h2>최근 문의/메시지</h2><MessageCircle size={17} /></header>
          {!dashboard || dashboard.recentInquiries.length === 0 ? (
            <p className="pcrm-empty-copy">최근 문의가 없습니다.</p>
          ) : dashboard.recentInquiries.slice(0, 3).map((item) => (
            <button key={item.id} type="button" onClick={() => onOpen(item.clientId)}>
              <span className="pcrm-inquiry-avatar">{item.clientName.slice(0, 1) || "?"}</span>
              <span className="pcrm-inquiry-body"><strong>{item.clientName}</strong><em>{item.preview}</em></span>
              <small>{timeAgo(item.lastMessageAt)}</small>
            </button>
          ))}
        </section>

        <section style={cardStyle} className="pcrm-per-card">
          <header><h2>PER 포인트 현황</h2></header>
          <div className="pcrm-per-balance">
            <span>사용 가능한 포인트</span>
            <strong>{(dashboard?.perPoints.available ?? 0).toLocaleString()}P</strong>
            <a href="/per">포인트 내역 보기 →</a>
          </div>
          <div className="pcrm-per-stats">
            <div><span>이번 달 적립</span><b className="is-plus">+{(dashboard?.perPoints.earnedThisMonth ?? 0).toLocaleString()}P</b></div>
            <div><span>이번 달 사용</span><b className="is-minus">-{(dashboard?.perPoints.usedThisMonth ?? 0).toLocaleString()}P</b></div>
          </div>
        </section>
      </div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

function timeAgo(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return formatDate(value);
}

function activityTag(actionType: string): { label: string; tone: "approve" | "feedback" | "access" | "upload" | "default" } {
  if (actionType.includes("approved") || actionType.includes("advance")) return { label: "승인", tone: "approve" };
  if (actionType.includes("revision") || actionType.includes("feedback")) return { label: "피드백", tone: "feedback" };
  if (actionType.includes("viewed")) return { label: "접속", tone: "access" };
  if (actionType.includes("attachment") || actionType.includes("submitted") || actionType.includes("upload")) return { label: "업로드", tone: "upload" };
  if (actionType.includes("created")) return { label: "생성", tone: "default" };
  return { label: "활동", tone: "default" };
}
