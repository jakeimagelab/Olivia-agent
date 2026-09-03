"use client";

import { Card, C } from "../PhotoSortingWorkspace";
import type { SceneProposal } from "@/lib/photo-classifier/pattern-analysis";

function formatTimeRange(start?: string, end?: string) {
  if (!start) return "";
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  const format = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return endDate ? `${format(startDate)} ~ ${format(endDate)}` : format(startDate);
}

export default function SceneProposalList({ proposals }: { proposals: SceneProposal[] }) {
  if (!proposals.length) {
    return (
      <Card>
        <div style={{ padding: 24, fontSize: 12, color: C.hint, textAlign: "center", lineHeight: 1.7 }}>
          왼쪽에서 폴더를 선택하고 분류를 시작하면 여기에 Scene 미리보기가 표시됩니다.
        </div>
      </Card>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {proposals.map((proposal, index) => (
        <Card key={proposal.id}>
          <div style={{ padding: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {proposal.representativeFiles.length ? proposal.representativeFiles.slice(0, 4).map((src, thumbIndex) => (
                <img key={thumbIndex} src={src} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }} />
              )) : <div style={{ width: 44, height: 44, borderRadius: 6, background: C.bg }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 900, color: C.txt }}>Scene {String(index + 1).padStart(2, "0")} · {proposal.fileCount}장</div>
              <div style={{ fontSize: 10.5, color: C.hint, marginTop: 2 }}>{formatTimeRange(proposal.startTime, proposal.endTime)}</div>
              {proposal.reasons.length > 0 && (
                <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {proposal.reasons.slice(0, 3).map((reason, reasonIndex) => (
                    <span key={reasonIndex} style={{ fontSize: 9.5, fontWeight: 700, color: C.teal, background: C.light, borderRadius: 999, padding: "2px 8px" }}>{reason}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
