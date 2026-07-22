// 프롬프터 실행 화면과 리모컨 화면이 정확히 같은 옵션을 써야 값이 어긋나지 않는다 —
// 두 파일에 각각 복붙하지 않고 여기 하나로 모아서 공유한다.
export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "center" | "bottom";

export const FONT_OPTIONS = [
  { label: "고딕", value: "'Noto Sans KR', sans-serif" },
  { label: "나눔스퀘어", value: "'NanumSquare', sans-serif" },
  { label: "명조", value: "'Nanum Myeongjo', serif" },
  { label: "임팩트고딕", value: "'Black Han Sans', sans-serif" },
  { label: "둥근고딕", value: "'Do Hyeon', sans-serif" },
  { label: "모던고딕", value: "'Gothic A1', sans-serif" },
  { label: "붓글씨", value: "'Song Myung', serif" },
  { label: "시스템", value: "-apple-system, BlinkMacSystemFont, sans-serif" },
];

export const COLOR_OPTIONS = ["#FFFFFF", "#FFD400", "#FF5C5C", "#5CFF8F", "#5CB8FF"];
export const BG_COLOR_OPTIONS = ["#000000", "#FFFFFF", "#00B140"];

export const V_ALIGN_PADDING: Record<VAlign, { top: string; bottom: string }> = {
  top: { top: "12vh", bottom: "88vh" },
  center: { top: "50vh", bottom: "50vh" },
  bottom: { top: "88vh", bottom: "12vh" },
};

export function fmtTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// 속도/문단간격/글자크기 게이지 — 실제 값 범위가 넓고 촘촘해서 조작이 번거로우니,
// 화면에는 1~10 단계로만 보여주고 내부적으로는 이 표(px 단위 실제 값)로 변환한다.
// 저장/브로드캐스트되는 값은 항상 이 표의 실제 px 값이라 다른 로직은 전혀 안 바뀐다.
export const SPEED_LEVELS = [15, 25, 35, 50, 65, 85, 110, 140, 175, 220];
export const PARAGRAPH_SPACING_LEVELS = [0, 12, 24, 36, 50, 65, 85, 110, 140, 180];
export const FONT_SIZE_LEVELS = [24, 32, 40, 50, 60, 72, 86, 102, 120, 140];

// 실제 값(px 등)에 가장 가까운 단계(1~10)를 찾는다 — 기존에 저장된 값이나 리모컨에서
// 동기화된 값이 표에 정확히 없어도 슬라이더 위치를 자연스럽게 보여주기 위함.
export function levelOf(value: number, levels: number[]): number {
  let closest = 0;
  let closestDiff = Infinity;
  levels.forEach((lv, i) => {
    const diff = Math.abs(lv - value);
    if (diff < closestDiff) { closestDiff = diff; closest = i; }
  });
  return closest + 1;
}
