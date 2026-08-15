"use client";

import { createPortal } from "react-dom";
import { useMemo, useRef, useState } from "react";
import NoteCanvasPanel from "@/components/memo/NoteCanvasPanel";
import type { DrawingCanvasHandle, CanvasExportOptions } from "@/components/DrawingCanvas";
import { PEN_TEMPLATE_OPTIONS, emptyTemplateData, type MemoTemplateType } from "@/lib/memo/types";

type Props = {
  clientId: string;
  clientName: string;
  onClose: () => void;
};

function dataUrlFile(dataUrl: string, name: string) {
  const [header, encoded] = dataUrl.split(",");
  const mime = header.match(/data:(.*);base64/)?.[1] || "image/png";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type: mime });
}

function canvasBackground(type: MemoTemplateType): CanvasExportOptions["background"] {
  if (type === "cornell" || type === "todo" || type === "grid" || type === "conti") return type;
  return "white";
}

// 촬영 단계 전용 태블릿 메모(코드 요청서 3차 4번 항목, 2026-08-16). 기존 /memo 페이지의
// 태블릿메모(펜 필기) 모드만 떼어내 촬영 화면 모달로 재사용한다 — NoteCanvasPanel/
// lib/memo/types.ts는 이미 프로젝트 컨텍스트에 종속되지 않는 범용 컴포넌트라 그대로 import해서
// 쓰고, 저장 시 client.id를 hospital_id로 넘겨 이 고객/프로젝트에 연결한다(/api/memo가
// hospital_id로 활성 워크플로우를 자동 조회해 이벤트에 붙인다).
export default function ShootingMemoPanel({ clientId, clientName, onClose }: Props) {
  const [templateType, setTemplateType] = useState<MemoTemplateType>("blank");
  const [templateData, setTemplateData] = useState(() => emptyTemplateData("blank"));
  const [title, setTitle] = useState(`${clientName} 촬영 메모 - ${new Date().toLocaleDateString("ko-KR")}`);
  const [canvasDirty, setCanvasDirty] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);

  const chooseTemplate = (type: MemoTemplateType) => {
    if (canvasDirty && !window.confirm("양식을 바꾸면 현재 필기가 초기화됩니다. 계속할까요?")) return;
    setTemplateType(type);
    setTemplateData(emptyTemplateData(type));
    setCanvasDirty(null);
  };

  const activeTemplate = useMemo(() => PEN_TEMPLATE_OPTIONS.find((option) => option.type === templateType), [templateType]);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          id: null,
          hospital_id: clientId,
          title: title.trim() || "촬영 메모",
          template_type: templateType,
          template_data: { ...templateData, noteMode: "template" },
          raw_memo: "",
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "저장 실패");

      if (canvasDirty) {
        const exported = canvasRef.current?.getDataUrl({
          background: canvasBackground(templateType),
          columns: templateData.contiColumns,
          rows: templateData.contiRows,
        }) || canvasDirty;
        const form = new FormData();
        form.append("memo_id", data.memo.id);
        form.append("kind", "canvas");
        form.append("file", dataUrlFile(exported, "shooting-memo.png"));
        const uploadResponse = await fetch("/api/memo/assets", { method: "POST", body: form });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadData.ok) throw new Error(uploadData.error || "필기 저장 실패");
      }
      setStatus({ ok: true, text: "촬영 메모를 저장했습니다." });
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : "저장 실패" });
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(21,88,85,.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 780, maxHeight: "92vh", overflowY: "auto", padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 900, color: "#E85D2C", letterSpacing: ".08em" }}>SHOOTING · 태블릿 메모</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="메모 제목"
              style={{ marginTop: 4, border: "none", outline: "none", font: "inherit", fontSize: 17, fontWeight: 900, color: "#1C2B28", width: "100%" }} />
          </div>
          <button onClick={onClose} aria-label="닫기" style={{ width: 34, height: 34, border: "none", borderRadius: 99, background: "#EDF5F3", color: "#155855", fontSize: 18, cursor: "pointer", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {PEN_TEMPLATE_OPTIONS.map((option) => (
            <button key={option.type} onClick={() => chooseTemplate(option.type)}
              style={{
                border: "none", borderRadius: 99, padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer",
                background: templateType === option.type ? "#155855" : "#EDF5F3",
                color: templateType === option.type ? "#fff" : "#155855",
              }}>
              {option.mark} {option.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: "#9BB5B0", marginBottom: 8 }}>{activeTemplate?.description}</div>

        <NoteCanvasPanel key={templateType} ref={canvasRef} templateType={templateType} templateData={templateData} onChange={setCanvasDirty} />

        {status && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: status.ok ? "#155855" : "#DC2626" }}>{status.text}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: 1, height: 44, border: "1px solid rgba(21,88,85,.14)", borderRadius: 10, background: "#fff", color: "#5A7470", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>닫기</button>
          <button onClick={() => void save()} disabled={saving} style={{ flex: 2, height: 44, border: "none", borderRadius: 10, background: "#155855", color: "#fff", fontWeight: 800, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "저장 중..." : "메모 저장"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
