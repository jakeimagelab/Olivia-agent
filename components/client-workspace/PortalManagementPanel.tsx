"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, MoreVertical } from "lucide-react";
import { C, R } from "@/lib/theme";
import type { WorkspacePortal } from "@/lib/clientWorkspace/types";

export default function PortalManagementPanel({
  clientId,
  portal,
  onRefresh,
}: {
  clientId: string;
  portal: WorkspacePortal | null;
  onRefresh: () => void;
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
