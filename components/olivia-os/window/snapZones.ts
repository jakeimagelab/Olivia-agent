// OLIVIA OS Phase 2 — Snap Layout 순수 함수. 창 header를 화면 가장자리로 드래그하는 동안
// "지금 놓으면 어떻게 될지"를 계산한다(computeSnapZone, pointermove마다 호출) 그리고 실제로
// 놓았을 때 좌표/크기를 계산한다(resolveSnapBounds). 전부 순수 함수라 유닛 테스트 가능.
export type SnapMode =
  | "none" | "left-half" | "right-half"
  | "left-70" | "right-30" | "left-30" | "right-70"
  | "maximized";

// 최대 4개 프리셋만 지원한다(스펙 2-5): [50|50], [70|30], [30|70], [전체]. 좌/우 엣지 40px
// 안에서 세로 위치(상단 1/3=70, 중간 1/3=50, 하단 1/3=30)로 그중 하나를 고른다 — modifier 키
// 없이 순수 drag 위치만으로 결정된다(스펙 2-3).
const EDGE_THRESHOLD = 40;
const TOP_THIRD = 1 / 3;
const BOTTOM_THIRD = 2 / 3;

export function computeSnapZone(
  pointerX: number, pointerY: number, viewportWidth: number, viewportHeight: number,
): Exclude<SnapMode, "none"> | null {
  if (pointerY <= EDGE_THRESHOLD) return "maximized";
  const verticalRatio = pointerY / viewportHeight;
  if (pointerX <= EDGE_THRESHOLD) {
    if (verticalRatio < TOP_THIRD) return "left-70";
    if (verticalRatio > BOTTOM_THIRD) return "left-30";
    return "left-half";
  }
  if (pointerX >= viewportWidth - EDGE_THRESHOLD) {
    if (verticalRatio < TOP_THIRD) return "right-70";
    if (verticalRatio > BOTTOM_THIRD) return "right-30";
    return "right-half";
  }
  return null;
}

function widthRatio(mode: Exclude<SnapMode, "none">): number {
  if (mode === "maximized") return 1;
  if (mode === "left-70" || mode === "right-70") return 0.7;
  if (mode === "left-30" || mode === "right-30") return 0.3;
  return 0.5;
}

function isRightSide(mode: Exclude<SnapMode, "none">): boolean {
  return mode === "right-half" || mode === "right-70" || mode === "right-30";
}

export function resolveSnapBounds(
  mode: Exclude<SnapMode, "none">,
  workspaceWidth: number, workspaceHeight: number, dockSafeArea: number,
): { x: number; y: number; width: number; height: number } {
  const top = 8;
  const bottom = workspaceHeight - dockSafeArea;
  const height = Math.max(200, bottom - top);
  const fullLeft = 12;
  const fullWidth = Math.max(200, workspaceWidth - 24);

  if (mode === "maximized") return { x: fullLeft, y: top, width: fullWidth, height };

  const ratio = widthRatio(mode);
  const width = Math.round(fullWidth * ratio);
  const x = isRightSide(mode) ? fullLeft + (fullWidth - width) : fullLeft;
  return { x, y: top, width, height };
}
