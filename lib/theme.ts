// lib/theme.ts — Olivia Agent 전역 디자인 토큰
export const C = {
  // ── Brand Colors ──────────────────────────────────────
  teal:    'var(--ui-brand-green, #155855)',   // Primary
  orange:  'var(--ui-orange, #E85D2C)',   // Accent / CTA
  gold:    '#EB8F22',   // Warning / Highlight
  sage:    'var(--ui-brand-green, #569082)',   // Secondary

  // ── Surface ──────────────────────────────────────────
  bg:      'var(--ui-bg, #F4F3EF)',   // 페이지 배경 (웜화이트)
  white:   'var(--ui-surface, #FCFBF8)',   // 카드·입력 표면
  mint:    'var(--ui-green-soft, #E2EBE3)',   // 옅은 그린 상태 배경
  dark:    '#1C2B28',   // 미디어 판단 패널 / 역상 UI

  // ── Text ────────────────────────────────────────────
  ink:     'var(--ui-text, #2F3833)',   // 본문
  muted:   'var(--ui-text-secondary, #626D65)',   // 보조
  hint:    'var(--ui-text-secondary, #9BB5B0)',   // 비활성 / 플레이스홀더

  // ── Border ──────────────────────────────────────────
  border:  'var(--ui-border, #D5DBD3)',

  // ── Semantic ─────────────────────────────────────────
  success: 'var(--ui-brand-green, #22876A)',
  danger:  '#DC2626',
  purple:  '#7C3AED',

  // ── Aliases — 기존 페이지별 const C가 쓰던 다른 키 이름을
  // 값 변경 없이 그대로 받아주기 위한 별칭. 새 코드는 위 표준 키를 쓸 것.
  surface: 'var(--ui-surface, #FCFBF8)',        // = white
  txt:     'var(--ui-text, #2F3833)',        // = ink
  light:   'var(--ui-green-soft, #E2EBE3)',        // = mint
  yellow:  '#EB8F22',        // = gold
  green:   'var(--ui-brand-green, #22876A)',        // = success
  red:     '#DC2626',        // = danger
} as const;

// ── Radius ───────────────────────────────────────────────
export const R = {
  xs:   6,    // 태그, 뱃지
  sm:   10,   // 인풋, 버튼(sm)
  md:   10,   // 버튼(primary)
  lg:   16,   // 카드
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
