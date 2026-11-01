/** 업무일지 전용 UI2 매핑. 고객 포털까지 쓰는 전역 theme.ts는 바꾸지 않는다. */
export const C = {
  teal: "var(--ui2-green)",
  orange: "var(--ui2-run)",
  gold: "var(--ui2-warn)",
  sage: "var(--ui2-green)",
  bg: "var(--ui2-bg)",
  white: "var(--ui2-card)",
  mint: "var(--ui2-sunk)",
  dark: "var(--ui2-photo)",
  ink: "var(--ui2-text)",
  muted: "var(--ui2-dim)",
  hint: "var(--ui2-faint)",
  border: "var(--ui2-line)",
  borderStrong: "var(--ui2-line-strong)",
  success: "var(--ui2-ok)",
  danger: "var(--ui2-risk)",
  purple: "var(--ui2-green)",
  surface: "var(--ui2-card)",
  txt: "var(--ui2-text)",
  light: "var(--ui2-sunk)",
  yellow: "var(--ui2-warn)",
  green: "var(--ui2-ok)",
  red: "var(--ui2-risk)",
} as const;

export const R = {
  xs: 6,
  sm: 10,
  md: 10,
  lg: 16,
  xl: 16,
  full: 999,
} as const;

export const F = {
  assist: "var(--ui2-f1)",
  body: "var(--ui2-f2)",
  title: "var(--ui2-f3)",
  screen: "var(--ui2-f4)",
  metric: "var(--ui2-f5)",
} as const;
