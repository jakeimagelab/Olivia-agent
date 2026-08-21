"use client";

import { useEffect, useState, type CSSProperties } from "react";

const SESSION_KEY = "pc_home_splash_shown";

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
  const [show, setShow] = useState(false);
  const [play, setPlay] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [corner, setCorner] = useState({ x: -248, y: -78 });

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
    sessionStorage.setItem(SESSION_KEY, "1");
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    // 로고가 이동할 "패널 좌측 상단" 좌표를 실제 CSS 패널 크기(모바일 브레이크포인트 포함)에
    // 맞춰 근사 계산한다 — 화면 중앙(로고 시작 위치) 기준 상대 오프셋.
    setCorner(window.innerWidth <= 560 ? { x: -142, y: -55 } : { x: -248, y: -78 });
    setShow(true);
  }, []);

  useEffect(() => {
    if (!show) return;
    const raf = requestAnimationFrame(() => setPlay(true));
    return () => cancelAnimationFrame(raf);
  }, [show]);

  if (!show) return null;

  return (
    <div
      className={`olivia-splash${play ? " is-playing" : ""}${reduced ? " is-reduced" : ""}`}
      style={{ "--olivia-splash-corner-x": `${corner.x}px`, "--olivia-splash-corner-y": `${corner.y}px` } as CSSProperties}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setShow(false);
      }}
      aria-hidden="true"
    >
      {/* 1. 조용한 도착(0~0.6s) — 로고와 브랜드가 차분히 나타난다.
          2. 깨어남(0.6~1.2s) — 텍스트가 사라지고 로고가 작아지는 동안 라인이 양옆으로 뻗는다.
          3. 채팅 패널 펼침(1.2~1.8s) — 라인이 패널 중심이 되어 위아래로 펼쳐지고, 로고는
             패널 좌측 상단으로 자리를 옮긴다.
          4. 홈 화면 완성(1.8~2.3s) — 패널이 다 열린 채 오버레이가 걷히며 실제 홈이 드러난다. */}
      <div className="olivia-splash__logo">
        <img src="/assets/photoclinic-mark.png" alt="" />
      </div>
      <p className="olivia-splash__brand">Photoclinic Olivia</p>
      <div className="olivia-splash__chat" />
    </div>
  );
}
