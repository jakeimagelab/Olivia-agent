"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, MoreVertical } from "lucide-react";
import { C, R } from "@/lib/theme";
import { PUBLICATION_TYPE_LABEL, type PublicationType } from "@/lib/clientWorkspace/publications";
import type { WorkspacePortal } from "@/lib/clientWorkspace/types";

// compact=true: 2열 단순화(2026-08-09)에서 만든 한 줄 요약(URL+복사+열기+···메뉴).
// compact=false(기본): 3열 복귀(2026-08-10)의 전체 버전(URL행 + 진행 현황 + 공개 항목 배지).
export default function PortalManagementPanel({
  clientId,
  portal,
  onRefresh,
  compact = false,
}: {
  clientId: string;
  portal: WorkspacePortal | null;
  onRefresh: () => void;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const copyUrl = async () => {
    if (!portal) return;
    await navigator.clipboard.writeText(portal.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const ensurePortal = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/clients/${clientId}/portal/ensure`, { method: "POST" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "포털 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const revokeShare = async () => {
    if (!window.confirm("이 고객의 포털 접근을 중지할까요?\n\n포털 URL 자체는 유지되지만 고객은 더 이상 접근할 수 없습니다.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/clients/${clientId}/portal/revoke`, { method: "POST" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "공유 끊기에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    return (
      <div className="pc-card pc-card--padded">
        {error ? <p style={{ fontSize: 11.5, color: C.danger, marginBottom: 8 }}>{error}</p> : null}

        {!portal ? (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 8 }}>고객 포털 <span style={{ color: C.hint, fontWeight: 700 }}>● 미생성</span></div>
            <div style={{ textAlign: "center", padding: "10px 4px 4px" }}>
              <p style={{ fontSize: 11.5, color: C.hint, marginBottom: 10 }}>포털이 아직 생성되지 않았습니다.</p>
              <button type="button" onClick={ensurePortal} disabled={busy}
                style={{ height: 34, padding: "0 14px", borderRadius: R.md, border: "none", background: C.teal, color: "#fff", fontSize: 12, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer" }}>
                {busy ? "생성 중..." : "포털 생성"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 8 }}>고객 포털 <span style={{ color: C.teal, fontWeight: 700 }}>● 연결됨</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0, height: 32, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", display: "flex", alignItems: "center", fontSize: 11, color: C.teal, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {portal.url}
              </div>
              <button type="button" onClick={copyUrl} aria-label="복사" title="복사"
                style={{ width: 30, height: 30, flexShrink: 0, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: copied ? C.success : C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
              <a href={portal.url} target="_blank" rel="noreferrer" aria-label="새 탭 열기" title="새 탭 열기"
                style={{ width: 30, height: 30, flexShrink: 0, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ExternalLink size={13} />
              </a>
              <div className="pcrm-row-menu">
                <button type="button" className="pc-btn pc-btn--ghost pc-btn--sm" aria-label="더보기" onClick={() => setMenuOpen((v) => !v)}
                  style={{ width: 30, height: 30, padding: 0, flexShrink: 0, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <MoreVertical size={13} />
                </button>
                {menuOpen && (
                  <>
                    <div className="pcrm-row-menu__scrim" onClick={() => setMenuOpen(false)} />
                    <div className="pcrm-row-menu__panel">
                      <button type="button" className="is-danger" disabled={busy} onClick={() => { setMenuOpen(false); void revokeShare(); }}>
                        {busy ? "처리 중..." : "공유 끊기"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="pc-card pc-card--padded">
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: C.ink }}>포털 관리</div>
        <p style={{ fontSize: 11, color: C.muted, margin: "3px 0 0" }}>고객 포털 상태와 공개 진행 현황을 확인하세요.</p>
      </div>
      {error ? <p style={{ fontSize: 11.5, color: C.danger, marginBottom: 8 }}>{error}</p> : null}

      {!portal ? (
        <div style={{ textAlign: "center", padding: "16px 4px" }}>
          <p style={{ fontSize: 11.5, color: C.hint, marginBottom: 10 }}>포털이 아직 생성되지 않았습니다.</p>
          <button type="button" onClick={ensurePortal} disabled={busy}
            style={{ height: 34, padding: "0 14px", borderRadius: R.md, border: "none", background: C.teal, color: "#fff", fontSize: 12, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer" }}>
            {busy ? "생성 중..." : "포털 생성"}
          </button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, marginBottom: 4 }}>고객 포털 URL</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0, height: 32, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", display: "flex", alignItems: "center", fontSize: 11, color: C.teal, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {portal.url}
            </div>
            <button type="button" onClick={copyUrl} aria-label="복사" title="복사"
              style={{ width: 30, height: 30, flexShrink: 0, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: copied ? C.success : C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <a href={portal.url} target="_blank" rel="noreferrer" aria-label="새 탭 열기" title="새 탭 열기"
              style={{ width: 30, height: 30, flexShrink: 0, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ExternalLink size={13} />
            </a>
            <button type="button" onClick={revokeShare} disabled={busy}
              style={{ height: 30, padding: "0 10px", flexShrink: 0, borderRadius: R.sm, border: `1px solid ${C.danger}`, background: "#FEF2F2", color: C.danger, fontSize: 11, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer" }}>
              공유 끊기
            </button>
          </div>

          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, marginBottom: 4 }}>진행 현황</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 10.5, color: C.hint, flexShrink: 0 }}>현재 단계: {portal.currentStepName ?? "-"}</span>
            <div style={{ flex: 1, height: 6, borderRadius: R.full, background: C.border, overflow: "hidden" }}>
              <div style={{ width: `${portal.progressPercent}%`, height: "100%", background: C.teal }} />
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: C.teal, flexShrink: 0 }}>{portal.progressPercent}%</span>
          </div>

          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, marginBottom: 6 }}>고객이 확인 가능한 자료</div>
          {portal.exposedItems.length === 0 ? (
            <p style={{ fontSize: 11, color: C.hint }}>아직 공개된 자료가 없습니다.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {portal.exposedItems.map((type) => (
                <span key={type} style={{ fontSize: 10.5, fontWeight: 700, color: C.teal, background: C.mint, borderRadius: R.xs, padding: "4px 8px" }}>
                  {PUBLICATION_TYPE_LABEL[type as PublicationType] ?? type}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
