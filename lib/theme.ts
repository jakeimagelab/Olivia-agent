// lib/theme.ts — Olivia Agent 전역 디자인 토큰
export const C = {
  // ── Brand Colors ──────────────────────────────────────
  teal:    '#155855',   // Primary
  orange:  '#E85D2C',   // Accent / CTA
  gold:    '#EB8F22',   // Warning / Highlight
  sage:    '#569082',   // Secondary

  // ── Surface ──────────────────────────────────────────
  bg:      '#F5F0E8',   // 페이지 배경 (아이보리)
  white:   '#FFFFFF',   // 카드 배경
  mint:    '#EAF4F2',   // 강조 배경

  // ── Text ────────────────────────────────────────────
  ink:     '#1C2B28',   // 본문
  muted:   '#5A7470',   // 보조
  hint:    '#9BB5B0',   // 비활성 / 플레이스홀더

  // ── Border ──────────────────────────────────────────
  border:  'rgba(21, 88, 85, 0.12)',

  // ── Semantic ─────────────────────────────────────────
  success: '#22876A',
  danger:  '#DC2626',
  purple:  '#7C3AED',

  // ── Aliases — 기존 페이지별 const C가 쓰던 다른 키 이름을
  // 값 변경 없이 그대로 받아주기 위한 별칭. 새 코드는 위 표준 키를 쓸 것.
  surface: '#FFFFFF',        // = white
  txt:     '#1C2B28',        // = ink
  light:   '#EAF4F2',        // = mint
  yellow:  '#EB8F22',        // = gold
  green:   '#22876A',        // = success
  red:     '#DC2626',        // = danger
} as const;

// ── Radius ───────────────────────────────────────────────
export const R = {
  xs:   6,    // 태그, 뱃지
  sm:   8,    // 인풋, 버튼(sm)
  md:   10,   // 버튼(primary)
  lg:   12,   // 카드
  xl:   16,   // 모달, 큰 패널
  full: 999,  // 필 모양 뱃지
} as const;

// ── Font Size ─────────────────────────────────────────────
export const FS = {
  xs:   11,   // caption, 날짜, 힌트
  sm:   12,   // label, 보조 정보
  md:   13,   // body (기본 본문)
  lg:   15,   // 서브 타이틀
  xl:   18,   // 섹션 타이틀
  xxl:  24,   // 페이지 타이틀
} as const;

// ── Spacing ──────────────────────────────────────────────
export const SP = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 36,
} as const;
