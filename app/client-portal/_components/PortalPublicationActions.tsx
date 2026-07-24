"use client";

import { useState } from "react";
import { Check, MessageSquareText } from "lucide-react";

export default function PortalPublicationActions({
  publication,
  token,
  onChanged,
}: {
  publication: any;
  token: string;
  onChanged: (publication: any) => void;
}) {
  const [mode, setMode] = useState<"idle" | "revision">("idle");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const run = async (action: "approve" | "request-revision") => {
    if (busy) return;
    setBusy(action);
    setError("");
    try {
      const response = await fetch(`/api/client-portal/publications/${publication.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal-token": token },
        body: action === "request-revision" ? JSON.stringify({ feedback }) : undefined,
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "상태를 변경하지 못했습니다.");
      onChanged(payload.publication);
      setMode("idle");
      setFeedback("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "상태를 변경하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  if (publication.status === "approved" || publication.status === "completed") {
    return <span className="pcrm-publication-complete"><Check size={13} /> 승인 완료</span>;
  }
  if (publication.status === "revision_requested") {
    return <span className="pcrm-publication-revision"><MessageSquareText size={13} /> 수정 요청 전달됨</span>;
  }
  return (
    <div className="pcrm-publication-actions">
      {mode === "revision" ? (
        <div className="pcrm-publication-feedback">
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="수정이 필요한 내용을 구체적으로 적어주세요."
            maxLength={2000}
            autoFocus
          />
          <div>
            <button type="button" onClick={() => setMode("idle")}>취소</button>
            <button type="button" disabled={!feedback.trim() || Boolean(busy)} onClick={() => void run("request-revision")}>
              {busy ? "전달 중" : "수정 요청"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" onClick={() => setMode("revision")}>피드백</button>
          <button type="button" disabled={Boolean(busy)} className="is-primary" onClick={() => void run("approve")}>
            {busy ? "처리 중" : "승인"}
          </button>
        </>
      )}
      {error && <small>{error}</small>}
    </div>
  );
}
