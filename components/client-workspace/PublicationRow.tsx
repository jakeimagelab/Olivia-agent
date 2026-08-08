"use client";

import { ExternalLink, MoreVertical } from "lucide-react";
import { useState } from "react";
import { C, R } from "@/lib/theme";
import { DISPLAY_STATUS_LABEL, PUBLICATION_TYPE_LABEL, type DisplayPublicationStatus, type PublicationType } from "@/lib/clientWorkspace/publications";
import type { WorkspacePublication } from "@/lib/clientWorkspace/types";

const STATUS_COLOR: Record<DisplayPublicationStatus, string> = {
  draft: C.hint,
  pending_publish: C.orange,
  published: C.success,
  revoked: C.danger,
};

export default function PublicationRow({
  type,
  publication,
  onPublish,
  onRevoke,
  onView,
  busy,
}: {
  type: PublicationType;
  publication: WorkspacePublication | undefined;
  onPublish: () => void;
  onRevoke: () => void;
  onView?: () => void;
  busy: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status: DisplayPublicationStatus = publication?.displayStatus ?? "draft";

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{PUBLICATION_TYPE_LABEL[type]}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[status] }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, color: STATUS_COLOR[status] }}>{DISPLAY_STATUS_LABEL[status]}</span>
          {publication?.publishedAt ? (
            <span style={{ fontSize: 10, color: C.hint }}>· {new Date(publication.publishedAt).toLocaleDateString("ko-KR")}</span>
          ) : null}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {status === "published" ? (
          onView ? (
            <button type="button" onClick={onView} aria-label="보기"
              style={{ width: 30, height: 30, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ExternalLink size={13} />
            </button>
          ) : null
        ) : (
          <button
            type="button"
            onClick={onPublish}
            disabled={busy}
            style={{ height: 30, padding: "0 12px", borderRadius: R.sm, border: "none", background: C.orange, color: "#fff", fontSize: 11.5, fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "처리 중..." : "공개"}
          </button>
        )}
        {status === "published" ? (
          <div style={{ position: "relative" }}>
            <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="더보기"
              style={{ width: 28, height: 28, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MoreVertical size={13} />
            </button>
            {menuOpen ? (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#fff", border: `1px solid ${C.border}`, borderRadius: R.md, boxShadow: "0 8px 24px rgba(21,88,85,.12)", zIndex: 20, minWidth: 120 }}>
                <button type="button" onClick={() => { setMenuOpen(false); onRevoke(); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: 0, background: "transparent", fontSize: 11.5, color: C.danger, cursor: "pointer", whiteSpace: "nowrap" }}>
                  공개 중지
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
