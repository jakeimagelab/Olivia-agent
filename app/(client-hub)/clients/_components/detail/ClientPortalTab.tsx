"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Power, RefreshCcw } from "lucide-react";
import { C, R } from "@/lib/theme";
import { portalUrlFromToken } from "@/lib/clientPortalAccess";

const cardStyle: React.CSSProperties = { background: C.white, border: `1px solid ${C.border}`, borderRadius: R.lg, boxShadow: "0 5px 18px rgba(21,88,85,.055)" };

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ClientPortalTab({ clientId, workflowRunId }: { clientId: string; workflowRunId?: string }) {
  const [accesses, setAccesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workflowRunId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/client-portal/access?clientId=${clientId}&workflowRunId=${workflowRunId}`, { cache: "no-store" });
      const d = await res.json();
      if (d.ok) setAccesses(d.accesses || []);
    } finally {
      setLoading(false);
    }
  }, [clientId, workflowRunId]);

  useEffect(() => { void load(); }, [load]);

  const reissue = async () => {
    if (!workflowRunId) return;
    setBusy("reissue");
    try {
      const res = await fetch("/api/admin/client-portal/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, workflowRunId }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "재발급 실패");
      await load();
      window.alert("새 포털 링크를 발급했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "재발급 실패");
    } finally {
      setBusy(null);
    }
  };

  const setActive = async (id: string, isActive: boolean) => {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/client-portal/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "상태 변경 실패");
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "상태 변경 실패");
    } finally {
      setBusy(null);
    }
  };

  const changeExpiry = async (id: string, currentValue?: string | null) => {
    const input = window.prompt("새 만료일을 입력하세요 (YYYY-MM-DD)", currentValue ? currentValue.slice(0, 10) : "");
    if (!input) return;
    setBusy(id);
    try {
      const res = await fetch("/api/admin/client-portal/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tokenExpiresAt: new Date(`${input}T23:59:59`).toISOString() }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "만료일 변경 실패");
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "만료일 변경 실패");
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(portalUrlFromToken(token));
    window.alert("포털 링크를 복사했습니다.");
  };

  if (!workflowRunId) {
    return (
      <section className="pcrm-project-panel" style={cardStyle}>
        <header><div><h2>포털 관리</h2><span>먼저 프로젝트를 생성해야 포털 링크를 발급할 수 있습니다.</span></div></header>
        <p className="pcrm-empty-copy">연결된 프로젝트가 없습니다.</p>
      </section>
    );
  }

  return (
    <section className="pcrm-project-panel" style={cardStyle}>
      <header>
        <div><h2>포털 관리</h2><span>고객 포털 접근 링크를 생성·관리합니다.</span></div>
        <button type="button" className="pcrm-inline-action" disabled={busy === "reissue"} onClick={() => void reissue()}>
          <RefreshCcw size={13} /> 새 링크 발급
        </button>
      </header>
      <div className="pcrm-portal-list">
        {loading ? (
          <p className="pcrm-empty-copy">불러오는 중...</p>
        ) : accesses.length === 0 ? (
          <p className="pcrm-empty-copy">발급된 포털 링크가 없습니다. "새 링크 발급"을 눌러 생성하세요.</p>
        ) : accesses.map((access) => (
          <div key={access.id} className="pcrm-portal-row">
            <i data-state={access.is_active ? "done" : "empty"}>{access.is_active ? "활성" : "비활성"}</i>
            <div className="pcrm-portal-row__body">
              <strong>{portalUrlFromToken(access.access_token)}</strong>
              <span>생성 {formatDateTime(access.created_at)} · 만료 {formatDateTime(access.token_expires_at)} · 최근 접속 {formatDateTime(access.last_login_at)} · 접속 {access.access_count ?? 0}회</span>
            </div>
            <div className="pcrm-portal-row__actions">
              <button type="button" title="링크 복사" onClick={() => void copyLink(access.access_token)}><Copy size={13} /></button>
              <button type="button" title="포털 열기" onClick={() => window.open(portalUrlFromToken(access.access_token), "_blank", "noopener,noreferrer")}><ExternalLink size={13} /></button>
              <button type="button" title="만료일 변경" disabled={busy === access.id} onClick={() => void changeExpiry(access.id, access.token_expires_at)}>만료일</button>
              <button type="button" title={access.is_active ? "비활성화" : "활성화"} disabled={busy === access.id} onClick={() => void setActive(access.id, !access.is_active)}>
                <Power size={13} /> {access.is_active ? "비활성화" : "활성화"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
