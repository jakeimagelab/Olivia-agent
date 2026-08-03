"use client";

import type { PointerEvent } from "react";
import { useRef, useState } from "react";
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
  const isContract = publication.related_type === "contract";
  const [mode, setMode] = useState<"idle" | "revision" | "sign">("idle");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const isSigningRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

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

  const getSignaturePoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    const point = getSignaturePoint(event);
    if (!canvas || !point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    isSigningRef.current = true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const drawSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isSigningRef.current) return;
    const canvas = signatureCanvasRef.current;
    const point = getSignaturePoint(event);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const finishSignature = () => {
    if (!isSigningRef.current) return;
    isSigningRef.current = false;
    setHasSignature(true);
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const submitSignature = async () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !hasSignature || busy) return;
    setBusy("sign");
    setError("");
    try {
      const signatureDataUrl = canvas.toDataURL("image/png");
      const response = await fetch(`/api/client-portal/contracts/${publication.related_id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal-token": token },
        body: JSON.stringify({ signatureDataUrl }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "서명을 저장하지 못했습니다.");
      onChanged(payload.publication);
      setMode("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "서명을 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  if (publication.status === "approved" || publication.status === "completed") {
    return <span className="pcrm-publication-complete"><Check size={13} /> {isContract ? "서명 완료" : "승인 완료"}</span>;
  }
  if (publication.status === "revision_requested") {
    return <span className="pcrm-publication-revision"><MessageSquareText size={13} /> 수정 요청 전달됨</span>;
  }
  if (mode === "sign") {
    return (
      <div className="pcrm-publication-actions">
        <div className="pcrm-publication-signature">
          <canvas
            ref={signatureCanvasRef}
            width={420}
            height={140}
            onPointerDown={startSignature}
            onPointerMove={drawSignature}
            onPointerUp={finishSignature}
            onPointerLeave={finishSignature}
            onPointerCancel={finishSignature}
            className="pcrm-publication-signature__canvas"
          />
          <div>
            <button type="button" onClick={clearSignature}>지우기</button>
            <button type="button" onClick={() => setMode("idle")}>취소</button>
            <button type="button" disabled={!hasSignature || Boolean(busy)} className="is-primary" onClick={() => void submitSignature()}>
              {busy ? "저장 중" : "서명 완료"}
            </button>
          </div>
          {error && <small>{error}</small>}
        </div>
      </div>
    );
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
          {isContract ? (
            <button type="button" disabled={Boolean(busy)} className="is-primary" onClick={() => setMode("sign")}>
              전자서명
            </button>
          ) : (
            <button type="button" disabled={Boolean(busy)} className="is-primary" onClick={() => void run("approve")}>
              {busy ? "처리 중" : "승인"}
            </button>
          )}
        </>
      )}
      {error && <small>{error}</small>}
    </div>
  );
}
