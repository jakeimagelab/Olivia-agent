"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileText, Mic, PenLine, Plus, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import type { CanvasExportOptions, DrawingCanvasHandle } from "@/components/DrawingCanvas";
import NoteCanvasPanel from "@/components/memo/NoteCanvasPanel";
import VoiceMemoPanel from "@/components/memo/VoiceMemoPanel";
import {
  PEN_TEMPLATE_OPTIONS,
  TEMPLATE_OPTIONS,
  emptyTemplateData,
  type ConsultationMemo,
  type MemoMode,
  type MemoTemplateData,
  type MemoTemplateType,
} from "@/lib/memo/types";
import { useSaveShortcut } from "@/lib/hooks/useSaveShortcut";

const C = { teal: "#155855", orange: "#E85D2C", ink: "#1C2B28", muted: "#607873", hint: "#98AEA9", mist: "#EDF5F3", red: "#B42318" };

const MODE_INFO: Record<MemoMode, { label: string; description: string }> = {
  general: { label: "일반메모", description: "키보드로 빠르게 작성하고 정리하는 기본 텍스트 메모입니다." },
  template: { label: "템플릿메모", description: "백지·코넬·To do list·모눈종이·콘티 양식 위에 펜으로 기록합니다." },
  voice: { label: "음성메모", description: "대화를 녹음하면 AI가 텍스트로 변환하고 핵심 내용을 요약합니다." },
};

const MODE_TABS = [
  { key: "general", label: "일반메모", icon: <FileText size={15} /> },
  { key: "template", label: "템플릿메모", icon: <PenLine size={15} /> },
  { key: "voice", label: "음성메모", icon: <Mic size={15} /> },
];

function dataUrlFile(dataUrl: string, name: string) {
  const [header, encoded] = dataUrl.split(",");
  const mime = header.match(/data:(.*);base64/)?.[1] || "image/png";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type: mime });
}

function modeFromMemo(memo: ConsultationMemo): MemoMode {
  const savedMode = memo.template_data?.noteMode;
  if (savedMode === "general" || savedMode === "template" || savedMode === "voice") return savedMode;
  if (memo.audio_path || memo.audio_summary || memo.transcript) return "voice";
  return memo.template_type === "text" ? "general" : "template";
}

function canvasBackground(type: MemoTemplateType): CanvasExportOptions["background"] {
  if (type === "cornell" || type === "todo" || type === "grid" || type === "conti") return type;
  return "white";
}

function defaultTitle(mode: MemoMode) {
  if (mode === "template") return "제목 없는 템플릿메모";
  if (mode === "voice") return "제목 없는 음성메모";
  return "제목 없는 일반메모";
}

function MemoWorkspace() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date") ?? "";
  const [memos, setMemos] = useState<ConsultationMemo[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [mode, setMode] = useState<MemoMode>("general");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [templateType, setTemplateType] = useState<MemoTemplateType>("blank");
  const [templateData, setTemplateData] = useState<MemoTemplateData>(() => ({ ...emptyTemplateData("blank"), noteMode: "general" }));
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
      const response = await fetch("/api/memo", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "메모 조회 실패");
      setMemos(data.memos);
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : "메모 조회 실패" });
    }
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const reset = useCallback((nextMode: MemoMode = mode) => {
    const nextType: MemoTemplateType = nextMode === "template" ? "blank" : "text";
    setMode(nextMode);
    setCurrentId(null);
    setTitle("");
    setTemplateType(nextType);
    setTemplateData({ ...emptyTemplateData(nextType), noteMode: nextMode });
    setRawMemo("");
    setTranscript("");
    setAudioSummary("");
    setAudioUrl(null);
    setInitialCanvas(null);
    setCanvasDirty(null);
    setAiImage(null);
    setAiText("");
    setStatus(null);
  }, [mode]);

  const changeMode = (nextMode: MemoMode) => {
    if (nextMode === mode && !currentId) return;
    reset(nextMode);
  };

  const chooseTemplate = (type: MemoTemplateType) => {
    if (canvasDirty && !window.confirm("템플릿을 바꾸면 현재 필기가 초기화됩니다. 계속할까요?")) return;
    setTemplateType(type);
    setTemplateData({ ...emptyTemplateData(type), noteMode: "template" });
    setInitialCanvas(null);
    setCanvasDirty(null);
    setAiImage(null);
    setAiText("");
    setRawMemo("");
  };

  const openMemo = (memo: ConsultationMemo) => {
    const savedMode = modeFromMemo(memo);
    setMode(savedMode);
    setCurrentId(memo.id);
    setTitle(memo.title || "");
    setTemplateType(savedMode === "template" ? memo.template_type : "text");
    setTemplateData({ ...(memo.template_data || emptyTemplateData(memo.template_type)), noteMode: savedMode });
    setRawMemo(memo.raw_memo || "");
    setTranscript(memo.transcript || "");
    setAudioSummary(memo.audio_summary || "");
    setAudioUrl(memo.audio_url);
    setInitialCanvas(memo.canvas_url);
    setCanvasDirty(null);
    setAiImage(memo.ai_image_url);
    setAiText("");
    setStatus(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = useCallback(async (): Promise<string> => {
    setSaving(true);
    setStatus(null);
    try {
      const storedType = mode === "template" ? templateType : "text";
      const storedData = { ...templateData, body: mode === "general" ? rawMemo : templateData.body, noteMode: mode };
      const response = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          id: currentId,
          title: title.trim() || defaultTitle(mode),
          template_type: storedType,
          template_data: storedData,
          raw_memo: mode === "voice" ? "" : rawMemo,
          transcript,
          audio_summary: audioSummary,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "저장 실패");
      const id = data.memo.id as string;
      setCurrentId(id);

      if (mode === "template" && canvasDirty) {
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

      setStatus({ ok: true, text: `${MODE_INFO[mode].label}를 저장했습니다.` });
      void loadHistory();
      return id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "저장 실패";
      setStatus({ ok: false, text: message });
      throw error;
    } finally {
      setSaving(false);
    }
  }, [audioSummary, canvasDirty, currentId, loadHistory, mode, rawMemo, templateData, templateType, title, transcript]);

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
      if (currentId === memo.id) reset(mode);
      setStatus({ ok: true, text: "메모를 휴지통으로 이동했습니다. 30일 안에 복원할 수 있습니다." });
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : "삭제 실패" });
    }
  };

  const activeTemplate = useMemo(() => TEMPLATE_OPTIONS.find(option => option.type === templateType), [templateType]);
  const contiColumns = Math.min(4, Math.max(1, templateData.contiColumns ?? 2));
  const contiRows = Math.min(6, Math.max(1, templateData.contiRows ?? 3));
  const resizeConti = (columns: number, rows: number) => setTemplateData(current => ({ ...current, contiColumns: columns, contiRows: rows, noteMode: "template" }));

  return (
    <main className="pc-page" style={{ color: C.ink, fontFamily: "'Noto Sans KR', sans-serif" }}>
      <PageHeader
        title="메모"
        tabs={MODE_TABS}
        activeTab={mode}
        onTabChange={key => changeMode(key as MemoMode)}
        actions={<>
          <Link href="/trash" className="pc-btn pc-btn--secondary pc-btn--sm" aria-label="휴지통"><Trash2 size={14} /><span className="memo-header-action-label">휴지통</span></Link>
          <button className="pc-btn pc-btn--orange pc-btn--sm" onClick={() => reset(mode)}><Plus size={15} />새 메모</button>
        </>}
      />

      <div className="pc-content pc-content--wide memo-content">
        <section className="pc-hero pc-liquid-hero memo-hero">
          <div>
            <div className="pc-hero-kicker">MEMO</div>
            <h1 className="pc-hero-title">메모</h1>
            <p className="pc-hero-desc">일반 텍스트, 펜 템플릿, AI 음성 요약 중 기록에 가장 잘 맞는 방식을 선택하세요.</p>
          </div>
          <span className="pc-badge pc-badge--green">{MODE_INFO[mode].label}</span>
        </section>

        {dateParam ? <div className="memo-notice">캘린더 {dateParam} 일정에서 시작한 메모입니다.</div> : null}
        {status ? <div role="status" className={`memo-status ${status.ok ? "is-success" : "is-error"}`}>{status.text}</div> : null}

        <div className="memo-workspace">
          <aside className="pc-card memo-history">
            <button className="memo-history-toggle" onClick={() => setHistoryOpen(value => !value)}>
              <strong>저장된 메모</strong><span>{memos.length}</span><span className="memo-history-sign">{historyOpen ? "−" : "+"}</span>
            </button>
            {historyOpen ? <div className="memo-history-list">
              {memos.length === 0 ? <div className="memo-history-empty">아직 저장된 메모가 없습니다.</div> : memos.map(memo => {
                const memoMode = modeFromMemo(memo);
                return <div className="memo-history-row" key={memo.id}>
                  <button className={`memo-history-item${currentId === memo.id ? " is-active" : ""}`} onClick={() => openMemo(memo)}>
                    <span>{memo.title || defaultTitle(memoMode)}</span>
                    <small>{MODE_INFO[memoMode].label} · {new Date(memo.updated_at || memo.created_at).toLocaleDateString("ko-KR")}</small>
                  </button>
                  <button className="memo-history-delete" aria-label="메모 삭제" onClick={() => void deleteMemo(memo)}>×</button>
                </div>;
              })}
            </div> : null}
          </aside>

          <div className="memo-editor-stack">
            <section className="pc-card pc-card--padded memo-editor-card">
              <div className="memo-editor-heading">
                <div>
                  <span className="memo-mode-label">{MODE_INFO[mode].label}</span>
                  <p>{MODE_INFO[mode].description}</p>
                </div>
                <span className="memo-shortcut">⌘S 저장</span>
              </div>
              <input className="memo-title-input" value={title} onChange={event => setTitle(event.target.value)} placeholder="메모 제목" />

              {mode === "general" ? (
                <textarea className="memo-general-textarea" aria-label="일반메모 내용" value={rawMemo} onChange={event => { setRawMemo(event.target.value); setTemplateData(current => ({ ...current, body: event.target.value, noteMode: "general" })); }} placeholder="내용을 입력하세요." />
              ) : null}

              {mode === "template" ? <>
                <div className="memo-template-picker" aria-label="펜 메모 템플릿 선택">
                  {PEN_TEMPLATE_OPTIONS.map(option => <button key={option.type} className={templateType === option.type ? "is-active" : ""} onClick={() => chooseTemplate(option.type)}>
                    <span>{option.mark}</span><strong>{option.label}</strong><small>{option.description}</small>
                  </button>)}
                </div>
                {templateType === "conti" ? <div className="memo-conti-controls">
                  {[{ c: 2, r: 2 }, { c: 2, r: 3 }, { c: 3, r: 3 }].map(preset => <button key={`${preset.c}x${preset.r}`} className={contiColumns === preset.c && contiRows === preset.r ? "is-active" : ""} onClick={() => resizeConti(preset.c, preset.r)}>{preset.c}×{preset.r}</button>)}
                  <label>열 <input aria-label="콘티 열" type="number" min={1} max={4} value={contiColumns} onChange={event => resizeConti(Math.min(4, Math.max(1, Number(event.target.value))), contiRows)} /></label>
                  <label>행 <input aria-label="콘티 행" type="number" min={1} max={6} value={contiRows} onChange={event => resizeConti(contiColumns, Math.min(6, Math.max(1, Number(event.target.value))))} /></label>
                </div> : null}
                <div className="memo-canvas-heading"><strong>{activeTemplate?.label} 펜 메모</strong><span>Apple Pencil, 터치, 마우스로 작성하세요.</span></div>
                <NoteCanvasPanel key={`${currentId ?? "new"}-${templateType}`} ref={canvasRef} templateType={templateType} templateData={templateData} initialImage={initialCanvas} onChange={setCanvasDirty} />
              </> : null}

              {mode === "voice" ? <VoiceMemoPanel memoId={currentId} existingUrl={audioUrl} transcript={transcript} summary={audioSummary} ensureSaved={save} onTranscriptChange={setTranscript} onProcessed={values => { setAudioUrl(values.audioUrl); setTranscript(values.transcript); setAudioSummary(values.summary); void loadHistory(); }} /> : null}
            </section>

            {mode === "template" ? <section className="pc-card pc-card--padded memo-ai-card">
              <div><strong>AI 필기 정리</strong><p>원본 필기는 그대로 보존하고 텍스트 또는 정돈된 이미지로 변환합니다.</p></div>
              <div className="memo-ai-actions">
                <button className="pc-btn pc-btn--primary" onClick={() => void transform("text")} disabled={Boolean(transforming)}>{transforming === "text" ? "정리 중…" : "텍스트로 정리"}</button>
                <button className="pc-btn pc-btn--orange" onClick={() => void transform("image")} disabled={Boolean(transforming)}>{transforming === "image" ? "정리 중…" : "이미지로 정리"}</button>
              </div>
              {aiText ? <div className="memo-ai-result"><div>{aiText}</div><button className="pc-btn pc-btn--primary pc-btn--sm" onClick={applyAiText}>메모에 반영</button></div> : null}
              {aiImage ? <figure className="memo-ai-image"><img src={aiImage} alt="AI가 정돈한 펜 메모" /><figcaption>AI 정돈 이미지 · 원본 필기는 보존됩니다.</figcaption></figure> : null}
            </section> : null}

            <section className="pc-card pc-card--padded memo-save-card">
              <button className="pc-btn pc-btn--primary pc-btn--lg" onClick={() => void save().catch(() => undefined)} disabled={saving}>{saving ? "저장 중…" : `${MODE_INFO[mode].label} 저장`}</button>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function MemoPage() {
  return <Suspense fallback={<div className="pc-empty">메모를 준비하는 중…</div>}><MemoWorkspace /></Suspense>;
}
