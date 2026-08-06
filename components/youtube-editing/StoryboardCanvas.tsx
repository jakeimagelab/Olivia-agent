"use client";

import { useCallback, useEffect, useRef } from "react";
import type { DrawTool, Stroke, StrokePoint } from "@/lib/youtube-editing/types";
import { renderStrokes, strokeIntersectsPoint, strokeIntersectsPolygon } from "@/lib/youtube-editing/canvas";

const ERASER_RADIUS_PX = 14;

// 손글씨 콘티의 핵심 캔버스. Pointer Events만 사용하고 touch-action:none으로 페이지 스크롤과
// 필기 입력을 분리한다. 획은 PNG가 아니라 0~1 비율 좌표 JSON으로 저장/렌더링하므로 캔버스가
// 리사이즈되거나 화면 배율이 바뀌어도 어긋나지 않는다.
export default function StoryboardCanvas({
  strokes,
  tool,
  color,
  width,
  onStrokeCommit,
  onEraseStrokes,
  children,
}: {
  strokes: Stroke[];
  tool: DrawTool;
  color: string;
  width: number;
  onStrokeCommit: (stroke: Stroke) => void;
  onEraseStrokes: (ids: string[]) => void;
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<{ points: StrokePoint[] } | null>(null);
  const lassoRef = useRef<{ points: StrokePoint[] } | null>(null);
  const erasedIdsRef = useRef<Set<string>>(new Set());
  const pointerIdRef = useRef<number | null>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    renderStrokes(ctx, strokesRef.current, canvas.width, canvas.height);
  }, []);

  // 캔버스 CSS 크기와 실제 픽셀 버퍼 크기를 devicePixelRatio에 맞춰 동기화한다 — 그래야
  // 확대/축소나 반응형 크기 변경에도 흐려지거나 좌표가 어긋나지 않는다.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const applySize = () => {
      const rect = container.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      redraw();
    };
    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => { redraw(); }, [strokes, redraw]);

  const getRatioPoint = (event: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    // 압력을 지원하지 않는 마우스/터치는 스펙상 항상 0.5를 보고하므로 "실제 압력 없음"으로 취급한다.
    const pressure = event.pressure && event.pressure !== 0.5 ? event.pressure : undefined;
    return { x, y, pressure };
  };

  const eraseAt = (point: StrokePoint) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const radius = ERASER_RADIUS_PX * (window.devicePixelRatio || 1);
    for (const stroke of strokesRef.current) {
      if (erasedIdsRef.current.has(stroke.id)) continue;
      if (strokeIntersectsPoint(stroke, point.x, point.y, canvas.width, canvas.height, radius)) {
        erasedIdsRef.current.add(stroke.id);
      }
    }
    const ctx = canvas.getContext("2d");
    if (ctx) renderStrokes(ctx, strokesRef.current.filter((s) => !erasedIdsRef.current.has(s.id)), canvas.width, canvas.height);
  };

  const drawLassoPreview = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const loop = lassoRef.current;
    if (!canvas || !ctx || !loop || loop.points.length < 2) return;
    renderStrokes(ctx, strokesRef.current, canvas.width, canvas.height);
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "#2563EB";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    loop.points.forEach((point, index) => {
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    const point = getRatioPoint(event);
    if (tool === "eraser") {
      erasedIdsRef.current = new Set();
      eraseAt(point);
    } else if (tool === "lasso") {
      lassoRef.current = { points: [point] };
    } else {
      drawingRef.current = { points: [point] };
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    const point = getRatioPoint(event);
    if (tool === "eraser") {
      eraseAt(point);
      return;
    }
    if (tool === "lasso") {
      if (!lassoRef.current) return;
      lassoRef.current.points.push(point);
      drawLassoPreview();
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current.points.push(point);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      const preview: Stroke = { id: "__preview__", tool: tool === "highlighter" ? "highlighter" : "pen", color, width, points: drawingRef.current.points };
      renderStrokes(ctx, [...strokesRef.current, preview], canvas.width, canvas.height);
    }
  };

  const finishPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    if (tool === "eraser") {
      if (erasedIdsRef.current.size) onEraseStrokes(Array.from(erasedIdsRef.current));
      erasedIdsRef.current = new Set();
      redraw();
      return;
    }
    if (tool === "lasso") {
      const loop = lassoRef.current;
      lassoRef.current = null;
      if (loop && loop.points.length >= 3) {
        const captured = strokesRef.current.filter((s) => strokeIntersectsPolygon(s, loop.points)).map((s) => s.id);
        if (captured.length) onEraseStrokes(captured);
      }
      redraw();
      return;
    }
    const drawing = drawingRef.current;
    drawingRef.current = null;
    if (drawing && drawing.points.length >= 2) {
      onStrokeCommit({ id: crypto.randomUUID(), tool: tool === "highlighter" ? "highlighter" : "pen", color, width, points: drawing.points });
    } else {
      redraw();
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerLeave={finishPointer}
        onPointerCancel={finishPointer}
        style={{ display: "block", width: "100%", height: "100%", touchAction: "none", cursor: tool === "eraser" ? "cell" : "crosshair" }}
      />
      {children}
    </div>
  );
}
