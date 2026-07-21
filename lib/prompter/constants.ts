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

export const V_ALIGN_PADDING: Record<VAlign, { top: string; bottom: string }> = {
  top: { top: "12vh", bottom: "88vh" },
  center: { top: "50vh", bottom: "50vh" },
  bottom: { top: "88vh", bottom: "12vh" },
};

export function fmtTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
