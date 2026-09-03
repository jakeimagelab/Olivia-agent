// 캔버스에서 요소를 드래그/리사이즈할 때 Figma/Canva류 정렬 가이드를 계산하는 순수 함수.
// UI(ReviewStoryCanvas.tsx)와 분리해 좌표 계산만 담당 — 테스트하기 쉽고, 스펙이 명시한
// equal-spacing(3개 이상 동일 간격) 자동 감지는 이번 MVP에서 제외한다(edge/center align만).

export type SmartGuide = {
  type: "vertical" | "horizontal";
  position: number;
  start?: number;
  end?: number;
  label?: string;
};

export type Rect = { x: number; y: number; width: number; height: number };

export type SnapResult = {
  x: number;
  y: number;
  guides: SmartGuide[];
};

const GAP_LABEL_MAX = 240; // 이보다 멀면 간격 라벨을 굳이 안 보여준다(화면이 지저분해짐 방지)

function edgesX(rect: Rect) {
  return { left: rect.x, right: rect.x + rect.width, centerX: rect.x + rect.width / 2 };
}
function edgesY(rect: Rect) {
  return { top: rect.y, bottom: rect.y + rect.height, centerY: rect.y + rect.height / 2 };
}

export function computeSnap(
  rect: Rect,
  canvasSize: { width: number; height: number },
  otherRects: Rect[],
  threshold: number,
): SnapResult {
  const dragX = edgesX(rect);
  const dragY = edgesY(rect);

  const candidatesX: Array<{ position: number; source: "canvas" | "element" }> = [
    { position: 0, source: "canvas" },
    { position: canvasSize.width, source: "canvas" },
    { position: canvasSize.width / 2, source: "canvas" },
  ];
  const candidatesY: Array<{ position: number; source: "canvas" | "element" }> = [
    { position: 0, source: "canvas" },
    { position: canvasSize.height, source: "canvas" },
    { position: canvasSize.height / 2, source: "canvas" },
  ];
  for (const other of otherRects) {
    const ox = edgesX(other);
    const oy = edgesY(other);
    candidatesX.push({ position: ox.left, source: "element" }, { position: ox.right, source: "element" }, { position: ox.centerX, source: "element" });
    candidatesY.push({ position: oy.top, source: "element" }, { position: oy.bottom, source: "element" }, { position: oy.centerY, source: "element" });
  }

  function bestSnap(dragEdges: number[], candidates: Array<{ position: number; source: "canvas" | "element" }>) {
    let best: { delta: number; edgeIndex: number; position: number } | null = null;
    dragEdges.forEach((edgeValue, edgeIndex) => {
      for (const candidate of candidates) {
        const delta = candidate.position - edgeValue;
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, edgeIndex, position: candidate.position };
        }
      }
    });
    return best;
  }

  const snapX = bestSnap([dragX.left, dragX.right, dragX.centerX], candidatesX);
  const snapY = bestSnap([dragY.top, dragY.bottom, dragY.centerY], candidatesY);

  const nextX = snapX ? rect.x + snapX.delta : rect.x;
  const nextY = snapY ? rect.y + snapY.delta : rect.y;

  const guides: SmartGuide[] = [];
  if (snapX) {
    guides.push({ type: "vertical", position: snapX.position, start: 0, end: canvasSize.height });
  }
  if (snapY) {
    guides.push({ type: "horizontal", position: snapY.position, start: 0, end: canvasSize.width });
  }

  const finalRect: Rect = { x: nextX, y: nextY, width: rect.width, height: rect.height };
  guides.push(...gapLabels(finalRect, canvasSize, otherRects));

  return { x: nextX, y: nextY, guides };
}

// 정렬 스냅과 별개로, 드래그 중인 요소와 캔버스 가장자리/다른 요소 사이의 "현재 간격"을
// 레퍼런스 이미지의 24/16/20 같은 라벨로 보여준다 — 정확히 스냅됐을 때만이 아니라 가까이
// 있을 때 항상 표시(Figma의 spacing indicator와 동일한 느낌).
function gapLabels(rect: Rect, canvasSize: { width: number; height: number }, otherRects: Rect[]): SmartGuide[] {
  const guides: SmartGuide[] = [];
  const { left, right } = edgesX(rect);
  const { top, bottom } = edgesY(rect);

  const leftGap = left;
  if (leftGap >= 0 && leftGap <= GAP_LABEL_MAX) {
    guides.push({ type: "vertical", position: left / 2, start: rect.y, end: rect.y + rect.height, label: String(Math.round(leftGap)) });
  }
  const rightGap = canvasSize.width - right;
  if (rightGap >= 0 && rightGap <= GAP_LABEL_MAX) {
    guides.push({ type: "vertical", position: right + rightGap / 2, start: rect.y, end: rect.y + rect.height, label: String(Math.round(rightGap)) });
  }
  const topGap = top;
  if (topGap >= 0 && topGap <= GAP_LABEL_MAX) {
    guides.push({ type: "horizontal", position: top / 2, start: rect.x, end: rect.x + rect.width, label: String(Math.round(topGap)) });
  }
  const bottomGap = canvasSize.height - bottom;
  if (bottomGap >= 0 && bottomGap <= GAP_LABEL_MAX) {
    guides.push({ type: "horizontal", position: bottom + bottomGap / 2, start: rect.x, end: rect.x + rect.width, label: String(Math.round(bottomGap)) });
  }

  for (const other of otherRects) {
    const overlapsX = rect.x < other.x + other.width && rect.x + rect.width > other.x;
    const overlapsY = rect.y < other.y + other.height && rect.y + rect.height > other.y;
    if (overlapsX) {
      if (other.y >= bottom && other.y - bottom <= GAP_LABEL_MAX) {
        guides.push({ type: "horizontal", position: bottom + (other.y - bottom) / 2, start: Math.max(rect.x, other.x), end: Math.min(rect.x + rect.width, other.x + other.width), label: String(Math.round(other.y - bottom)) });
      } else if (rect.y >= other.y + other.height && rect.y - (other.y + other.height) <= GAP_LABEL_MAX) {
        const gap = rect.y - (other.y + other.height);
        guides.push({ type: "horizontal", position: other.y + other.height + gap / 2, start: Math.max(rect.x, other.x), end: Math.min(rect.x + rect.width, other.x + other.width), label: String(Math.round(gap)) });
      }
    }
    if (overlapsY) {
      if (other.x >= right && other.x - right <= GAP_LABEL_MAX) {
        guides.push({ type: "vertical", position: right + (other.x - right) / 2, start: Math.max(rect.y, other.y), end: Math.min(rect.y + rect.height, other.y + other.height), label: String(Math.round(other.x - right)) });
      } else if (rect.x >= other.x + other.width && rect.x - (other.x + other.width) <= GAP_LABEL_MAX) {
        const gap = rect.x - (other.x + other.width);
        guides.push({ type: "vertical", position: other.x + other.width + gap / 2, start: Math.max(rect.y, other.y), end: Math.min(rect.y + rect.height, other.y + other.height), label: String(Math.round(gap)) });
      }
    }
  }

  return guides;
}
