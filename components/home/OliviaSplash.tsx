"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const SESSION_KEY = "pc_home_splash_shown";
const TOTAL = 2.2; // seconds — 전체 시퀀스 길이

// 앱을 처음 열거나 새로고침했을 때만 한 번 — 세션에 이미 기록이 있으면 show는 false로
// 남아 아무것도 렌더링하지 않는다(서버 렌더와도 항상 일치해서 깜빡임이 없다).
export default function OliviaSplash() {
  const [show, setShow] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
    sessionStorage.setItem(SESSION_KEY, "1");
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setShow(true);
    // 오버레이가 실제로 옅어지기 시작하는 시점부터 클릭·스크롤을 막지 않는다.
    const revealTimer = setTimeout(() => setRevealing(true), TOTAL * 1000 * 0.9);
    return () => clearTimeout(revealTimer);
  }, []);

  if (!show) return null;

  if (reduced) {
    return (
      <motion.div
        className="olivia-splash"
        style={{ pointerEvents: "none" }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
        onAnimationComplete={() => setShow(false)}
        aria-hidden="true"
      >
        <div className="olivia-splash__logo">
          <img src="/assets/photoclinic-mark.png" alt="" />
        </div>
        <p className="olivia-splash__brand">Photoclinic Olivia</p>
      </motion.div>
    );
  }

  // 단계별로 JS state를 갈아끼우며 각자 다른 CSS transition을 새로 트리거하던 예전 방식은
  // 전환마다 미묘한 타이밍 어긋남("뚝뚝 끊김")이 생겼다 — 이제는 요소마다 하나의 연속된
  // keyframe 배열을 한 번에 넘겨 같은 시계로 보간하고, 로고 축소가 끝나기 전에 채팅창이
  // 이미 열리기 시작하도록 구간을 겹쳐서 이어지는 느낌을 만든다.
  return (
    <motion.div
      className="olivia-splash"
      style={{ pointerEvents: revealing ? "none" : "auto" }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{ duration: TOTAL, times: [0, 0.92, 1], ease: "easeInOut" }}
      onAnimationComplete={() => setShow(false)}
      aria-hidden="true"
    >
      <motion.div
        className="olivia-splash__logo"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: [0, 1, 1, 1], scale: [0.94, 1, 1, 0.66] }}
        transition={{ duration: TOTAL, times: [0, 0.18, 0.34, 0.55], ease: [0.22, 0.61, 0.36, 1] }}
      >
        <img src="/assets/photoclinic-mark.png" alt="" />
      </motion.div>
      <motion.p
        className="olivia-splash__brand"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: [0, 1, 1, 0], y: [6, 0, 0, -4], filter: ["blur(0px)", "blur(0px)", "blur(0px)", "blur(4px)"] }}
        transition={{ duration: TOTAL, times: [0, 0.18, 0.34, 0.55], ease: [0.22, 0.61, 0.36, 1] }}
      >
        Photoclinic Olivia
      </motion.p>
      <motion.div
        className="olivia-splash__chat"
        initial={{ opacity: 0, scaleY: 0.05 }}
        animate={{ opacity: [0, 0, 1, 1], scaleY: [0.05, 0.05, 1, 1] }}
        transition={{ duration: TOTAL, times: [0, 0.42, 0.92, 1], ease: [0.22, 0.61, 0.36, 1] }}
      />
    </motion.div>
  );
}
