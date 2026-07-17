"use client";

import { forwardRef, useMemo, useRef, useState } from "react";
import { Redo2, Trash2, Undo2 } from "lucide-react";
import DrawingCanvas, { DRAW_COLORS, type DrawingCanvasHandle, type DrawShape, type PenType } from "@/components/DrawingCanvas";
import type { MemoTemplateData, MemoTemplateType } from "@/lib/memo/types";

type Props = {
  templateType: MemoTemplateType;
  templateData: MemoTemplateData;
  initialImage?: string | null;
  onChange: (dataUrl: string) => void;
};

const NOTE_PENS: { key: PenType; label: string }[] = [
  { key: "pencil", label: "연필" }, { key: "ballpoint", label: "볼펜" },
  { key: "fountain", label: "만년필" }, { key: "highlighter", label: "형광펜" },
];
const SHAPE_OPTIONS: { key: DrawShape; label: string }[] = [
  { key: "line", label: "선" }, { key: "arrow", label: "화살표" },
  { key: "rectangle", label: "사각형" }, { key: "ellipse", label: "원" },
];

const NoteCanvasPanel = forwardRef<DrawingCanvasHandle, Props>(function NoteCanvasPanel(
  { templateType, templateData, initialImage, onChange }, forwardedRef,
) {
  const innerRef = useRef<DrawingCanvasHandle>(null);
  const setRefs = (value: DrawingCanvasHandle | null) => {
    innerRef.current = value;
    if (typeof forwardedRef === "function") forwardedRef(value);
    else if (forwardedRef) forwardedRef.current = value;
  };
  const [penType, setPenType] = useState<PenType>("ballpoint");
  const [penSize, setPenSize] = useState(3);
  const [penColor, setPenColor] = useState("#155855");
  const [eraser, setEraser] = useState(false);
  const [eraserSize, setEraserSize] = useState(24);
  const [shape, setShape] = useState<DrawShape>("freehand");
  const [, forceHistory] = useState(0);

  const background = useMemo(() => {
    if (templateType === "cornell") return { backgroundColor: "#FCFDFC", backgroundImage: "linear-gradient(to right,transparent calc(31% - 1px),rgba(21,88,85,.22) calc(31% - 1px),rgba(21,88,85,.22) calc(31% + 1px),transparent calc(31% + 1px)),linear-gradient(to bottom,transparent calc(78% - 1px),rgba(21,88,85,.22) calc(78% - 1px),rgba(21,88,85,.22) calc(78% + 1px),transparent calc(78% + 1px))" };
    if (templateType === "todo") return { backgroundColor: "#FCFDFC", backgroundImage: "linear-gradient(90deg,transparent 55px,rgba(21,88,85,.14) 55px,rgba(21,88,85,.14) 57px,transparent 57px),repeating-linear-gradient(to bottom,transparent 0,transparent 47px,rgba(21,88,85,.14) 47px,rgba(21,88,85,.14) 48px)" };
    if (templateType === "grid") return { backgroundColor: "#FCFDFC", backgroundImage: "linear-gradient(rgba(21,88,85,.095) 1px, transparent 1px),linear-gradient(90deg, rgba(21,88,85,.095) 1px, transparent 1px)", backgroundSize: "24px 24px" };
    if (templateType === "conti") {
      const columns = templateData.contiColumns ?? 2;
      const rows = templateData.contiRows ?? 3;
      return { backgroundColor: "#FCFDFC", backgroundImage: `linear-gradient(rgba(21,88,85,.2) 2px, transparent 2px),linear-gradient(90deg, rgba(21,88,85,.2) 2px, transparent 2px)`, backgroundSize: `${100 / columns}% ${100 / rows}%` };
    }
    return { backgroundColor: "#FCFDFC" };
  }, [templateData.contiColumns, templateData.contiRows, templateType]);

  return (
    <section aria-label="필기 팔레트">
      <div className="memo-draw-toolbar" style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", padding: 10, borderRadius: 16, background: "#EDF5F3", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 99, background: "#fff" }}>
          {NOTE_PENS.map(pen => <button key={pen.key} title={pen.label} onClick={() => { setPenType(pen.key); setEraser(false); setShape("freehand"); }} style={{ minHeight: 34, border: "none", borderRadius: 99, padding: "0 10px", background: !eraser && shape === "freehand" && penType === pen.key ? "#155855" : "transparent", color: !eraser && shape === "freehand" && penType === pen.key ? "#fff" : "#155855", font: "inherit", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>{pen.label}</button>)}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 7, color: "#607873", fontSize: 10, fontWeight: 800 }}>굵기 <input aria-label="펜 굵기" type="range" min={1} max={18} value={penSize} onChange={event => setPenSize(Number(event.target.value))} style={{ width: 90, accentColor: "#155855" }} /><span>{penSize}</span></label>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>{DRAW_COLORS.slice(0, 8).map(item => <button key={item.color} aria-label={item.label} onClick={() => { setPenColor(item.color); setEraser(false); }} style={{ width: 24, height: 24, borderRadius: 99, border: penColor === item.color ? "3px solid #fff" : "2px solid transparent", boxShadow: penColor === item.color ? "0 0 0 2px #155855" : "none", background: item.color, cursor: "pointer" }} />)}</div>
        <button onClick={() => setEraser(value => !value)} style={{ minHeight: 34, border: "none", borderRadius: 99, padding: "0 11px", background: eraser ? "#E85D2C" : "#fff", color: eraser ? "#fff" : "#155855", font: "inherit", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>지우개</button>
        {eraser ? <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#607873", fontSize: 10 }}>크기 <input aria-label="지우개 크기" type="range" min={8} max={80} value={eraserSize} onChange={event => setEraserSize(Number(event.target.value))} style={{ width: 80, accentColor: "#E85D2C" }} /></label> : null}
        <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 99, background: "#fff" }}>{SHAPES.map(item => <button key={item.key} title={item.label} onClick={() => { setShape(item.key); setEraser(false); }} style={{ minHeight: 30, border: "none", borderRadius: 99, padding: "0 8px", background: !eraser && shape === item.key ? "#DCEDEA" : "transparent", color: "#155855", font: "inherit", fontSize: 10, fontWeight: 900, cursor: "pointer" }}>{item.label}</button>)}</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
          <button title="실행 취소" onClick={() => { innerRef.current?.undo(); forceHistory(v => v + 1); }} disabled={!innerRef.current?.canUndo()} style={{ width: 34, height: 34, border: "none", borderRadius: 99, background: "#fff", color: "#155855", cursor: "pointer" }}>↶</button>
          <button title="다시 실행" onClick={() => { innerRef.current?.redo(); forceHistory(v => v + 1); }} disabled={!innerRef.current?.canRedo()} style={{ width: 34, height: 34, border: "none", borderRadius: 99, background: "#fff", color: "#155855", cursor: "pointer" }}>↷</button>
          <button title="전체 지우기" onClick={() => { if (window.confirm("필기 내용을 모두 지울까요?")) { innerRef.current?.clear(); forceHistory(v => v + 1); } }} style={{ minHeight: 34, border: "none", borderRadius: 99, padding: "0 10px", background: "#FFF0ED", color: "#B42318", font: "inherit", fontSize: 10, fontWeight: 900, cursor: "pointer" }}>전체 지우기</button>
        </div>
      </div>
      <div style={{ padding: 6, borderRadius: 22, background: "rgba(21,88,85,.06)" }}>
        <div style={{ ...background, borderRadius: 16, overflow: "hidden" }}>
          <DrawingCanvas ref={setRefs} penType={penType} penSize={penSize} penColor={penColor} isEraser={eraser} eraserSize={eraserSize} shape={shape} initialImage={initialImage} onStrokeEnd={dataUrl => { onChange(dataUrl); forceHistory(v => v + 1); }} style={{ display: "block", width: "100%", height: templateType === "conti" ? 560 : 430 }} />
        </div>
      </div>
    </section>
  );
});

export default NoteCanvasPanel;
