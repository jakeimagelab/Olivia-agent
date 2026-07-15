"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DrawingCanvasHandle } from "@/components/DrawingCanvas";
import NoteCanvasPanel from "@/components/memo/NoteCanvasPanel";
import NoteTemplateEditor from "@/components/memo/NoteTemplateEditor";
import VoiceMemoPanel from "@/components/memo/VoiceMemoPanel";
import { TEMPLATE_OPTIONS, emptyTemplateData, type ConsultationMemo, type MemoTemplateData, type MemoTemplateType } from "@/lib/memo/types";
import { useSaveShortcut } from "@/lib/hooks/useSaveShortcut";

const C = { teal: "#155855", orange: "#E85D2C", ink: "#1C2B28", muted: "#607873", hint: "#98AEA9", mist: "#EDF5F3", white: "#FFFFFF", red: "#B42318" };

function templateText(type: MemoTemplateType, data: MemoTemplateData) {
  const extra = data.body?.trim() || "";
  if (type === "cornell") return [["핵심 키워드", data.cues], ["상담 기록", data.notes], ["요약", data.summary], ["AI 정리", extra]].filter(([, value]) => value?.trim()).map(([label, value]) => `${label}\n${value}`).join("\n\n");
  if (type === "todo") return [...(data.todos ?? []).map(item => `${item.done ? "[완료]" : "[ ]"} ${item.text}`), extra].filter(Boolean).join("\n");
  if (type === "conti") return [...(data.contiCaptions ?? []).map((caption, index) => caption ? `프레임 ${index + 1}: ${caption}` : ""), extra].filter(Boolean).join("\n");
  return extra;
}

function dataUrlFile(dataUrl: string, name: string) {
  const [header, encoded] = dataUrl.split(",");
  const mime = header.match(/data:(.*);base64/)?.[1] || "image/png";
  const binary = atob(encoded); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type: mime });
}

function MemoWorkspace() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date") ?? "";
  const [memos, setMemos] = useState<ConsultationMemo[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [templateChosen, setTemplateChosen] = useState(false);
  const [title, setTitle] = useState("");
  const [templateType, setTemplateType] = useState<MemoTemplateType>("text");
  const [templateData, setTemplateData] = useState<MemoTemplateData>(() => emptyTemplateData("text"));
  const [rawMemo, setRawMemo] = useState("");
  const [transcript, setTranscript] = useState("");
  const [audioSummary, setAudioSummary] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [initialCanvas, setInitialCanvas] = useState<string | null>(null);
  const [canvasDirty, setCanvasDirty] = useState<string | null>(null);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiText, setAiText] = useState("");
  const [analysis, setAnalysis] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [transforming, setTransforming] = useState<"text" | "image" | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const canvasRef = useRef<DrawingCanvasHandle>(null);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/memo", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "기록 조회 실패");
      setMemos(data.memos);
    } catch (error) { setStatus({ ok: false, text: error instanceof Error ? error.message : "기록 조회 실패" }); }
  }, []);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const reset = () => {
    setCurrentId(null); setTemplateChosen(false); setTitle(""); setTemplateType("text"); setTemplateData(emptyTemplateData("text"));
    setRawMemo(""); setTranscript(""); setAudioSummary(""); setAudioUrl(null); setInitialCanvas(null); setCanvasDirty(null);
    setAiImage(null); setAiText(""); setAnalysis(null); setStatus(null);
  };

  const chooseTemplate = (type: MemoTemplateType) => {
    if (templateChosen && (rawMemo.trim() || canvasDirty) && !window.confirm("템플릿을 바꾸면 현재 템플릿 구성이 초기화됩니다. 계속할까요?")) return;
    setTemplateType(type); setTemplateData(emptyTemplateData(type)); setRawMemo(""); setTemplateChosen(true); setAnalysis(null); setAiText("");
  };

  const updateTemplate = (next: MemoTemplateData) => {
    setTemplateData(next); setRawMemo(templateText(templateType, next));
  };

  const openMemo = (memo: ConsultationMemo) => {
    setCurrentId(memo.id); setTemplateChosen(true); setTitle(memo.title); setTemplateType(memo.template_type);
    setTemplateData(memo.template_data || emptyTemplateData(memo.template_type)); setRawMemo(memo.raw_memo || "");
    setTranscript(memo.transcript || ""); setAudioSummary(memo.audio_summary || ""); setAudioUrl(memo.audio_url);
    setInitialCanvas(memo.canvas_url); setCanvasDirty(null); setAiImage(memo.ai_image_url); setAiText("");
    setAnalysis(memo.extracted_data || null); setStatus(null); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = useCallback(async (): Promise<string> => {
    if (!templateChosen) throw new Error("먼저 메모 템플릿을 선택해주세요.");
    setSaving(true); setStatus(null);
    try {
      const response = await fetch("/api/memo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action: "save", id: currentId, title: title.trim() || "제목 없는 상담 메모", template_type: templateType,
        template_data: templateData, raw_memo: rawMemo || templateText(templateType, templateData), transcript, audio_summary: audioSummary,
      }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "저장 실패");
      const id = data.memo.id as string; setCurrentId(id);
      if (canvasDirty) {
        const form = new FormData(); form.append("memo_id", id); form.append("kind", "canvas"); form.append("file", dataUrlFile(canvasDirty, "canvas.png"));
        const uploadResponse = await fetch("/api/memo/assets", { method: "POST", body: form });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadData.ok) throw new Error(uploadData.error || "필기 저장 실패");
        setInitialCanvas(uploadData.url); setCanvasDirty(null);
      }
      setStatus({ ok: true, text: "상담 메모를 저장했습니다." }); void loadHistory(); return id;
    } catch (error) { const message = error instanceof Error ? error.message : "저장 실패"; setStatus({ ok: false, text: message }); throw error; }
    finally { setSaving(false); }
  }, [audioSummary, canvasDirty, currentId, loadHistory, rawMemo, templateChosen, templateData, templateType, title, transcript]);

  useSaveShortcut(() => { void save().catch(() => undefined); });

  const analyze = async () => {
    if (!rawMemo.trim() && !transcript.trim()) { setStatus({ ok: false, text: "분석할 메모나 음성 전사가 없습니다." }); return; }
    setAnalyzing(true); setStatus(null);
    try {
      const id = await save();
      const response = await fetch("/api/memo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, raw_memo: rawMemo, transcript, persist: false }) });
      const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || "AI 분석 실패");
      setAnalysis(data); setStatus({ ok: true, text: "상담 내용을 분석했습니다." }); void loadHistory();
    } catch (error) { setStatus({ ok: false, text: error instanceof Error ? error.message : "AI 분석 실패" }); }
    finally { setAnalyzing(false); }
  };

  const transform = async (mode: "text" | "image") => {
    const canvas = canvasRef.current?.getDataUrl({
      background: templateType === "grid" ? "grid" : templateType === "conti" ? "conti" : "white",
      columns: templateData.contiColumns,
      rows: templateData.contiRows,
    });
    if (!canvas) { setStatus({ ok: false, text: "분석할 필기나 그림이 없습니다." }); return; }
    setTransforming(mode); setStatus(null);
    try {
      const id = await save();
      const response = await fetch("/api/memo/transform", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, memo_id: id, canvas_data_url: canvas, raw_memo: rawMemo, transcript }) });
      const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || "AI 변환 실패");
      if (mode === "text") setAiText(data.text); else setAiImage(data.url || data.image);
      setStatus({ ok: true, text: mode === "text" ? "필기를 텍스트로 정리했습니다. 확인 후 적용하세요." : "정돈된 이미지를 만들었습니다." });
    } catch (error) { setStatus({ ok: false, text: error instanceof Error ? error.message : "AI 변환 실패" }); }
    finally { setTransforming(null); }
  };

  const applyAiText = () => {
    const separator = templateData.body?.trim() ? "\n\n" : "";
    const next = { ...templateData, body: `${templateData.body ?? ""}${separator}${aiText}` };
    setTemplateData(next); setRawMemo(templateText(templateType, next)); setAiText(""); setStatus({ ok: true, text: "AI 정리 내용을 메모에 추가했습니다." });
  };

  const deleteMemo = async (memo: ConsultationMemo) => {
    if (!window.confirm(`‘${memo.title || "상담 메모"}’을 휴지통으로 이동할까요?`)) return;
    try {
      const response = await fetch(`/api/memo?id=${memo.id}`, { method: "DELETE" }); const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "삭제 실패");
      setMemos(rows => rows.filter(row => row.id !== memo.id)); if (currentId === memo.id) reset();
      setStatus({ ok: true, text: "상담 기록을 휴지통으로 이동했습니다. 30일 안에 복원할 수 있습니다." });
    } catch (error) { setStatus({ ok: false, text: error instanceof Error ? error.message : "삭제 실패" }); }
  };

  const activeTemplate = useMemo(() => TEMPLATE_OPTIONS.find(option => option.type === templateType), [templateType]);

  return (
    <main style={{ minHeight: "100dvh", background: C.mist, color: C.ink, fontFamily: "'Noto Sans KR', sans-serif", paddingBottom: 80 }}>
      <header className="memo-topbar" style={{ maxWidth: 1320, margin: "0 auto", padding: "24px 20px 0", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link href="/" style={{ color: C.teal, textDecoration: "none", fontSize: 13, fontWeight: 900 }}>Olivia</Link><span style={{ color: C.hint }}>/</span><span style={{ color: C.muted, fontSize: 12, fontWeight: 800 }}>상담 메모</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}><Link href="/trash" style={{ minHeight: 38, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 99, background: "#fff", color: C.teal, textDecoration: "none", fontSize: 11, fontWeight: 900 }}>휴지통</Link><button onClick={reset} style={{ minHeight: 38, border: "none", borderRadius: 99, padding: "0 15px", background: C.orange, color: "#fff", font: "inherit", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>+ 새 상담</button></div>
      </header>

      <section style={{ maxWidth: 1320, margin: "0 auto", padding: "46px 20px 0" }}>
        <span style={{ display: "inline-flex", padding: "5px 11px", borderRadius: 99, background: "rgba(21,88,85,.08)", color: C.teal, fontSize: 10, fontWeight: 900, letterSpacing: ".14em" }}>CONSULTATION STUDIO</span>
        <h1 style={{ margin: "14px 0 9px", fontSize: "clamp(38px,6vw,72px)", lineHeight: .96, letterSpacing: "-.065em" }}>듣고, 그리고,<br />정리하는 상담 메모</h1>
        <p style={{ maxWidth: 610, margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.8 }}>텍스트와 터치 필기, 음성을 한 장에 기록하고 필요한 순간에만 AI로 정리합니다.</p>
      </section>

      {dateParam ? <div style={{ maxWidth: 1320, margin: "18px auto 0", padding: "0 20px" }}><div style={{ padding: "11px 15px", borderRadius: 14, background: "#DDEDE9", color: C.teal, fontSize: 12, fontWeight: 800 }}>캘린더 {dateParam} 일정에서 시작한 메모입니다.</div></div> : null}
      {status ? <div style={{ maxWidth: 1320, margin: "14px auto 0", padding: "0 20px" }}><div role="status" style={{ padding: "11px 15px", borderRadius: 13, background: status.ok ? "#DFF1EB" : "#FFF0ED", color: status.ok ? C.teal : C.red, fontSize: 12, fontWeight: 900 }}>{status.text}</div></div> : null}

      <div className="memo-layout" style={{ maxWidth: 1320, margin: "24px auto 0", padding: "0 20px", display: "grid", gridTemplateColumns: "280px minmax(0,1fr)", gap: 18, alignItems: "start" }}>
        <aside style={{ padding: 6, borderRadius: 24, background: "rgba(21,88,85,.055)", position: "sticky", top: 18 }}>
          <div style={{ borderRadius: 18, background: C.white, overflow: "hidden" }}>
            <button onClick={() => setHistoryOpen(value => !value)} style={{ width: "100%", border: "none", background: "#fff", padding: "16px", display: "flex", alignItems: "center", gap: 8, font: "inherit", cursor: "pointer" }}><strong style={{ color: C.teal, fontSize: 12 }}>이전 상담 기록</strong><span style={{ color: C.hint, fontSize: 10 }}>{memos.length}</span><span style={{ marginLeft: "auto", color: C.hint }}>{historyOpen ? "−" : "+"}</span></button>
            {historyOpen ? <div style={{ maxHeight: 620, overflowY: "auto", padding: "0 8px 8px" }}>{memos.map(memo => <div key={memo.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 32px", gap: 4, borderTop: "1px solid rgba(21,88,85,.08)", padding: "7px 0" }}>
              <button onClick={() => openMemo(memo)} style={{ border: "none", borderRadius: 12, background: currentId === memo.id ? C.mist : "transparent", padding: "9px 10px", textAlign: "left", font: "inherit", cursor: "pointer", minWidth: 0 }}><span style={{ display: "block", color: C.ink, fontSize: 12, fontWeight: 900, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{memo.title || memo.summary || "제목 없는 메모"}</span><span style={{ display: "block", marginTop: 4, color: C.hint, fontSize: 9 }}>{TEMPLATE_OPTIONS.find(option => option.type === memo.template_type)?.label} · {new Date(memo.updated_at || memo.created_at).toLocaleDateString("ko-KR")}</span></button>
              <button aria-label="상담 기록 삭제" onClick={() => void deleteMemo(memo)} style={{ alignSelf: "center", width: 30, height: 30, border: "none", borderRadius: 99, background: "transparent", color: "#B8C8C5", cursor: "pointer" }}>×</button>
            </div>)}</div> : null}
          </div>
        </aside>

        <div style={{ display: "grid", gap: 16 }}>
          {!templateChosen ? <section style={{ padding: 7, borderRadius: 28, background: "rgba(21,88,85,.055)" }}><div style={{ borderRadius: 21, background: C.white, padding: "24px" }}><div style={{ color: C.orange, fontSize: 10, fontWeight: 900, letterSpacing: ".15em" }}>CHOOSE A NOTE</div><h2 style={{ margin: "7px 0 18px", fontSize: 24, letterSpacing: "-.04em" }}>어떤 방식으로 기록할까요?</h2><div className="memo-template-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>{TEMPLATE_OPTIONS.map(option => <button key={option.type} onClick={() => chooseTemplate(option.type)} style={{ minHeight: 128, border: "none", borderRadius: 18, padding: 16, background: "#F5F9F8", textAlign: "left", font: "inherit", cursor: "pointer", transition: "transform 500ms cubic-bezier(.32,.72,0,1),background 500ms cubic-bezier(.32,.72,0,1)" }}><span style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 12, background: "#fff", color: C.orange, fontSize: 13, fontWeight: 900 }}>{option.mark}</span><strong style={{ display: "block", marginTop: 14, color: C.teal, fontSize: 13 }}>{option.label}</strong><span style={{ display: "block", marginTop: 4, color: C.muted, fontSize: 10, lineHeight: 1.5 }}>{option.description}</span></button>)}</div></div></section> : <>
            <section style={{ padding: 7, borderRadius: 28, background: "rgba(21,88,85,.055)" }}><div style={{ borderRadius: 21, background: C.white, padding: 20 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}><span style={{ padding: "5px 10px", borderRadius: 99, background: C.mist, color: C.teal, fontSize: 10, fontWeight: 900 }}>{activeTemplate?.label}</span><button onClick={() => setTemplateChosen(false)} style={{ border: "none", background: "transparent", color: C.hint, font: "inherit", fontSize: 10, cursor: "pointer" }}>템플릿 변경</button><span style={{ marginLeft: "auto", color: C.hint, fontSize: 9 }}>⌘S 저장</span></div>
              <input value={title} onChange={event => setTitle(event.target.value)} placeholder="상담 제목" style={{ width: "100%", border: "none", outline: "none", marginBottom: 16, color: C.ink, font: "inherit", fontSize: "clamp(22px,4vw,36px)", fontWeight: 900, letterSpacing: "-.045em" }} />
              <NoteTemplateEditor type={templateType} data={templateData} onChange={updateTemplate} />
            </div></section>

            <section style={{ padding: 7, borderRadius: 28, background: "rgba(21,88,85,.055)" }}><div style={{ borderRadius: 21, background: C.white, padding: 18 }}><div style={{ marginBottom: 12 }}><div style={{ color: C.teal, fontSize: 13, fontWeight: 900 }}>터치 필기 · 스케치</div><div style={{ marginTop: 3, color: C.muted, fontSize: 10 }}>Apple Pencil, 터치, 마우스로 그리고 도형을 추가하세요.</div></div><NoteCanvasPanel key={`${currentId ?? "new"}-${templateType}`} ref={canvasRef} templateType={templateType} templateData={templateData} initialImage={initialCanvas} onChange={setCanvasDirty} /></div></section>

            <section style={{ padding: 7, borderRadius: 28, background: "rgba(21,88,85,.055)" }}><div style={{ borderRadius: 21, background: C.white, padding: 18 }}><div style={{ marginBottom: 12 }}><div style={{ color: C.teal, fontSize: 13, fontWeight: 900 }}>AI로 필기 정리</div><div style={{ marginTop: 3, color: C.muted, fontSize: 10 }}>원본은 보존하며 결과를 확인한 뒤 적용합니다.</div></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button onClick={() => void transform("text")} disabled={Boolean(transforming)} style={{ minHeight: 42, border: "none", borderRadius: 99, padding: "0 17px", background: C.teal, color: "#fff", font: "inherit", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>{transforming === "text" ? "텍스트 정리 중…" : "텍스트로 정리"}</button><button onClick={() => void transform("image")} disabled={Boolean(transforming)} style={{ minHeight: 42, border: "none", borderRadius: 99, padding: "0 17px", background: C.orange, color: "#fff", font: "inherit", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>{transforming === "image" ? "이미지 정돈 중…" : "이미지로 정리"}</button></div>{aiText ? <div style={{ marginTop: 14, padding: 15, borderRadius: 15, background: C.mist }}><div style={{ whiteSpace: "pre-wrap", color: C.ink, fontSize: 12, lineHeight: 1.75 }}>{aiText}</div><div style={{ display: "flex", gap: 7, marginTop: 12 }}><button onClick={applyAiText} style={{ border: "none", borderRadius: 99, padding: "8px 13px", background: C.teal, color: "#fff", font: "inherit", fontSize: 10, fontWeight: 900, cursor: "pointer" }}>메모에 추가</button><button onClick={() => setAiText("")} style={{ border: "none", borderRadius: 99, padding: "8px 13px", background: "#fff", color: C.muted, font: "inherit", fontSize: 10, fontWeight: 900, cursor: "pointer" }}>닫기</button></div></div> : null}{aiImage ? <figure style={{ margin: "14px 0 0" }}><img src={aiImage} alt="AI가 정돈한 상담 노트" style={{ display: "block", width: "100%", borderRadius: 16 }} /><figcaption style={{ marginTop: 7, color: C.muted, fontSize: 10 }}>AI 정돈 이미지 · 원본 필기는 그대로 보존됩니다.</figcaption></figure> : null}</div></section>

            <div><div style={{ margin: "0 0 9px 5px", color: C.teal, fontSize: 13, fontWeight: 900 }}>음성 메모</div><VoiceMemoPanel memoId={currentId} existingUrl={audioUrl} transcript={transcript} summary={audioSummary} ensureSaved={save} onTranscriptChange={setTranscript} onProcessed={values => { setAudioUrl(values.audioUrl); setTranscript(values.transcript); setAudioSummary(values.summary); void loadHistory(); }} /></div>

            <section style={{ padding: 7, borderRadius: 28, background: "rgba(21,88,85,.055)" }}><div style={{ borderRadius: 21, background: C.white, padding: 18 }}><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button onClick={() => void save()} disabled={saving} style={{ flex: "1 1 180px", minHeight: 50, border: "none", borderRadius: 99, background: C.teal, color: "#fff", font: "inherit", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>{saving ? "저장 중…" : "상담 메모 저장"}</button><button onClick={() => void analyze()} disabled={analyzing} style={{ flex: "1 1 180px", minHeight: 50, border: "none", borderRadius: 99, background: C.orange, color: "#fff", font: "inherit", fontSize: 13, fontWeight: 900, cursor: "pointer" }}>{analyzing ? "AI 분석 중…" : "AI 상담 분석"}</button></div>{analysis ? <div style={{ marginTop: 16, padding: 16, borderRadius: 16, background: C.mist }}><span style={{ color: C.orange, fontSize: 10, fontWeight: 900, letterSpacing: ".12em" }}>ANALYSIS</span><h3 style={{ margin: "7px 0 10px", color: C.teal, fontSize: 16 }}>상담 요약</h3><p style={{ margin: 0, color: C.ink, fontSize: 12, lineHeight: 1.75 }}>{String(analysis.summary || "요약 없음")}</p><div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, marginTop: 13 }}>{[["병원", analysis.hospital_name], ["담당자", analysis.manager_name], ["희망일", analysis.preferred_date], ["예산", analysis.budget], ["추천", analysis.recommended_package], ["다음 행동", analysis.next_action]].filter(([, value]) => value).map(([label, value]) => <div key={String(label)} style={{ padding: 10, borderRadius: 11, background: "#fff" }}><span style={{ display: "block", color: C.hint, fontSize: 9, fontWeight: 900 }}>{label}</span><strong style={{ display: "block", marginTop: 3, color: C.ink, fontSize: 11 }}>{String(value)}</strong></div>)}</div></div> : null}</div></section>
          </>}
        </div>
      </div>
    </main>
  );
}

export default function MemoPage() { return <Suspense fallback={<div style={{ padding: 40 }}>상담 메모를 준비하는 중…</div>}><MemoWorkspace /></Suspense>; }
