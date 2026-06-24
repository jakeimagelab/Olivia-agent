"use client";

import { useEffect, useState } from "react";

type Phase = "entering" | "visible" | "hiding" | "gone";

const SESSION_KEY = "pc_splash_shown";

export default function SplashScreen() {
  // 기본값 "gone" → 서버 렌더/재방문 시 순간 flash 없음
  const [phase, setPhase] = useState<Phase>("gone");

  useEffect(() => {
    // 같은 세션에서 이미 한 번 표시했으면 스킵
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;

    // 첫 방문 → 스플래시 시퀀스 시작
    setPhase("entering");
    const t0 = setTimeout(() => setPhase("visible"), 60);
    const t1 = setTimeout(() => setPhase("hiding"),  1700);
    const t2 = setTimeout(() => {
      setPhase("gone");
      sessionStorage.setItem(SESSION_KEY, "1"); // 이 세션에서 표시 완료 기록
    }, 2350);
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === "gone") return null;

  const entering = phase === "entering";
  const hiding   = phase === "hiding";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "#0F4440",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 0,
      opacity: hiding ? 0 : 1,
      transition: hiding ? "opacity 0.65s cubic-bezier(.4,0,.2,1)" : "none",
      pointerEvents: "none",
    }}>

      {/* 로고 */}
      <img
        src="/assets/photoclinic-logo.png"
        alt="포토클리닉 로고"
        style={{
          width: 80, height: 80, objectFit: "contain",
          opacity: entering ? 0 : 1,
          transform: entering ? "scale(0.78) translateY(6px)" : "scale(1) translateY(0)",
          transition: "opacity 0.55s cubic-bezier(.34,1.3,.64,1), transform 0.55s cubic-bezier(.34,1.3,.64,1)",
          marginBottom: 22,
        }}
      />

      {/* 브랜드 텍스트 */}
      <div style={{
        opacity: entering ? 0 : 1,
        transform: entering ? "translateY(10px)" : "translateY(0)",
        transition: "opacity 0.5s ease 0.12s, transform 0.5s ease 0.12s",
        textAlign: "center",
      }}>
        <div style={{
          fontSize: 26, fontWeight: 900, color: "#fff",
          letterSpacing: "-0.4px", lineHeight: 1.15,
          fontFamily: "'Noto Sans KR', sans-serif",
        }}>
          포토클리닉
        </div>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: "rgba(255,255,255,0.55)",
          letterSpacing: "0.12em",
          marginTop: 6,
          fontFamily: "'Noto Sans KR', sans-serif",
        }}>
          AI 에이전트
        </div>
      </div>

      {/* 로딩 점 */}
      <div style={{
        display: "flex", gap: 7, marginTop: 40,
        opacity: entering ? 0 : 1,
        transition: "opacity 0.4s ease 0.35s",
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            display: "block", width: 5, height: 5, borderRadius: "50%",
            background: "rgba(255,255,255,0.4)",
            animation: `spl-pulse 1.3s ease-in-out ${i * 0.22}s infinite`,
          }}/>
        ))}
      </div>

      <style>{`
        @keyframes spl-pulse {
          0%,100%  { opacity:.25; transform:scale(1); }
          45%      { opacity:1;   transform:scale(1.4); }
        }
      `}</style>
    </div>
  );
}
