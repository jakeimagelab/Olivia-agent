"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Copy,
  Download,
  Eye,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { C, R } from "@/lib/theme";
import { getOrCreatePortalAccessToken, portalUrlFromToken } from "@/lib/clientPortalAccess";

type ClientRow = {
  id: string;
  name: string;
  manager_name?: string;
  director_name?: string;
  department?: string;
  phone?: string;
  email?: string;
  created_at?: string;
  manager_staff?: string;
  portal_status?: "connected" | "inactive" | "none";
  active_project_count?: number;
  waiting_approval_count?: number;
  active_run?: {
    id: string;
    status?: string;
    shoot_date?: string | null;
    current_step_key?: string;
    updated_at?: string;
    project_name?: string;
  } | null;
};

type Props = {
  clients: ClientRow[];
  deletingId: string | null;
  onOpen: (clientId: string) => void;
  onEdit: (client: ClientRow) => void;
  onDelete: (event: React.MouseEvent, clientId: string, clientName: string) => void;
  onCreate: () => void;
  onNewProject: (client: ClientRow) => void;
};

const cardStyle: React.CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: R.lg,
  boxShadow: "0 5px 18px rgba(21,88,85,.055)",
};

const PORTAL_LABEL: Record<string, string> = { connected: "포털 연결됨", inactive: "연결 해제", none: "연결 대기" };
const PORTAL_TONE: Record<string, string> = { connected: "done", inactive: "empty", none: "empty" };

const ALL_COLUMNS = [
  { key: "director", label: "원장명" },
  { key: "manager", label: "담당자" },
  { key: "phone", label: "연락처" },
  { key: "department", label: "진료과" },
  { key: "projects", label: "진행중 프로젝트" },
  { key: "stage", label: "현재 단계" },
  { key: "approval", label: "승인 대기" },
  { key: "shoot", label: "촬영 예정일" },
  { key: "portal", label: "포털 상태" },
  { key: "activity", label: "최근 활동" },
] as const;

type ColumnKey = (typeof ALL_COLUMNS)[number]["key"];

function stageLabel(client: ClientRow) {
  const run = client.active_run;
  if (!run) return { label: "기획 단계", tone: "empty" };
  if (run.status === "completed") return { label: "촬영 완료", tone: "done" };
  const key = run.current_step_key || "";
  if (["consult_meeting", "quote", "contract"].includes(key)) return { label: "상담 진행 중", tone: "consult" };
  if (["conti", "shooting"].includes(key)) return { label: "촬영 진행 중", tone: "shoot" };
  if (["backup_sorting", "original_delivery", "client_selection", "retouching", "revision"].includes(key)) return { label: "수정 진행 중", tone: "revision" };
  return { label: "납품 진행 중", tone: "delivery" };
}

const AVATAR_COLORS = ["#e85d2c", "#155855", "#2f5fd6", "#7c3aed", "#c9581a", "#15805f", "#c0388a"];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem("pcrm_client_favorites") || "[]"));
    } catch {
      return new Set();
    }
  });
  const toggle = (id: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      window.localStorage.setItem("pcrm_client_favorites", JSON.stringify(Array.from(next)));
      return next;
    });
  };
  return { favorites, toggle };
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function timeAgo(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return formatDate(value);
}

function toCsvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(clients: ClientRow[]) {
  const header = ["병원명", "원장명", "담당자", "연락처", "이메일", "진료과", "담당 매니저", "현재 단계", "촬영 예정일", "포털 상태"];
  const rows = clients.map((c) => [
    c.name, c.director_name || "", c.manager_name || "", c.phone || "", c.email || "",
    c.department || "", c.manager_staff || "", stageLabel(c).label, formatDate(c.active_run?.shoot_date), PORTAL_LABEL[c.portal_status || "none"],
  ]);
  const csv = [header, ...rows].map((row) => row.map((cell) => toCsvCell(String(cell))).join(",")).join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `고객목록_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function RowMenu({ client, onOpen, onEdit, onDelete, onNewProject }: {
  client: ClientRow;
  onOpen: (id: string) => void;
  onEdit: (client: ClientRow) => void;
  onDelete: (event: React.MouseEvent, id: string, name: string) => void;
  onNewProject: (client: ClientRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const withPortalToken = async (mode: "open" | "copy") => {
    if (!client.active_run?.id) {
      window.alert("먼저 프로젝트를 생성해야 고객 포털을 열 수 있습니다.");
      return;
    }
    setBusy(true);
    try {
      const token = await getOrCreatePortalAccessToken(client.id, client.active_run.id);
      const url = portalUrlFromToken(token);
      if (mode === "open") window.open(url, "_blank", "noopener,noreferrer");
      else {
        await navigator.clipboard.writeText(url);
        window.alert("포털 링크를 복사했습니다.");
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "포털 링크를 가져오지 못했습니다.");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div className="pcrm-row-menu" ref={rootRef}>
      <button type="button" className="pcrm-row-menu__trigger" aria-label="관리" onClick={(event) => { event.stopPropagation(); setOpen((v) => !v); }}>
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="pcrm-row-menu__scrim" onClick={(event) => { event.stopPropagation(); setOpen(false); }} />
          <div className="pcrm-row-menu__panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => { setOpen(false); onOpen(client.id); }}><Eye size={13} /> 상세 보기</button>
            <button type="button" onClick={() => { setOpen(false); onEdit(client); }}><Pencil size={13} /> 수정</button>
            <button type="button" onClick={() => { setOpen(false); onNewProject(client); }}><FolderPlus size={13} /> 새 프로젝트 생성</button>
            <button type="button" disabled={busy} onClick={() => void withPortalToken("open")}><Eye size={13} /> 고객 포털 보기</button>
            <button type="button" disabled={busy} onClick={() => void withPortalToken("copy")}><Copy size={13} /> 링크 복사</button>
            <button type="button" className="is-danger" onClick={(event) => { setOpen(false); onDelete(event, client.id, client.name); }}><Trash2 size={13} /> 보관</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function PcrmClientTable({ clients, deletingId, onOpen, onEdit, onDelete, onCreate, onNewProject }: Props) {
  const [search, setSearch] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [portalFilter, setPortalFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(ALL_COLUMNS.map((c) => c.key)));
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);

  const managers = useMemo(() => Array.from(new Set(clients.map((c) => c.manager_staff).filter(Boolean))) as string[], [clients]);
  const specialties = useMemo(() => Array.from(new Set(clients.map((c) => c.department).filter(Boolean))) as string[], [clients]);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (search) {
        const haystack = `${c.name} ${c.director_name || ""} ${c.manager_name || ""}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      if (managerFilter && c.manager_staff !== managerFilter) return false;
      if (specialtyFilter && c.department !== specialtyFilter) return false;
      if (portalFilter && (c.portal_status || "none") !== portalFilter) return false;
      if (statusFilter) {
        const status = c.active_run?.status || "none";
        if (statusFilter !== status) return false;
      }
      return true;
    });
  }, [clients, search, managerFilter, specialtyFilter, portalFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const resetFilters = () => {
    setSearch(""); setManagerFilter(""); setStatusFilter(""); setSpecialtyFilter(""); setPortalFilter(""); setPage(1);
  };

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const isVisible = (key: ColumnKey) => visibleColumns.has(key);

  return (
    <div className="pcrm-dashboard">
      <div className="pcrm-dashboard-title">
        <div>
          <span>PCRM · PHOTOCLINIC CRM</span>
          <h1>고객 관리</h1>
          <small style={{ display: "block", marginTop: 4, fontSize: 11, fontWeight: 700, color: C.muted }}>
            등록된 병원 고객 정보를 관리하고 프로젝트 진행 현황을 확인할 수 있습니다.
          </small>
        </div>
        <div className="pcrm-dashboard-actions">
          <button type="button" onClick={onCreate}><Plus size={16} /> 고객 등록</button>
        </div>
      </div>

      <section className="pcrm-filter-bar" style={cardStyle} aria-label="고객 검색·필터">
        <label className="pcrm-filter-search">
          <Search size={15} />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="병원명 · 원장명 · 담당자명 검색" />
        </label>
        <select value={managerFilter} onChange={(event) => { setManagerFilter(event.target.value); setPage(1); }}>
          <option value="">담당 매니저 전체</option>
          {managers.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
          <option value="">프로젝트 상태 전체</option>
          <option value="active">진행 중</option>
          <option value="completed">완료</option>
          <option value="paused">일시 중지</option>
          <option value="none">미생성</option>
        </select>
        <select value={specialtyFilter} onChange={(event) => { setSpecialtyFilter(event.target.value); setPage(1); }}>
          <option value="">진료과 전체</option>
          {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={portalFilter} onChange={(event) => { setPortalFilter(event.target.value); setPage(1); }}>
          <option value="">포털 상태 전체</option>
          <option value="connected">포털 연결됨</option>
          <option value="inactive">연결 해제</option>
          <option value="none">연결 대기</option>
        </select>
        <button type="button" className="pcrm-filter-reset" onClick={resetFilters}>초기화</button>
      </section>

      <section className="pcrm-project-panel" style={cardStyle}>
        <header>
          <div><h2>고객 목록</h2><span>행을 클릭하면 고객 상세로 이동합니다.</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <b>전체 {filtered.length.toLocaleString()}건</b>
            <button type="button" className="pcrm-inline-action" onClick={() => downloadCsv(filtered)}><Download size={13} /> 엑셀 다운로드</button>
            <div style={{ position: "relative" }}>
              <button type="button" className="pcrm-inline-action" onClick={() => setColumnMenuOpen((v) => !v)}>컬럼 설정 <ChevronDown size={12} /></button>
              {columnMenuOpen && (
                <>
                  <div className="pcrm-row-menu__scrim" onClick={() => setColumnMenuOpen(false)} />
                  <div className="pcrm-column-menu">
                    {ALL_COLUMNS.map((col) => (
                      <label key={col.key}>
                        <input type="checkbox" checked={isVisible(col.key)} onChange={() => toggleColumn(col.key)} />
                        {col.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <div className="pcrm-project-table pcrm-roster-table pcrm-roster-table--wide">
          <div className="pcrm-project-row pcrm-project-row--head">
            <span>병원명</span>
            {isVisible("director") && <span>원장명</span>}
            {isVisible("manager") && <span>담당자</span>}
            {isVisible("phone") && <span>연락처</span>}
            {isVisible("department") && <span>진료과</span>}
            {isVisible("projects") && <span>진행중</span>}
            {isVisible("stage") && <span>현재 단계</span>}
            {isVisible("approval") && <span>승인 대기</span>}
            {isVisible("shoot") && <span>촬영 예정일</span>}
            {isVisible("portal") && <span>포털 상태</span>}
            {isVisible("activity") && <span>최근 활동</span>}
            <span />
          </div>
          {paged.length === 0 ? (
            <p className="pcrm-empty-copy">조건에 맞는 고객이 없습니다.</p>
          ) : paged.map((client) => {
            const stage = stageLabel(client);
            return (
              <div
                key={client.id}
                className="pcrm-project-row"
                role="button"
                tabIndex={0}
                onClick={() => onOpen(client.id)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(client.id); }}
              >
                <span><UsersRound size={15} />{client.name}</span>
                {isVisible("director") && <span>{client.director_name || "—"}</span>}
                {isVisible("manager") && <span>{client.manager_name || "—"}</span>}
                {isVisible("phone") && <span>{client.phone || "—"}</span>}
                {isVisible("department") && <span>{client.department || "—"}</span>}
                {isVisible("projects") && <span>{client.active_project_count ?? 0}개</span>}
                {isVisible("stage") && <span><i data-state={stage.tone}>{stage.label}</i></span>}
                {isVisible("approval") && <span>{client.waiting_approval_count ? `${client.waiting_approval_count}건` : "—"}</span>}
                {isVisible("shoot") && <span>{formatDate(client.active_run?.shoot_date)}</span>}
                {isVisible("portal") && <span><i data-state={PORTAL_TONE[client.portal_status || "none"]}>{PORTAL_LABEL[client.portal_status || "none"]}</i></span>}
                {isVisible("activity") && <span>{timeAgo(client.active_run?.updated_at)}</span>}
                <span className="pcrm-row-actions" onClick={(event) => event.stopPropagation()}>
                  <RowMenu client={client} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} onNewProject={onNewProject} />
                </span>
              </div>
            );
          })}
        </div>
        <footer className="pcrm-pagination">
          <div className="pcrm-pagination__size">
            <span>페이지당</span>
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
              <option value={20}>20개</option>
              <option value={50}>50개</option>
              <option value={100}>100개</option>
            </select>
          </div>
          <div className="pcrm-pagination__nav">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>이전</button>
            <span>{currentPage} / {totalPages}</span>
            <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>다음</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
