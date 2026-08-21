"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const SESSION_KEY = "pc_home_splash_shown";
const TOTAL = 2.3; // seconds — 참고 레퍼런스의 4단계 시간대(0.6/1.2/1.8/2.3s)를 그대로 따른다.
// 정규화 시각(0~1) — 각 단계 경계. 로고 이미지 자체는 그대로 두고(마크 파일 재사용),
// 위치·크기·투명도만 이 경계를 따라 하나의 연속된 keyframe으로 보간한다.
const T1 = 0.6 / TOTAL;  // 조용한 도착 끝
const T2 = 1.2 / TOTAL;  // 깨어남(텍스트 소멸 + 라인이 양옆으로 뻗음) 끝
const T3 = 1.8 / TOTAL;  // 채팅 패널 펼침(로고가 좌측 상단으로 이동) 끝

export default function OliviaSplash() {
  const [show, setShow] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [corner, setCorner] = useState({ x: -248, y: -78 });

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
    sessionStorage.setItem(SESSION_KEY, "1");
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    // 로고가 이동할 "패널 좌측 상단" 좌표를 실제 CSS 패널 크기(모바일 브레이크포인트 포함)에
    // 맞춰 근사 계산한다 — 화면 중앙(로고 시작 위치) 기준 상대 오프셋.
    setCorner(window.innerWidth <= 560 ? { x: -142, y: -55 } : { x: -248, y: -78 });
    setShow(true);
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

  const ease = [0.22, 0.61, 0.36, 1] as const;

  return (
    <motion.div
      className="olivia-splash"
      style={{ pointerEvents: revealing ? "none" : "auto" }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{ duration: TOTAL, times: [0, 0.87, 1], ease: "easeInOut" }}
      onAnimationComplete={() => setShow(false)}
      aria-hidden="true"
    >
      {/* 1. 조용한 도착(0~0.6s) — 로고와 브랜드가 차분히 나타난다.
          2. 깨어남(0.6~1.2s) — 텍스트가 사라지고 로고가 작아지는 동안 라인이 양옆으로 뻗는다.
          3. 채팅 패널 펼침(1.2~1.8s) — 라인이 패널 중심이 되어 위아래로 펼쳐지고, 로고는
             패널 좌측 상단으로 자리를 옮긴다.
          4. 홈 화면 완성(1.8~2.3s) — 패널이 다 열린 채 오버레이가 걷히며 실제 홈이 드러난다. */}
      <motion.div
        className="olivia-splash__logo"
        initial={{ opacity: 0, scale: 0.94, x: 0, y: 0 }}
        animate={{
          opacity: [0, 1, 1, 1, 1],
          scale: [0.94, 1, 0.62, 0.32, 0.32],
          x: [0, 0, 0, corner.x, corner.x],
          y: [0, 0, 0, corner.y, corner.y],
        }}
        transition={{ duration: TOTAL, times: [0, T1, T2, T3, 1], ease }}
      >
        <img src="/assets/photoclinic-mark.png" alt="" />
      </motion.div>
      <motion.p
        className="olivia-splash__brand"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: [0, 1, 1, 0], y: [6, 0, 0, -4], filter: ["blur(0px)", "blur(0px)", "blur(0px)", "blur(4px)"] }}
        transition={{ duration: TOTAL, times: [0, T1, T2, T2 + 0.02], ease }}
      />
      <motion.div
        className="olivia-splash__chat"
        initial={{ opacity: 0, scaleX: 0, scaleY: 0.018 }}
        animate={{ opacity: [0, 0, 1, 1, 1], scaleX: [0, 0, 1, 1, 1], scaleY: [0.018, 0.018, 0.018, 1, 1] }}
        transition={{ duration: TOTAL, times: [0, T1, T2, T3, 1], ease }}
      />
    </motion.div>
  );
}
