"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type PenType = "pen" | "marker" | "highlighter" | "brush" | "pencil" | "ballpoint" | "fountain";
export type DrawShape = "freehand" | "line" | "arrow" | "rectangle" | "ellipse";
export type CanvasExportOptions = { background?: "white" | "grid" | "conti"; columns?: number; rows?: number };

export const PEN_TYPES: { key: PenType; label: string; icon: string }[] = [
  { key: "pencil",      label: "연필",  icon: "✎" },
  { key: "ballpoint",   label: "볼펜",  icon: "●" },
  { key: "fountain",    label: "만년필", icon: "◆" },
  { key: "pen",         label: "펜",    icon: "✒️" },
  { key: "marker",      label: "마커",  icon: "🖊️" },
  { key: "highlighter", label: "형광펜", icon: "🖍️" },
  { key: "brush",       label: "브러시", icon: "🖌️" },
];

export const DRAW_COLORS = [
  { color: "#E85D2C", label: "주황" },
  { color: "#FF0000", label: "빨강" },
  { color: "#FFCC00", label: "노랑" },
  { color: "#22C55E", label: "초록" },
  { color: "#155855", label: "딥그린" },
  { color: "#3B82F6", label: "파랑" },
  { color: "#8B5CF6", label: "보라" },
  { color: "#EC4899", label: "핑크" },
  { color: "#FFFFFF", label: "흰색" },
  { color: "#D1D5DB", label: "연회색" },
  { color: "#6B7280", label: "회색" },
  { color: "#000000", label: "검정" },
];

/** 지우개 전용 굵기 프리셋 — 펜 굵기보다 한 단계씩 굵게 잡는다 */
export const ERASER_SIZES = [12, 24, 40, 64];

const MAX_HISTORY = 12;

export interface DrawingCanvasHandle {
  clear: () => void;
  getDataUrl: (options?: CanvasExportOptions) => string | null;
  loadImage: (src: string) => void;
  undo: () => void;
  canUndo: () => boolean;
  redo: () => void;
  canRedo: () => boolean;
}

interface DrawingCanvasProps {
  penType: PenType;
  penSize: number;
  penColor: string;
  isEraser: boolean;
  /** 지우개 굵기 — penSize와 별도로 관리 (지우개는 보통 펜보다 훨씬 굵어야 해서) */
  eraserSize: number;
  shape?: DrawShape;
  /** 최초 마운트 시 복원할 이미지 (base64 또는 URL) */
  initialImage?: string | null;
  /** 한 번의 stroke(펜 떼기)가 끝날 때마다 현재 캔버스 상태를 전달 — 자동저장 등에 사용 */
  onStrokeEnd?: (dataUrl: string) => void;
  style?: React.CSSProperties;
  className?: string;
}

// 캔버스 자체 + 펜 물리(펜/마커/형광펜/브러시 스타일, 지우개)만 담당한다.
// 툴바 UI, 저장/불러오기 방식은 사용 화면마다 다르므로(현장 전체화면 오버레이 vs
// 그리드 칸별 인라인) 이 컴포넌트 밖에서 각자 구성한다.
const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(function DrawingCanvas(
  { penType, penSize, penColor, isEraser, eraserSize, shape = "freehand", initialImage, onStrokeEnd, style, className },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  // 점(포인트)들은 항상 "캔버스 실제 픽셀(디바이스 픽셀)" 좌표로 저장한다 —
  // 레티나 화면에서 선이 흐리게/거칠게 보이는 문제를 막기 위해 dpr을 곱해둔다.
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastMidRef = useRef<{ x: number; y: number } | null>(null);
  const lastTimeRef = useRef(Date.now());
  const dprRef = useRef(1);
  const historyRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const shapeBaseRef = useRef<ImageData | null>(null);

  const pushHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    historyRef.current.push(canvas.toDataURL("image/png"));
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    redoRef.current = [];
  };

  const drawImageToFit = (canvas: HTMLCanvasElement, src: string, onDone?: () => void) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.getContext("2d", { willReadFrequently: true })?.drawImage(img, 0, 0, canvas.width, canvas.height);
      onDone?.();
    };
    img.src = src;
  };

  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      pushHistory();
      canvas.getContext("2d", { willReadFrequently: true })?.clearRect(0, 0, canvas.width, canvas.height);
      onStrokeEnd?.(canvas.toDataURL("image/png"));
    },
    getDataUrl: (options) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      if (!options?.background) return canvas.toDataURL("image/png");
      const output = document.createElement("canvas");
      output.width = canvas.width; output.height = canvas.height;
      const ctx = output.getContext("2d", { willReadFrequently: true });
      if (!ctx) return canvas.toDataURL("image/png");
      ctx.fillStyle = "#FCFDFC"; ctx.fillRect(0, 0, output.width, output.height);
      ctx.strokeStyle = options.background === "grid" ? "rgba(21,88,85,.14)" : "rgba(21,88,85,.28)";
      ctx.lineWidth = Math.max(1, dprRef.current);
      if (options.background === "grid") {
        const step = 24 * dprRef.current;
        for (let x = step; x < output.width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, output.height); ctx.stroke(); }
        for (let y = step; y < output.height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(output.width, y); ctx.stroke(); }
      } else if (options.background === "conti") {
        const columns = Math.max(1, options.columns ?? 2); const rows = Math.max(1, options.rows ?? 3);
        for (let column = 1; column < columns; column += 1) { const x = output.width * column / columns; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, output.height); ctx.stroke(); }
        for (let row = 1; row < rows; row += 1) { const y = output.height * row / rows; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(output.width, y); ctx.stroke(); }
      }
      ctx.drawImage(canvas, 0, 0);
      return output.toDataURL("image/png");
    },
    loadImage: (src: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawImageToFit(canvas, src);
    },
    undo: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d", { willReadFrequently: true });
      if (!canvas || !ctx) return;
      const prev = historyRef.current.pop();
      redoRef.current.push(canvas.toDataURL("image/png"));
      if (redoRef.current.length > MAX_HISTORY) redoRef.current.shift();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const notify = () => onStrokeEnd?.(canvas.toDataURL("image/png"));
      if (prev) drawImageToFit(canvas, prev, notify);
      else notify();
    },
    canUndo: () => historyRef.current.length > 0,
    redo: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d", { willReadFrequently: true });
      if (!canvas || !ctx) return;
      const next = redoRef.current.pop();
      if (!next) return;
      historyRef.current.push(canvas.toDataURL("image/png"));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawImageToFit(canvas, next, () => onStrokeEnd?.(canvas.toDataURL("image/png")));
    },
    canRedo: () => redoRef.current.length > 0,
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    dprRef.current = window.devicePixelRatio || 1;
    const resize = () => {
      const dpr = dprRef.current;
      const imgData = canvas.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = Math.round(canvas.offsetWidth * dpr);
      canvas.height = Math.round(canvas.offsetHeight * dpr);
      if (imgData) canvas.getContext("2d", { willReadFrequently: true })?.putImageData(imgData, 0, 0);
    };
    resize();
    if (initialImage) drawImageToFit(canvas, initialImage);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = dprRef.current;
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  };

  const applyPenStyle = (ctx: CanvasRenderingContext2D, speed = 0, pressure = 0.5) => {
    const dpr = dprRef.current;
    if (isEraser) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = eraserSize * dpr;
      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      return;
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = penColor;
    ctx.fillStyle = penColor;
    if (penType === "pen" || penType === "ballpoint") {
      ctx.lineWidth = penSize * dpr;
      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    } else if (penType === "pencil") {
      ctx.lineWidth = Math.max(0.7, penSize * (0.7 + pressure * 0.35)) * dpr;
      ctx.globalAlpha = 0.48 + pressure * 0.22;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    } else if (penType === "fountain") {
      const dynamicW = Math.max(penSize * 0.55, penSize * (0.75 + pressure * 1.7) * (1 - Math.min(speed, 0.45)));
      ctx.lineWidth = dynamicW * dpr;
      ctx.globalAlpha = 0.96;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    } else if (penType === "marker") {
      ctx.lineWidth = penSize * 2.5 * dpr;
      ctx.globalAlpha = 0.92;
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";
    } else if (penType === "highlighter") {
      ctx.lineWidth = penSize * 7 * dpr;
      ctx.globalAlpha = 0.38;
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";
    } else if (penType === "brush") {
      const dynamicW = Math.max(penSize * 0.5, penSize * 2.8 * (1 - Math.min(speed * 3, 0.85)));
      ctx.lineWidth = dynamicW * dpr;
      ctx.globalAlpha = 0.82;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = getPos(e);
    if (!pos) return;
    pushHistory();
    isDrawingRef.current = true;
    lastPointRef.current = pos;
    lastMidRef.current = pos;
    lastTimeRef.current = Date.now();
    const ctx = canvasRef.current?.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    if (shape !== "freehand" && !isEraser) {
      shapeStartRef.current = pos;
      shapeBaseRef.current = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
      return;
    }
    ctx.save();
    applyPenStyle(ctx, 0, e.pressure || 0.5);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    if (isEraser) ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fill();
    ctx.restore();
  };

  // 원점(raw point)들을 그대로 직선으로 잇지 않고, 2차 베지어 곡선으로 중간점끼리
  // 이어서 그린다 — 빠르게 움직여도 각지지 않고 부드러운 선으로 보인다.
  const drawShape = (ctx: CanvasRenderingContext2D, start: { x: number; y: number }, end: { x: number; y: number }) => {
    ctx.save();
    applyPenStyle(ctx, 0, 0.5);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    if (shape === "line" || shape === "arrow") {
      ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      if (shape === "arrow") {
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const size = Math.max(10, penSize * 5) * dprRef.current;
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    } else if (shape === "rectangle") {
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (shape === "ellipse") {
      ctx.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  const continueDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const pos = getPos(e);
    const last = lastPointRef.current;
    const lastMid = lastMidRef.current;
    if (!pos || !last || !lastMid) return;
    const ctx = canvasRef.current?.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    if (shape !== "freehand" && !isEraser && shapeStartRef.current && shapeBaseRef.current) {
      ctx.putImageData(shapeBaseRef.current, 0, 0);
      drawShape(ctx, shapeStartRef.current, pos);
      lastPointRef.current = pos;
      return;
    }

    const now = Date.now();
    const dt = Math.max(now - lastTimeRef.current, 1);
    const dx = pos.x - last.x;
    const dy = pos.y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = (dist / dprRef.current) / dt; // dpr과 무관하게 일정한 붓 반응 유지
    lastTimeRef.current = now;

    const newMid = { x: (last.x + pos.x) / 2, y: (last.y + pos.y) / 2 };

    ctx.save();
    applyPenStyle(ctx, speed, e.pressure || 0.5);
    ctx.beginPath();
    ctx.moveTo(lastMid.x, lastMid.y);
    ctx.quadraticCurveTo(last.x, last.y, newMid.x, newMid.y);
    if (isEraser) ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.stroke();
    ctx.restore();

    lastMidRef.current = newMid;
    lastPointRef.current = pos;
  };

  const stopDraw = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    const wasDrawing = isDrawingRef.current;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    lastMidRef.current = null;
    shapeStartRef.current = null;
    shapeBaseRef.current = null;
    if (e?.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (wasDrawing && onStrokeEnd) {
      const url = canvasRef.current?.toDataURL("image/png");
      if (url) onStrokeEnd(url);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ touchAction: "none", cursor: isEraser ? "cell" : "crosshair", ...style }}
      onPointerDown={startDraw}
      onPointerMove={continueDraw}
      onPointerUp={stopDraw}
      onPointerCancel={stopDraw}
    />
  );
});

export default DrawingCanvas;
