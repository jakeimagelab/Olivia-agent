"use client";

import { useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";

const SESSION_KEY = "pc_home_splash_shown";
const HOME_PATH = "/admin/dashboard/home";
type SplashPhase = "arriving" | "handoff";

// 앱을 처음 열거나 새로고침했을 때만 한 번 — 세션에 이미 기록이 있으면 show는 false로
// 남아 아무것도 렌더링하지 않는다(서버 렌더와도 항상 일치해서 깜빡임이 없다).
//
// Framer Motion의 duration+times keyframe 애니메이션으로 처음 구현했는데, 이 프로젝트의
// framer-motion 13 + React 19 조합에서 "mount 이후 값이 바뀌며 트리거되는 keyframe 애니메이션"의
// 내부 시계가 실제 트리거 시점이 아니라 그보다 앞선(페이지가 열린 뒤 대략 일정한 오프셋만큼
// 앞선) 기준점에서 시작해버리는 문제를 실측으로 확인했다(트리거를 몇 초 뒤로 늦춰도 그
// 오프셋만큼 그대로 밀려서 재현됨 — Playwright로 브라우저 내부 rAF 트레이스까지 찍어서
// 재현했다). 그래서 이 시퀀스는 순수 CSS @keyframes로 다시 구현한다 — 브라우저 자체
// 컴포지터가 시간을 재는 방식이라 이런 문제에서 자유롭고, 이 프로젝트에서 이미 검증된
// 패턴이다(app/admin/admin.css의 .olivia-home-orb transition 참고).
export default function OliviaSplash() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<SplashPhase>("arriving");
  const [reduced, setReduced] = useState(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (pathname !== HOME_PATH) {
      delete root.dataset.oliviaSplash;
      setShow(false);
      return;
    }

    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        delete root.dataset.oliviaSplash;
        return;
      }
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // 저장소 사용이 제한된 환경에서는 홈을 가리지 않고 바로 표시한다.
      delete root.dataset.oliviaSplash;
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const handoffDelay = prefersReducedMotion ? 70 : 520;
    const completionDelay = prefersReducedMotion ? 280 : 1650;

    setReduced(prefersReducedMotion);
    setPhase("arriving");
    setShow(true);
    root.dataset.oliviaSplash = "active";

    const handoffTimer = window.setTimeout(() => {
      root.dataset.oliviaSplash = "handoff";
      setPhase("handoff");
    }, handoffDelay);
    // animationend가 브라우저/탭 상태에 따라 누락되어도 오버레이가 남지 않는 종료 fallback.
    const completionTimer = window.setTimeout(() => {
      delete root.dataset.oliviaSplash;
      setShow(false);
    }, completionDelay);

    return () => {
      window.clearTimeout(handoffTimer);
      window.clearTimeout(completionTimer);
      delete root.dataset.oliviaSplash;
    };
  }, [pathname]);

  if (!show) return null;

  return (
    <div
      className={`olivia-splash is-${phase}${reduced ? " is-reduced" : ""}`}
      aria-hidden="true"
    >
      <div className="olivia-splash__presence">
        <div className="olivia-splash__logo">
          <img src="/assets/photoclinic-mark.png" alt="" />
        </div>
        <p className="olivia-splash__brand">Photoclinic Olivia</p>
      </div>
    </div>
  );
}
