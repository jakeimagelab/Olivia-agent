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
const ease = [0.22, 0.61, 0.36, 1] as const;

// 정지 상태(아직 재생 전) 값 — mount 직후 이 값으로 한 번 그려진 뒤, 다음 프레임에
// "값을 바꿔서" keyframe 애니메이션을 트리거한다. mount와 동시에 initial→animate로
// 재생하면(React 19 + Framer Motion 13 조합에서 실측 확인됨) 트윈이 재생되지 않고 바로
// 최종 keyframe 값으로 점프해버리는 문제가 있었다 — 이미 마운트된 뒤 값이 바뀌는 형태여야
// 정상적으로 애니메이션이 재생된다.
const REST = {
  overlay: { opacity: 1 },
  logo: { opacity: 0, scale: 0.94, x: 0, y: 0 },
  brand: { opacity: 0, y: 6, filter: "blur(0px)" },
  chat: { opacity: 0, scaleX: 0, scaleY: 0.018 },
};

// 앱을 처음 열거나 새로고침했을 때만 한 번 — 세션에 이미 기록이 있으면 show는 false로
// 남아 아무것도 렌더링하지 않는다(서버 렌더와도 항상 일치해서 깜빡임이 없다).
let __renderCount = 0;
export default function OliviaSplash() {
  __renderCount++;
  if (typeof window !== "undefined") { console.log("[OliviaSplash] render #" + __renderCount + " t=" + performance.now().toFixed(1)); }
  const [show, setShow] = useState(false);
  const [play, setPlay] = useState(false);
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
  }, []);

  useEffect(() => {
    if (!show) return;
    // show=true가 커밋된 직후 바로 이어서 실행되는 경우, 그 사이 브라우저가 실제로 한 번도
    // 페인트하지 않을 수 있다 — rAF 한 번만으로는 "정지 상태가 실제로 그려진 뒤 값이
    // 바뀌는" 조건이 보장되지 않아 애니메이션이 여전히 건너뛰었다(실측 확인됨). 두 번
    // 연속 rAF로 확실히 한 프레임을 그리게 한 뒤에 play를 켠다.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPlay(true));
    });
    const revealTimer = setTimeout(() => setRevealing(true), TOTAL * 1000 * 0.9);
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); clearTimeout(revealTimer); };
  }, [show]);

  if (!show) return null;

  if (reduced) {
    return (
      <motion.div
        className="olivia-splash"
        style={{ pointerEvents: "none" }}
        animate={{ opacity: play ? 0 : 1 }}
        transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
        onAnimationComplete={() => play && setShow(false)}
        aria-hidden="true"
      >
        <div className="olivia-splash__logo">
          <img src="/assets/photoclinic-mark.png" alt="" />
        </div>
        <p className="olivia-splash__brand">Photoclinic Olivia</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="olivia-splash"
      style={{ pointerEvents: revealing ? "none" : "auto" }}
      animate={play ? { opacity: [1, 1, 0] } : REST.overlay}
      transition={play ? { duration: TOTAL, times: [0, 0.87, 1], ease: "easeInOut" } : { duration: 0 }}
      onAnimationComplete={() => play && setShow(false)}
      aria-hidden="true"
    >
      {/* 1. 조용한 도착(0~0.6s) — 로고와 브랜드가 차분히 나타난다.
          2. 깨어남(0.6~1.2s) — 텍스트가 사라지고 로고가 작아지는 동안 라인이 양옆으로 뻗는다.
          3. 채팅 패널 펼침(1.2~1.8s) — 라인이 패널 중심이 되어 위아래로 펼쳐지고, 로고는
             패널 좌측 상단으로 자리를 옮긴다.
          4. 홈 화면 완성(1.8~2.3s) — 패널이 다 열린 채 오버레이가 걷히며 실제 홈이 드러난다. */}
      <motion.div
        className="olivia-splash__logo"
        animate={play ? {
          opacity: [0, 1, 1, 1, 1],
          scale: [0.94, 1, 0.62, 0.32, 0.32],
          x: [0, 0, 0, corner.x, corner.x],
          y: [0, 0, 0, corner.y, corner.y],
        } : REST.logo}
        transition={play ? { duration: TOTAL, times: [0, T1, T2, T3, 1], ease } : { duration: 0 }}
      >
        <img src="/assets/photoclinic-mark.png" alt="" />
      </motion.div>
      <motion.p
        className="olivia-splash__brand"
        animate={play ? {
          opacity: [0, 1, 1, 0],
          y: [6, 0, 0, -4],
          filter: ["blur(0px)", "blur(0px)", "blur(0px)", "blur(4px)"],
        } : REST.brand}
        transition={play ? { duration: TOTAL, times: [0, T1, T2, T2 + 0.02], ease } : { duration: 0 }}
      >
        Photoclinic Olivia
      </motion.p>
      <motion.div
        className="olivia-splash__chat"
        animate={play ? {
          opacity: [0, 0, 1, 1, 1],
          scaleX: [0, 0, 1, 1, 1],
          scaleY: [0.018, 0.018, 0.018, 1, 1],
        } : REST.chat}
        transition={play ? { duration: TOTAL, times: [0, T1, T2, T3, 1], ease } : { duration: 0 }}
      />
    </motion.div>
  );
}
