"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type PenType = "pen" | "marker" | "highlighter" | "brush";

export const PEN_TYPES: { key: PenType; label: string; icon: string }[] = [
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

export interface DrawingCanvasHandle {
  clear: () => void;
  getDataUrl: () => string | null;
  loadImage: (src: string) => void;
}

interface DrawingCanvasProps {
  penType: PenType;
  penSize: number;
  penColor: string;
  isEraser: boolean;
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
  { penType, penSize, penColor, isEraser, initialImage, onStrokeEnd, style, className },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastTimeRef = useRef(Date.now());

  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    },
    getDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? null,
    loadImage: (src: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = src;
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const imgData = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      if (imgData) canvas.getContext("2d")?.putImageData(imgData, 0, 0);
    };
    resize();
    if (initialImage) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = initialImage;
    }
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      if (!t) return null;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const applyPenStyle = (ctx: CanvasRenderingContext2D, speed = 0) => {
    if (isEraser) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = penSize * 6;
      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      return;
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = penColor;
    ctx.fillStyle = penColor;
    if (penType === "pen") {
      ctx.lineWidth = penSize;
      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    } else if (penType === "marker") {
      ctx.lineWidth = penSize * 2.5;
      ctx.globalAlpha = 0.92;
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";
    } else if (penType === "highlighter") {
      ctx.lineWidth = penSize * 7;
      ctx.globalAlpha = 0.38;
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";
    } else if (penType === "brush") {
      const dynamicW = Math.max(penSize * 0.5, penSize * 2.8 * (1 - Math.min(speed * 3, 0.85)));
      ctx.lineWidth = dynamicW;
      ctx.globalAlpha = 0.82;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pos = getPos(e);
    if (!pos) return;
    isDrawingRef.current = true;
    lastPointRef.current = pos;
    lastTimeRef.current = Date.now();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.save();
    applyPenStyle(ctx);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    if (isEraser) ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fill();
    ctx.restore();
  };

  const continueDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const pos = getPos(e);
    const last = lastPointRef.current;
    if (!pos || !last) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const now = Date.now();
    const dt = Math.max(now - lastTimeRef.current, 1);
    const dx = pos.x - last.x;
    const dy = pos.y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = dist / dt;
    lastTimeRef.current = now;

    ctx.save();
    applyPenStyle(ctx, speed);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    if (isEraser) ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.stroke();
    ctx.restore();
    lastPointRef.current = pos;
  };

  const stopDraw = () => {
    const wasDrawing = isDrawingRef.current;
    isDrawingRef.current = false;
    lastPointRef.current = null;
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
      onMouseDown={startDraw}
      onMouseMove={continueDraw}
      onMouseUp={stopDraw}
      onMouseLeave={stopDraw}
      onTouchStart={startDraw}
      onTouchMove={continueDraw}
      onTouchEnd={stopDraw}
    />
  );
});

export default DrawingCanvas;
