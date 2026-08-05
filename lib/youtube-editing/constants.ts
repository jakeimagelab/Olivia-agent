import type {
  CameraOption, CaptionAppear, CaptionConfig, CaptionPosition, CaptionType,
  SoundEffectOption, TemplateOption, TransitionOption,
  VisualConfig, VisualLayout, VisualStyle, VisualType,
} from "./types";

export const CAMERA_OPTIONS: CameraOption[] = [
  "A캠 정면", "B캠 측면", "A → B 전환", "B → A 전환", "원장 화면 미사용", "디지털 줌인", "디지털 줌아웃",
];

export const CAPTION_TYPES: CaptionType[] = ["기본 자막", "효과 자막", "키워드 강조", "자막 없음"];
export const CAPTION_APPEARS: CaptionAppear[] = ["기본", "팝업", "확대", "페이드"];
export const CAPTION_POSITIONS: CaptionPosition[] = ["상단", "중앙", "하단"];
export const CAPTION_COLORS = ["#1C2B28", "#E85D2C", "#2563EB", "#22876A", "#7C3AED", "#EB8F22"];

export const VISUAL_TYPES: VisualType[] = [
  "자료 없음", "이미지 자료", "의료 모식도", "인포그래픽", "영상 B-roll", "병원 현장", "아이콘", "캘린더", "디자인 템플릿",
];
export const VISUAL_LAYOUTS: VisualLayout[] = ["전체 화면", "좌우 분할", "PIP", "원형 확대"];
export const VISUAL_STYLES: VisualStyle[] = ["실사 사진", "의료 일러스트", "인포그래픽", "의료 모식도", "스타일 일러스트", "영상 B-roll"];

export const SOUND_EFFECT_OPTIONS: SoundEffectOption[] = ["없음", "팝", "우시", "임팩트", "긴장감", "타이핑", "알림", "기타"];
export const TRANSITION_OPTIONS: TransitionOption[] = ["컷", "디졸브", "줌인", "줌아웃", "흑백", "흔들림", "블러", "없음"];
export const TEMPLATE_OPTIONS: TemplateOption[] = [
  "없음", "질환 4분할", "원인 구조도", "핵심 문장 카드", "강조 박스", "단계형 프로세스", "순환 구조", "비교 화면",
];

export const DRAW_COLORS = ["#111111", "#DC2626", "#2563EB", "#22876A", "#7C3AED", "#EB8F22"];
export const DRAW_WIDTHS = [2, 3, 5, 8];

// 자료/화면 스타일 → 기존 B-roll 프롬프트 생성 API의 스타일 프리셋 키로 매핑한다.
export const VISUAL_STYLE_TO_PROMPT_PRESET: Record<VisualStyle, string> = {
  "실사 사진": "PHOTO",
  "의료 일러스트": "MEDICAL_ILLUSTRATION",
  "인포그래픽": "INFOGRAPHIC",
  "의료 모식도": "DIAGRAM",
  "영상 B-roll": "CINEMATIC_BROLL",
  "스타일 일러스트": "STYLIZED_ILLUSTRATION",
};

export function defaultCaptionConfig(): CaptionConfig {
  return { type: "기본 자막", text: "", appear: "기본", position: "하단", color: CAPTION_COLORS[0], durationSec: null };
}

export function defaultVisualConfig(): VisualConfig {
  return { enabled: false, type: "자료 없음", description: "", layout: "전체 화면", durationSec: null, style: "실사 사진" };
}

// 마침표/물음표/느낌표 뒤 공백을 기준으로 문장을 나눈다 — 유튜브 대본은 대개 짧은 구어체
// 문장이라 이 정도로도 실사용에서 충분하고, 정교한 형태소 분석기 도입은 1차 범위 밖이다.
export function splitScriptIntoSentences(fullScript: string): string[] {
  return fullScript
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// 한국어 구어체 기준 대략 초당 4~5글자 낭독 속도로 예상 길이를 추정한다(정밀 TTS 계산 아님).
export function estimateDurationSec(text: string): number {
  return Math.max(1, Math.round(text.replace(/\s/g, "").length / 4.3));
}
