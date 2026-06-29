"use client";

import React, { useEffect, useState } from "react";

const C = {
  teal: "#155855", green: "#22876A", white: "#FFFFFF",
  border: "rgba(21,88,85,.12)", muted: "#5A7470", hint: "#9BB5B0",
  txt: "#1C2B28", light: "#EAF4F2",
};

interface Cut {
  id: string;
  order: number;
  timecodeStart: string;
  timecodeEnd: string;
  visualNote: string;
  subtitleCopy: string;
  narrationCopy: string;
}

interface Scene {
  id: string;
  order: number;
  title: string;
  startSec: number;
  endSec: number;
  cuts: Cut[];
}

interface ContiData {
  title: string;
  hospital_name: string;
  scenes: Scene[];
  status: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function VideoContiViewPage({ params }: { params: any }) {
  const [data, setData] = useState<ContiData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { token } = await Promise.resolve(params);
        const r1 = await fetch(`/api/video-conti/share?token=${token}`);
        const d1 = await r1.json();
        if (!d1.ok) throw new Error(d1.error ?? "유효하지 않은 링크입니다");

        const r2 = await fetch(`/api/video-conti/${d1.videoContiId}`);
        const d2 = await r2.json();
        if (!d2.ok) throw new Error(d2.error ?? "콘티를 불러올 수 없습니다");

        setData(d2.data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params]);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fbfa" }}>
      <div style={{ fontSize: 14, color: C.hint }}>불러오는 중…</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fbfa" }}>
      <div style={{ fontSize: 14, color: "#E85D2C", background: "#fff5f5", padding: "16px 24px", borderRadius: 12, border: "1px solid #fca5a5" }}>{error}</div>
    </div>
  );

  if (!data) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fbfa" }}>
      {/* Header */}
      <header style={{
        background: C.teal, color: C.white, padding: "14px 24px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" style={{ height: 24, filter: "brightness(0) invert(1)" }} />
        <div>
          <div style={{ fontSize: 10, opacity: 0.7 }}>영상 콘티 공유</div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{data.hospital_name || data.title}</div>
        </div>
      </header>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "28px 16px" }}>
        {/* Title */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.teal, marginBottom: 4 }}>{data.title}</div>
          <div style={{ fontSize: 13, color: C.hint }}>총 {data.scenes?.length ?? 0}개 씬 · 상태: {data.status}</div>
        </div>

        {/* Timeline overview */}
        {data.scenes?.some(s => s.endSec > 0) && (
          <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: "16px 20px", marginBottom: 24, boxShadow: "0 1px 6px rgba(21,88,85,.04)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.hint, marginBottom: 10 }}>타임라인</div>
            <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden" }}>
              {data.scenes.map((s, i) => {
                const dur = (s.endSec - s.startSec) || 10;
                return (
                  <div key={s.id} style={{
                    flex: dur, background: i % 2 === 0 ? C.teal : C.green,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: C.white,
                    borderRight: "2px solid rgba(255,255,255,.4)",
                  }} title={s.title}>
                    {s.order}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scenes */}
        {(data.scenes ?? []).map(scene => (
          <div key={scene.id} style={{
            background: C.white, borderRadius: 12, border: `1px solid ${C.border}`,
            padding: "20px 24px", marginBottom: 16, boxShadow: "0 1px 6px rgba(21,88,85,.04)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: C.teal,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.white, fontSize: 14, fontWeight: 800, flexShrink: 0,
              }}>{scene.order}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.teal }}>{scene.title}</div>
                {(scene.startSec > 0 || scene.endSec > 0) && (
                  <div style={{ fontSize: 11, color: C.hint }}>{scene.startSec}s ~ {scene.endSec}s</div>
                )}
              </div>
            </div>

            {(scene.cuts ?? []).map(cut => (
              <div key={cut.id} style={{
                border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px",
                marginBottom: 10, background: C.light,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>
                  컷 {cut.order}
                  {(cut.timecodeStart || cut.timecodeEnd) && (
                    <span style={{ marginLeft: 8, fontWeight: 400 }}>{cut.timecodeStart} ~ {cut.timecodeEnd}</span>
                  )}
                </div>

                {cut.visualNote && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.hint, marginBottom: 2, textTransform: "uppercase" }}>비주얼</div>
                    <div style={{ fontSize: 13, color: C.txt }}>{cut.visualNote}</div>
                  </div>
                )}

                {cut.subtitleCopy && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.hint, marginBottom: 2, textTransform: "uppercase" }}>자막</div>
                    <div style={{ fontSize: 13, color: C.teal, fontWeight: 600 }}>{cut.subtitleCopy}</div>
                  </div>
                )}

                {cut.narrationCopy && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.hint, marginBottom: 2, textTransform: "uppercase" }}>나레이션</div>
                    <div style={{ fontSize: 13, color: C.txt, fontStyle: "italic" }}>{cut.narrationCopy}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        <div style={{ textAlign: "center", padding: "24px 0", fontSize: 12, color: C.hint }}>
          PHOTO CLINIC · 영상 콘티 자동 생성 시스템
        </div>
      </div>
    </div>
  );
}
