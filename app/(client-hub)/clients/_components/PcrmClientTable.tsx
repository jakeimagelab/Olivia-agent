"use client";

import { ChevronRight, Plus, Search, Trash2, UsersRound } from "lucide-react";
import { C, R } from "@/lib/theme";

type ClientRow = {
  id: string;
  name: string;
  manager_name?: string;
  department?: string;
  phone?: string;
  email?: string;
  created_at?: string;
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

export default function PcrmClientTable({ clients, search, onSearch, deletingId, onOpen, onDelete, onCreate }: Props) {
  return (
    <div className="pcrm-dashboard">
      <div className="pcrm-dashboard-title">
        <div>
          <span>PCRM · PHOTOCLINIC CRM</span>
          <h1>고객 관리</h1>
        </div>
        <div className="pcrm-dashboard-actions">
          <label>
            <Search size={15} />
            <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="병원명 · 진료과 검색" />
          </label>
          <button type="button" onClick={onCreate}><Plus size={16} /> 고객 등록</button>
        </div>
      </div>

      <section className="pcrm-project-panel" style={cardStyle}>
        <header>
          <div><h2>전체 고객</h2><span>등록된 모든 고객의 기본 정보를 확인하세요.</span></div>
          <b>{clients.length}개 고객</b>
        </header>
        <div className="pcrm-project-table pcrm-roster-table">
          <div className="pcrm-project-row pcrm-project-row--head">
            <span>병원명</span><span>담당자</span><span>연락처</span><span>이메일</span><span>진료과</span><span>등록일</span><span />
          </div>
          {clients.length === 0 ? (
            <p className="pcrm-empty-copy">등록된 고객이 없습니다.</p>
          ) : clients.map((client) => (
            <div
              key={client.id}
              className="pcrm-project-row"
              role="button"
              tabIndex={0}
              onClick={() => onOpen(client.id)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(client.id); }}
            >
              <span><UsersRound size={15} />{client.name}</span>
              <span>{client.manager_name || "—"}</span>
              <span>{client.phone || "—"}</span>
              <span>{client.email || "—"}</span>
              <span>{client.department || "—"}</span>
              <span>{formatDate(client.created_at)}</span>
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
          ))}
        </div>
      </section>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}
