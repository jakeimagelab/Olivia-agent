"use client";

import { useEffect, useState } from "react";

type Phase = "gone" | "entering" | "visible" | "dissolving" | "chat-open" | "revealing";

const SESSION_KEY = "pc_home_splash_shown";

// 앱을 처음 열거나 새로고침했을 때만 한 번 — 세션에 이미 기록이 있으면 phase는 계속
// "gone"으로 남아 아무것도 렌더링하지 않는다(서버 렌더와도 항상 일치해서 깜빡임이 없다).
export default function OliviaSplash() {
  const [phase, setPhase] = useState<Phase>("gone");

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
    sessionStorage.setItem(SESSION_KEY, "1");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setPhase("visible");
      const t = setTimeout(() => setPhase("gone"), 420);
      return () => clearTimeout(t);
    }

    setPhase("entering");
    const timers = [
      setTimeout(() => setPhase("visible"), 60),
      setTimeout(() => setPhase("dissolving"), 900),
      setTimeout(() => setPhase("chat-open"), 1300),
      setTimeout(() => setPhase("revealing"), 2050),
      setTimeout(() => setPhase("gone"), 2400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  if (phase === "gone") return null;

  const textVisible = phase === "visible";
  const shrunk = phase === "dissolving" || phase === "chat-open" || phase === "revealing";
  const chatOpen = phase === "chat-open" || phase === "revealing";
  const revealing = phase === "revealing";

  return (
    <div className={`olivia-splash${revealing ? " is-revealing" : ""}`} style={{ pointerEvents: revealing ? "none" : "auto" }} aria-hidden="true">
      <div className={`olivia-splash__logo${phase !== "entering" ? " is-in" : ""}${shrunk ? " is-shrunk" : ""}`}>
        <img src="/assets/photoclinic-mark.png" alt="" />
      </div>
      <p className={`olivia-splash__brand${textVisible ? " is-visible" : ""}`}>Photoclinic Olivia</p>
      <div className={`olivia-splash__chat${chatOpen ? " is-open" : ""}`} />
    </div>
  );
}
