"use client";

import { Plus, Search, Trash2 } from "lucide-react";
import { C, R } from "@/lib/theme";
import { avatarColor, avatarInitial } from "@/lib/pcrmAvatar";

function relativeTime(iso?: string | null): string {
  if (!iso) return "";
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

// 왼쪽 고객 리스트 — 검색/선택/현재상태/최근활동/담당자 확인용으로 단순화한다
// (요청서 2장). 상세 정보 편집 등은 계속 기존 /clients?id= 화면에서 한다.
export default function ClientListPanel({
  clients,
  loading,
  search,
  onSearch,
  selectedClientId,
  onSelect,
  onCreate,
  deletingId,
  onDelete,
}: {
  clients: any[];
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  selectedClientId: string | null;
  onSelect: (clientId: string) => void;
  onCreate: () => void;
  deletingId: string | null;
  onDelete: (event: React.MouseEvent, id: string, name: string) => void;
}) {
  return (
    <div className="pc-card pc-card--padded" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ position: "relative", marginBottom: 10, flexShrink: 0 }}>
        <Search size={14} color={C.hint} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="병원명, 원장명, 담당자명으로 검색하세요."
          style={{ width: "100%", boxSizing: "border-box", height: 36, borderRadius: R.md, border: `1px solid ${C.border}`, padding: "0 10px 0 32px", fontSize: 12.5 }}
        />
      </div>

      <button
        type="button"
        onClick={onCreate}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 36, marginBottom: 10, flexShrink: 0,
          borderRadius: R.md, border: `1px dashed ${C.border}`, background: "transparent", color: C.teal, fontSize: 12, fontWeight: 800, cursor: "pointer",
        }}
      >
        <Plus size={14} />고객 등록
      </button>

      <div style={{ fontSize: 10.5, color: C.hint, marginBottom: 6, flexShrink: 0 }}>전체 {clients.length}건</div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {loading ? (
          <p style={{ fontSize: 12, color: C.hint, textAlign: "center", padding: "20px 0" }}>불러오는 중...</p>
        ) : clients.length === 0 ? (
          <p style={{ fontSize: 12, color: C.hint, textAlign: "center", padding: "20px 0" }}>조건에 맞는 고객이 없습니다.</p>
        ) : (
          clients.map((client) => {
            const active = client.id === selectedClientId;
            const managerName = client.active_run?.manager_name || client.manager_name || "";
            return (
              <div
                key={client.id}
                onClick={() => onSelect(client.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(client.id); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px", borderRadius: R.md, cursor: "pointer",
                  border: `1.5px solid ${active ? C.teal : "transparent"}`, background: active ? C.mint : "#fff",
                }}
              >
                <span style={{
                  width: 32, height: 32, borderRadius: R.sm, flexShrink: 0, background: avatarColor(client.name),
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800,
                }}>
                  {avatarInitial(client.name)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client.name}</div>
                  <div style={{ fontSize: 10.5, color: C.hint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {managerName ? `${managerName} · ` : ""}프로젝트 {client.active_project_count ?? 0}개
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: C.hint }}>{relativeTime(client.active_run?.updated_at || client.created_at)}</span>
                  <button
                    type="button"
                    onClick={(e) => onDelete(e, client.id, client.name)}
                    disabled={deletingId === client.id}
                    aria-label="삭제"
                    style={{ border: "none", background: "transparent", color: C.hint, cursor: "pointer", padding: 2, display: "flex" }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
