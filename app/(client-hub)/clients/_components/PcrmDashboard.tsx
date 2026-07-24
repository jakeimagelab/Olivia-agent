"use client";

import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  FolderKanban,
  Hourglass,
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
  } | null;
  waiting_approval_count?: number;
  open_task_count?: number;
  next_action?: { label?: string; severity?: string } | null;
};

type Props = {
  clients: ClientRow[];
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

export default function PcrmDashboard({ clients, search, onSearch, deletingId, onOpen, onDelete, onCreate }: Props) {
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

  const summaries = [
    { label: "전체 고객", value: clients.length, Icon: UsersRound },
    { label: "진행 중 프로젝트", value: active.length, Icon: FolderKanban },
    { label: "고객 승인 대기", value: waitingApproval, Icon: Hourglass },
    { label: "관리자 작업 대기", value: openTasks, Icon: PenLine },
    { label: "이번 주 촬영", value: shoots.length, Icon: CalendarDays },
    { label: "완료 프로젝트", value: completed.length, Icon: CheckCircle2 },
  ];

  return (
    <div className="pcrm-dashboard">
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
        {summaries.map(({ label, value, Icon }) => (
          <article key={label} style={cardStyle}>
            <Icon size={25} strokeWidth={1.7} />
            <div><span>{label}</span><strong>{value.toLocaleString()}</strong></div>
          </article>
        ))}
      </section>

      <div className="pcrm-dashboard-grid">
        <section className="pcrm-project-panel" style={cardStyle}>
          <header>
            <div><h2>최근 프로젝트 현황</h2><span>고객과 프로젝트의 현재 단계를 확인하세요.</span></div>
            <b>{clients.length}개 고객</b>
          </header>
          <div className="pcrm-project-table">
            <div className="pcrm-project-row pcrm-project-row--head">
              <span>프로젝트명</span><span>고객명</span><span>단계</span><span>촬영 예정일</span><span>다음 업무</span><span />
            </div>
            {clients.slice(0, 8).map((client) => {
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
                  <span>{formatDate(run?.shoot_date)}</span>
                  <span>{client.next_action?.label || (run ? "프로젝트 상세 확인" : "프로젝트 생성")}</span>
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

        <aside className="pcrm-side-stack">
          <section style={cardStyle} className="pcrm-side-card">
            <header><h2>승인 대기 항목</h2><Hourglass size={17} /></header>
            {waitingApproval === 0 ? (
              <p className="pcrm-empty-copy">현재 고객 승인 대기 항목이 없습니다.</p>
            ) : active.filter((item) => (item.waiting_approval_count ?? 0) > 0).slice(0, 5).map((client) => (
              <button key={client.id} onClick={() => onOpen(client.id)}>
                <span>{client.name}<small>{client.active_run?.project_name}</small></span>
                <b>{client.waiting_approval_count}건</b>
              </button>
            ))}
          </section>

          <section style={cardStyle} className="pcrm-side-card">
            <header><h2>이번 주 촬영</h2><CalendarDays size={17} /></header>
            {shoots.length === 0 ? (
              <p className="pcrm-empty-copy">이번 주 등록된 촬영 일정이 없습니다.</p>
            ) : shoots.slice(0, 5).map((client) => (
              <button key={client.id} onClick={() => onOpen(client.id)}>
                <span>{client.name}<small>{client.active_run?.project_name}</small></span>
                <b>{formatDate(client.active_run?.shoot_date)}</b>
              </button>
            ))}
          </section>
        </aside>
      </div>

      <div className="pcrm-bottom-grid">
        <section style={cardStyle} className="pcrm-activity-card">
          <header><h2>최근 활동</h2><Clock3 size={17} /></header>
          {clients.slice(0, 5).map((client) => (
            <button key={client.id} onClick={() => onOpen(client.id)}>
              <CircleUserRound size={18} />
              <span><strong>{client.name}</strong>{client.next_action?.label || "고객 정보를 확인해 주세요."}</span>
              <small>{formatDate(client.created_at)}</small>
            </button>
          ))}
        </section>
        <section style={cardStyle} className="pcrm-guide-card">
          <span>PhotoClinic CRM</span>
          <h2>고객 등록 후 프로젝트를 생성하세요.</h2>
          <p>고객과 프로젝트를 분리해 한 병원의 여러 촬영·제작 프로젝트를 각각 관리할 수 있습니다.</p>
          <button type="button" onClick={onCreate}><Plus size={15} /> 새 고객 등록</button>
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
