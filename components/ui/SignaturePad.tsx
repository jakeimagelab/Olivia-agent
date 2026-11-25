"use client";

import { RotateCcw } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";

export function SignaturePad({ onChange, disabled, className }: { onChange: (value: string) => void; disabled?: boolean; className: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const inkRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastRef.current = point(event);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const canvas = canvasRef.current;
    const previous = lastRef.current;
    if (!canvas || !previous) return;
    const next = point(event);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.strokeStyle = "#17312c";
    context.lineWidth = 7;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    lastRef.current = next;
    if (!inkRef.current) {
      inkRef.current = true;
      setHasInk(true);
    }
  };
  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    const canvas = canvasRef.current;
    if (canvas && inkRef.current) onChange(canvas.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    inkRef.current = false;
    setHasInk(false);
    onChange("");
  };

  return <div className={className} data-disabled={disabled || undefined} data-ink={hasInk || undefined}>
    <canvas
      ref={canvasRef}
      width={1200}
      height={360}
      aria-label="손가락이나 마우스로 서명"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    />
    <span>이 안에 서명해 주세요</span>
    <button type="button" onClick={clear} disabled={!hasInk || disabled}><RotateCcw size={14} /> 다시 쓰기</button>
  </div>;
}
