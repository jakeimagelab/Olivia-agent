"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import GlobalHeader from "@/components/GlobalHeader";
import type { CanvasExportOptions, DrawingCanvasHandle } from "@/components/DrawingCanvas";
import NoteCanvasPanel from "@/components/memo/NoteCanvasPanel";
import VoiceMemoPanel from "@/components/memo/VoiceMemoPanel";
import {
  PEN_TEMPLATE_OPTIONS,
  emptyTemplateData,
  type ConsultationMemo,
  type MemoContextType,
  type MemoTemplateData,
  type MemoTemplateType,
} from "@/lib/memo/types";
import { useSaveShortcut } from "@/lib/hooks/useSaveShortcut";
import { C } from "@/lib/theme";

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

const DEFAULT_TITLE = "제목 없는 메모";

export function MemoWorkspace({ embedded = false, contextType, contextId }: { embedded?: boolean; contextType?: MemoContextType; contextId?: string }) {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date") ?? "";
  const [memos, setMemos] = useState<ConsultationMemo[]>([]);
  // 기본 접힘 — 화면을 열자마자 메모 작성 영역에 집중하도록(과거 메모는 필요할 때만 펼침).
  const [historyOpen, setHistoryOpen] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [templateType, setTemplateType] = useState<MemoTemplateType>("blank");
  const [templateData, setTemplateData] = useState<MemoTemplateData>(() => emptyTemplateData("blank"));
  const [rawMemo, setRawMemo] = useState("");
  const [transcript, setTranscript] = useState("");
  const [audioSummary, setAudioSummary] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [initialCanvas, setInitialCanvas] = useState<string | null>(null);
  const [canvasDirty, setCanvasDirty] = useState<string | null>(null);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiText, setAiText] = useState("");
  const [saving, setSaving] = useState(false);
  const [transforming, setTransforming] = useState<"text" | "image" | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);

  const loadHistory = useCallback(async () => {
    try {
      const query = contextType && contextId ? `?context_type=${encodeURIComponent(contextType)}&context_id=${encodeURIComponent(contextId)}` : "";
      const response = await fetch(`/api/memo${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "메모 조회 실패");
      setMemos(data.memos);
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : "메모 조회 실패" });
    }
  }, [contextType, contextId]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const reset = useCallback(() => {
    setCurrentId(null);
    setTitle("");
    setTemplateType("blank");
    setTemplateData(emptyTemplateData("blank"));
    setRawMemo("");
    setTranscript("");
    setAudioSummary("");
    setAudioUrl(null);
    setInitialCanvas(null);
    setCanvasDirty(null);
    setAiImage(null);
    setAiText("");
    setStatus(null);
  }, []);

  const chooseTemplate = (type: MemoTemplateType) => {
    if (canvasDirty && !window.confirm("양식을 바꾸면 현재 필기가 초기화됩니다. 계속할까요?")) return;
    setTemplateType(type);
    setTemplateData(emptyTemplateData(type));
    setInitialCanvas(null);
    setCanvasDirty(null);
    setAiImage(null);
    setAiText("");
  };

  const openMemo = (memo: ConsultationMemo) => {
    const loadedType = memo.template_type === "text" ? "blank" : memo.template_type;
    setCurrentId(memo.id);
    setTitle(memo.title || "");
    setTemplateType(loadedType);
    setTemplateData(memo.template_data || emptyTemplateData(loadedType));
    setRawMemo(memo.raw_memo || "");
    setTranscript(memo.transcript || "");
    setAudioSummary(memo.audio_summary || "");
    setAudioUrl(memo.audio_url);
    setInitialCanvas(memo.canvas_url);
    setCanvasDirty(null);
    setAiImage(memo.ai_image_url);
    setAiText("");
    setStatus(null);
    if (!embedded) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = useCallback(async (): Promise<string> => {
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          id: currentId,
          // 고객 컨텍스트는 기존 hospital_id 조회 경로와도 하위호환되도록 같이 채운다.
          hospital_id: contextType === "customer" ? contextId : undefined,
          context_type: contextType,
          context_id: contextId,
          title: title.trim() || DEFAULT_TITLE,
          template_type: templateType,
          template_data: { ...templateData, body: rawMemo },
          raw_memo: rawMemo,
          transcript,
          audio_summary: audioSummary,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "저장 실패");
      const id = data.memo.id as string;
      setCurrentId(id);

      if (canvasDirty) {
        const exported = canvasRef.current?.getDataUrl({
          background: canvasBackground(templateType),
          columns: templateData.contiColumns,
          rows: templateData.contiRows,
        }) || canvasDirty;
        const form = new FormData();
        form.append("memo_id", id);
        form.append("kind", "canvas");
        form.append("file", dataUrlFile(exported, "memo.png"));
        const uploadResponse = await fetch("/api/memo/assets", { method: "POST", body: form });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadData.ok) throw new Error(uploadData.error || "필기 저장 실패");
        setInitialCanvas(uploadData.url);
        setCanvasDirty(null);
      }

      setStatus({ ok: true, text: "메모를 저장했습니다." });
      void loadHistory();
      return id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "저장 실패";
      setStatus({ ok: false, text: message });
      throw error;
    } finally {
      setSaving(false);
    }
  }, [audioSummary, canvasDirty, contextId, contextType, currentId, loadHistory, rawMemo, templateData, templateType, title, transcript]);

  useSaveShortcut(() => { void save().catch(() => undefined); });

  const transform = async (transformMode: "text" | "image") => {
    const canvas = canvasRef.current?.getDataUrl({
      background: canvasBackground(templateType),
      columns: templateData.contiColumns,
      rows: templateData.contiRows,
    });
    if (!canvas) {
      setStatus({ ok: false, text: "정리할 필기나 그림이 없습니다." });
      return;
    }
    setTransforming(transformMode);
    setStatus(null);
    try {
      const id = await save();
      const response = await fetch("/api/memo/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: transformMode, memo_id: id, canvas_data_url: canvas, raw_memo: rawMemo, transcript }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "AI 정리 실패");
      if (transformMode === "text") setAiText(data.text);
      else setAiImage(data.url || data.image);
      setStatus({ ok: true, text: transformMode === "text" ? "필기를 텍스트로 정리했습니다." : "필기를 정돈된 이미지로 만들었습니다." });
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : "AI 정리 실패" });
    } finally {
      setTransforming(null);
    }
  };

  const applyAiText = () => {
    setRawMemo(current => [current.trim(), aiText.trim()].filter(Boolean).join("\n\n"));
    setAiText("");
    setStatus({ ok: true, text: "AI 정리 내용을 메모에 저장할 준비가 됐습니다." });
  };

  const deleteMemo = async (memo: ConsultationMemo) => {
    if (!window.confirm(`‘${memo.title || "메모"}’를 휴지통으로 이동할까요?`)) return;
    try {
      const response = await fetch(`/api/memo?id=${memo.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "삭제 실패");
      setMemos(rows => rows.filter(row => row.id !== memo.id));
      if (currentId === memo.id) reset();
      setStatus({ ok: true, text: "메모를 휴지통으로 이동했습니다. 30일 안에 복원할 수 있습니다." });
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : "삭제 실패" });
    }
  };

  const contiColumns = Math.min(4, Math.max(1, templateData.contiColumns ?? 2));
  const contiRows = Math.min(6, Math.max(1, templateData.contiRows ?? 3));
  const resizeConti = (columns: number, rows: number) => setTemplateData(current => ({ ...current, contiColumns: columns, contiRows: rows }));

  return (
    <main className={`pc-page${embedded ? " olivia-os-embedded-memo" : ""}`} style={{ color: C.ink, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
      {!embedded ? <GlobalHeader title="메모" description="텍스트·필기·음성을 한 화면에서 함께 기록합니다." pageActions={<>
          <Link href="/trash" className="pc-btn pc-btn--secondary pc-btn--sm" aria-label="휴지통"><Trash2 size={14} /><span className="memo-header-action-label">휴지통</span></Link>
          <button className="pc-btn pc-btn--orange pc-btn--sm" onClick={reset}><Plus size={15} />새 메모</button>
        </>} /> : null}

      <div className="pc-content pc-content--wide memo-content memo-content--full">
        {dateParam ? <div className="memo-notice">캘린더 {dateParam} 일정에서 시작한 메모입니다.</div> : null}
        {status ? <div role="status" className={`memo-status ${status.ok ? "is-success" : "is-error"}`}>{status.text}</div> : null}

        <div className="memo-workspace">
          <aside className="pc-card memo-history">
            <button className="memo-history-toggle" onClick={() => setHistoryOpen(value => !value)}>
              <strong>저장된 메모</strong><span>{memos.length}</span><span className="memo-history-sign">{historyOpen ? "−" : "+"}</span>
            </button>
            {historyOpen ? <div className="memo-history-list">
              {memos.length === 0 ? <div className="memo-history-empty">아직 저장된 메모가 없습니다.</div> : memos.map(memo => (
                <div className="memo-history-row" key={memo.id}>
                  <button className={`memo-history-item${currentId === memo.id ? " is-active" : ""}`} onClick={() => openMemo(memo)}>
                    <span>{memo.title || DEFAULT_TITLE}</span>
                    <small>{new Date(memo.updated_at || memo.created_at).toLocaleDateString("ko-KR")}</small>
                  </button>
                  <button className="memo-history-delete" aria-label="메모 삭제" onClick={() => void deleteMemo(memo)}>×</button>
                </div>
              ))}
            </div> : null}
          </aside>

          <div className="memo-editor-stack">
            <section className="pc-card pc-card--padded memo-editor-card">
              <div className="memo-editor-heading">
                <div>
                  <span className="memo-mode-label">메모</span>
                  <p>텍스트, 펜 필기, 음성 녹음을 구분 없이 한 캔버스에 같이 남길 수 있습니다.</p>
                </div>
                <div className="memo-editor-heading-actions">
                  <span className="memo-shortcut">⌘S</span>
                  <button className="pc-btn pc-btn--primary pc-btn--sm" onClick={() => void save().catch(() => undefined)} disabled={saving}>{saving ? "저장 중…" : "저장"}</button>
                </div>
              </div>
              <input className="memo-title-input" value={title} onChange={event => setTitle(event.target.value)} placeholder="메모 제목" />

              <div className="memo-template-picker" aria-label="캔버스 종이 양식 선택">
                {PEN_TEMPLATE_OPTIONS.map(option => <button key={option.type} className={templateType === option.type ? "is-active" : ""} onClick={() => chooseTemplate(option.type)}>
                  <span>{option.mark}</span><strong>{option.label}</strong><small>{option.description}</small>
                </button>)}
              </div>
              {templateType === "conti" ? <div className="memo-conti-controls">
                {[{ c: 2, r: 2 }, { c: 2, r: 3 }, { c: 3, r: 3 }].map(preset => <button key={`${preset.c}x${preset.r}`} className={contiColumns === preset.c && contiRows === preset.r ? "is-active" : ""} onClick={() => resizeConti(preset.c, preset.r)}>{preset.c}×{preset.r}</button>)}
                <label>열 <input aria-label="콘티 열" type="number" min={1} max={4} value={contiColumns} onChange={event => resizeConti(Math.min(4, Math.max(1, Number(event.target.value))), contiRows)} /></label>
                <label>행 <input aria-label="콘티 행" type="number" min={1} max={6} value={contiRows} onChange={event => resizeConti(contiColumns, Math.min(6, Math.max(1, Number(event.target.value))))} /></label>
              </div> : null}
              <NoteCanvasPanel
                key={`${currentId ?? "new"}-${templateType}`}
                ref={canvasRef}
                templateType={templateType}
                templateData={templateData}
                initialImage={initialCanvas}
                onChange={setCanvasDirty}
                textValue={rawMemo}
                onTextChange={setRawMemo}
                voiceButton={<VoiceMemoPanel compact memoId={currentId} existingUrl={audioUrl} transcript={transcript} summary={audioSummary} ensureSaved={save} onTranscriptChange={setTranscript} onProcessed={values => { setAudioUrl(values.audioUrl); setTranscript(values.transcript); setAudioSummary(values.summary); void loadHistory(); }} />}
              />
            </section>

            <section className="pc-card pc-card--padded memo-ai-card">
              <div><strong>AI 필기 정리</strong><p>원본 필기는 그대로 보존하고 텍스트 또는 정돈된 이미지로 변환합니다.</p></div>
              <div className="memo-ai-actions">
                <button className="pc-btn pc-btn--primary" onClick={() => void transform("text")} disabled={Boolean(transforming)}>{transforming === "text" ? "정리 중…" : "텍스트로 정리"}</button>
                <button className="pc-btn pc-btn--orange" onClick={() => void transform("image")} disabled={Boolean(transforming)}>{transforming === "image" ? "정리 중…" : "이미지로 정리"}</button>
              </div>
              {aiText ? <div className="memo-ai-result"><div>{aiText}</div><button className="pc-btn pc-btn--primary pc-btn--sm" onClick={applyAiText}>메모에 반영</button></div> : null}
              {aiImage ? <figure className="memo-ai-image"><img src={aiImage} alt="AI가 정돈한 펜 메모" /><figcaption>AI 정돈 이미지 · 원본 필기는 보존됩니다.</figcaption></figure> : null}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
