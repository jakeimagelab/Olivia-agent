// 코드 요청서 — Olivia UX/Motion Core(2026-08-16). 컴포넌트마다 duration/ease가 제각각이면
// 페이지 전환·패널 접힘·모달이 서로 다른 "감속감"으로 느껴진다 — 한 곳에서만 값을 정의한다.
export const oliviaMotion = {
  quick: {
    duration: 0.16,
    ease: [0.22, 1, 0.36, 1],
  },
  page: {
    duration: 0.22,
    ease: [0.22, 1, 0.36, 1],
  },
  panel: {
    type: "spring" as const,
    stiffness: 260,
    damping: 30,
  },
  modal: {
    duration: 0.26,
    ease: [0.22, 1, 0.36, 1],
  },
};

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
