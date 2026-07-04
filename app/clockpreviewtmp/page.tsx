"use client";
import { useEffect, useState } from "react";

export default function ClockPreview() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const today = now ? now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" }) : "";
  const clock = now ? now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "--:--:--";
  const totalPending = 2;

  return (
    <div style={{ padding: 40, background: "#EDF5F3" }}>
      <div style={{ background: "linear-gradient(135deg,#155855 0%,#0d3e3b 100%)", borderRadius: 14, padding: "14px 16px", boxShadow: "0 4px 20px rgba(21,88,85,.18)", maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(232,93,44,.85)" }} />
            <div>
              <div style={{ fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,.45)", letterSpacing: ".1em", textTransform: "uppercase" }}>OLIVIA DAILY BRIEF</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)" }}>{today}</div>
            </div>
          </div>
          {totalPending > 0 && (
            <div style={{ background: "#E85D2C", borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 900, color: "#fff" }}>대기 {totalPending}건</div>
          )}
        </div>

        <div style={{ textAlign: "center", padding: "10px 0", marginBottom: 10, borderTop: "1px solid rgba(255,255,255,.1)", borderBottom: "1px solid rgba(255,255,255,.1)" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#6EE7B7", fontVariantNumeric: "tabular-nums", letterSpacing: ".08em", fontFamily: "'SF Mono','Menlo','Consolas',monospace" }}>{clock}</div>
        </div>

        <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: "0 0 10px", lineHeight: 1.5 }}>
          수고하고 계세요, 정연호 대표님. 오늘 할일 <span style={{ color: "#6EE7B7", fontWeight: 900 }}>모두 완료</span>했어요!
        </p>
      </div>
    </div>
  );
}
