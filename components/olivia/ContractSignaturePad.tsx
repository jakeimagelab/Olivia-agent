"use client";

import { useRef, useState, type PointerEvent } from "react";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";

// 캔버스 드로잉은 components/contract/ContractBuilder.tsx(290행대)/app/portrait-consent/[token]의
// 손그림 서명 코드와 동일한 패턴이다(포인터 이벤트, canvas.toDataURL("image/png")) — 리포 전체에
// 서명 라이브러리가 이미 없고 손수 구현이 기존 컨벤션이라 새 패키지를 추가하지 않는다(PHASE 3,
// 2026-08-30). 다만 이 카드에는 페이지의 기존 서명 UI엔 없는 검증(빈 캔버스 거부, 스펙 §22)을
// 추가한다 — 기존 페이지 UI 자체는 건드리지 않는다.
export default function ContractSignaturePad({ flowId }: { flowId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isSigningRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const setBlockState = useOliviaConversationStore((s) => s.setClientTaskBlockState);
  const appendMessage = useOliviaConversationStore((s) => s.appendMessage);
  const [status, setStatus] = useState<"idle" | "applying" | "done" | "cancelled">("idle");
  const [error, setError] = useState("");

  const appendAssistantText = (text: string) => {
    appendMessage({
      id: crypto.randomUUID(),
      role: "assistant",
      content: text,
      blocks: [{ type: "text", text }],
      createdAt: new Date().toISOString(),
      status: "complete",
    });
  };

  const getPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
  };

  const startSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const point = getPoint(event);
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
    const canvas = canvasRef.current;
    const point = getPoint(event);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    hasStrokeRef.current = true;
  };

  const finishSignature = () => { isSigningRef.current = false; };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokeRef.current = false;
    setError("");
  };

  const cancel = () => {
    setStatus("cancelled");
    setBlockState(flowId, "cancelled");
  };

  const apply = async () => {
    const canvas = canvasRef.current;
    // 빈 canvas는 서명으로 인정하지 않는다(스펙 §22) — stroke가 한 번이라도 있었는지만 본다.
    if (!canvas || !hasStrokeRef.current) {
      setError("서명을 입력한 뒤 적용해주세요.");
      return;
    }
    setStatus("applying"); setError("");
    try {
      const signatureDataUrl = canvas.toDataURL("image/png");
      const r = await fetch(`/api/contracts/${flowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureDataUrl }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "서명 저장에 실패했어요.");
      // 열려 있는 ContractBuilder/Preview 카드가 새로고침 없이 즉시 반영되게(기존
      // REFRESH_RESOURCE 메커니즘 재사용, PHASE 2/3와 동일).
      executeOliviaAction({ type: "REFRESH_RESOURCE", resource: "contract", resourceId: flowId });
      setBlockState(flowId, "done");
      appendAssistantText("서명이 적용됐습니다.");
      setStatus("done");
    } catch (e: any) {
      setError(e.message || "서명 적용에 실패했어요.");
      setStatus("idle");
    }
  };

  if (status === "done") {
    return (
      <div className="olivia-select-match-card">
        <div className="olivia-select-match-card__section">
          <strong>서명 완료</strong>
          <p>대표 서명이 적용됐어요.</p>
        </div>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="olivia-select-match-card">
        <div className="olivia-select-match-card__section">
          <p>서명을 취소했어요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="olivia-select-match-card">
      <div className="olivia-select-match-card__section">
        <strong>대표 서명</strong>
        <p>아래 영역에 마우스나 트랙패드, 터치로 서명해주세요.</p>
        <canvas
          ref={canvasRef}
          width={320}
          height={140}
          style={{ width: "100%", height: 140, background: "#fff", border: "1px solid rgba(21,88,85,.12)", borderRadius: 8, touchAction: "none", cursor: "crosshair" }}
          onPointerDown={startSignature}
          onPointerMove={drawSignature}
          onPointerUp={finishSignature}
          onPointerLeave={finishSignature}
          onPointerCancel={finishSignature}
        />
        {error ? <div className="olivia-select-match-card__error">{error}</div> : null}
        <div className="olivia-select-match-card__actions">
          <button type="button" className="is-secondary" onClick={clearSignature} disabled={status === "applying"}>다시 쓰기</button>
          <button type="button" onClick={() => void apply()} disabled={status === "applying"}>{status === "applying" ? "적용 중..." : "서명 적용"}</button>
          <button type="button" className="is-secondary" onClick={cancel} disabled={status === "applying"}>취소</button>
        </div>
      </div>
    </div>
  );
}
