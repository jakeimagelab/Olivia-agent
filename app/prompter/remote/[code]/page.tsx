"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Play, Pause, RotateCcw, FlipHorizontal, FlipVertical, Gauge } from "lucide-react";
import { getSupabase } from "@/lib/supabase";

export default function PrompterRemotePage() {
  const params = useParams();
  const code = String(params.code);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [connected, setConnected] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speed, setSpeed] = useState(40);

  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase.channel(`prompter-${code}`, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: "state" }, ({ payload }) => {
      setConnected(true);
      setPlaying(payload.playing);
      setElapsed(payload.elapsed);
      setSpeed(payload.speed);
    });
    channel.subscribe();
    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [code]);

  const send = (type: string, value?: number) => {
    channelRef.current?.send({ type: "broadcast", event: "command", payload: { type, value } });
  };

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <main style={{ minHeight: "100dvh", background: "#0d1f1e", color: "#fff", padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 12, color: connected ? "#5cff8f" : "#ff9c5c", fontWeight: 700 }}>
          {connected ? "● 연결됨" : "○ 프롬프터 연결 대기 중…"}
        </p>
        <p style={{ fontSize: 40, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{fmtTime(elapsed)}</p>
      </div>

      <button
        onClick={() => send("toggle")}
        style={{ padding: "28px 0", borderRadius: 20, background: playing ? "#e85d2c" : "#155855", border: "none", color: "#fff", fontSize: 20, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
      >
        {playing ? <><Pause size={24} /> 일시정지</> : <><Play size={24} /> 재생</>}
      </button>

      <button onClick={() => send("restart")} style={{ padding: 16, borderRadius: 16, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <RotateCcw size={18} /> 처음으로
      </button>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => send("flipH")} style={{ flex: 1, padding: 16, borderRadius: 16, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <FlipHorizontal size={18} /> 좌우반전
        </button>
        <button onClick={() => send("flipV")} style={{ flex: 1, padding: 16, borderRadius: 16, background: "rgba(255,255,255,.1)", border: "none", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <FlipVertical size={18} /> 상하반전
        </button>
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <Gauge size={16} /> 속도 ({speed})
        </label>
        <input
          type="range" min={5} max={200} value={speed}
          onChange={(e) => { const v = Number(e.target.value); setSpeed(v); send("speed", v); }}
          style={{ width: "100%" }}
        />
      </div>
    </main>
  );
}
