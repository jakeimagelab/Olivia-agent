/**
 * 작업실 전용 색상 토큰.
 *
 * 사진·영상 작업실의 인라인 스타일도 이 값을 공유해 밝은 문서 화면과
 * 중성 다크 미디어 패널의 대비가 화면마다 달라지지 않도록 한다.
 */
export const WORKSPACE_COLORS: Record<
  | "teal"
  | "orange"
  | "green"
  | "white"
  | "border"
  | "muted"
  | "hint"
  | "txt"
  | "light"
  | "bg"
  | "red"
  | "yellow"
  | "purple"
  | "darkPanel"
  | "darkAction"
  | "darkActionText"
  | "darkSelected",
  string
> = {
  teal: "#155855",
  orange: "#C94A1E",
  green: "#22876A",
  white: "#FFFFFF",
  border: "rgba(21,88,85,.12)",
  muted: "#5A7470",
  hint: "#9BB5B0",
  txt: "#1C2B28",
  light: "#EAF4F2",
  bg: "#FDFCFA",
  red: "#DC2626",
  yellow: "#D97706",
  purple: "#7C3AED",
  darkPanel: "#2A2A2A",
  darkAction: "#37C39D",
  darkActionText: "#103E36",
  darkSelected: "#4FD8B8",
};
