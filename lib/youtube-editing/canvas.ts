import type { Stroke, StrokePoint } from "./types";

export function toRatioPoint(clientX: number, y: number, width: number, height: number): StrokePoint {
  return { x: width ? clientX / width : 0, y: height ? y / height : 0 };
}

const TOOL_ALPHA: Record<Stroke["tool"], number> = { pen: 1, highlighter: 0.35 };
const TOOL_WIDTH_MULT: Record<Stroke["tool"], number> = { pen: 1, highlighter: 2.6 };

// strokes 배열 전체를 캔버스 크기에 맞춰 다시 그린다 — 좌표가 0~1 비율로 저장돼 있어
// 캔버스가 리사이즈되거나 화면 배율이 달라져도 항상 현재 크기 기준으로 정확히 그려진다.
export function renderStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue;
    ctx.save();
    ctx.globalAlpha = TOOL_ALPHA[stroke.tool] ?? 1;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * (TOOL_WIDTH_MULT[stroke.tool] ?? 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    stroke.points.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      const pressureScale = point.pressure && point.pressure > 0 ? 0.6 + point.pressure * 0.8 : 1;
      if (index === 0) {
        ctx.lineWidth = stroke.width * (TOOL_WIDTH_MULT[stroke.tool] ?? 1) * pressureScale;
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.restore();
  }
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// 지우개는 픽셀을 지우는 대신, 지나간 경로와 가까운 획을 통째로 지운다 — 좌표를 JSON으로
// 저장하는 벡터 방식과 맞는 단순한 모델이다.
export function strokeIntersectsPoint(stroke: Stroke, ratioX: number, ratioY: number, width: number, height: number, radiusPx: number): boolean {
  const px = ratioX * width;
  const py = ratioY * height;
  for (let i = 0; i < stroke.points.length - 1; i += 1) {
    const a = stroke.points[i];
    const b = stroke.points[i + 1];
    const dist = distanceToSegment(px, py, a.x * width, a.y * height, b.x * width, b.y * height);
    if (dist <= radiusPx) return true;
  }
  return false;
}
