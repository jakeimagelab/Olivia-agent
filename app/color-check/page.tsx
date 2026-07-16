"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Camera } from "lucide-react";

const C = {
  teal: "#155855", orange: "#E85D2C", bg: "#F0F9F8",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2",
};

const DNA_HSL = [
  { label: "레드 (Reds)",      h: 0,  s: -8,  l: 5 },
  { label: "오렌지 (Oranges)", h: 3,  s: -6,  l: 4 },
  { label: "옐로우 (Yellows)", h: 0,  s: -10, l: 0 },
];

type Analysis = {
  detected: boolean;
  matchScore?: number;
  current?: { highlight: any; mid: any; shadow: any };
  target?:  { highlight: any; mid: any; shadow: any };
  diff?:    { highlight: any; mid: any; shadow: any };
  colorTemp?: string; saturation?: string;
  skinNote?: string; confidence?: number;
  adjustments?: any;
};

function SwatchCompare({ label, current, target, diff }: {
  label: string; current: any; target: any; diff: any;
}) {
  const ok   = diff.dist <= 15;
  const warn = diff.dist > 30;
  return (
    <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: ok ? 0 : 10 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: current.hex, border: `1px solid ${C.border}`, marginBottom: 4 }}/>
          <div style={{ fontSize: 9, color: C.hint, fontWeight: 700 }}>현재</div>
          <div style={{ fontSize: 9, color: C.muted }}>{current.hex}</div>
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{
            fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 6,
            background: ok ? "#E6F4EA" : warn ? "#FFF0EB" : "#FFFBEA",
            color: ok ? "#166534" : warn ? C.orange : "#92400E",
          }}>
            {ok ? "✓ 일치" : `차이 ${diff.dist}`}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: target.hex, border: `1px solid ${C.border}`, marginBottom: 4 }}/>
          <div style={{ fontSize: 9, color: C.hint, fontWeight: 700 }}>DNA 타겟</div>
          <div style={{ fontSize: 9, color: C.muted }}>{target.hex}</div>
        </div>
      </div>
      {!ok && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {(["r","g","b"] as const).map(ch => {
            const v = diff[ch];
            const color = ch === "r" ? "#DC2626" : ch === "g" ? "#059669" : "#2563EB";
            return (
              <div key={ch} style={{ textAlign: "center", padding: "5px 0", background: "#FAFAFA", borderRadius: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color, textTransform: "uppercase" }}>{ch}</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: v > 0 ? "#059669" : v < 0 ? "#DC2626" : C.hint }}>
                  {v > 0 ? `+${v}` : v}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdjCard({ label, value, sub, hi }: { label: string; value: string|number; sub?: string; hi?: boolean }) {
  const s = String(value);
  return (
    <div style={{ background: hi ? C.teal : "#1C2B28", borderRadius: 10, padding: "12px 14px", border: hi ? `2px solid ${C.orange}` : "none" }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,.45)", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1, color: s.startsWith("+") ? "#6EE7B7" : s.startsWith("-") ? "#FCA5A5" : "#fff" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function ColorCheckPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [imgB64, setImgB64]   = useState("");
  const [imgMime, setImgMime] = useState("image/jpeg");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<Analysis | null>(null);
  const [error,   setError]   = useState("");
  const [tab,     setTab]     = useState<"compare"|"guide">("compare");

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setResult(null); setError(""); setImgMime(file.type);
    const reader = new FileReader();
    reader.onload = e => {
      const url = e.target?.result as string;
      setPreview(url);
      setImgB64(url.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!imgB64) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/color-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: imgB64, imageMime: imgMime }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResult(data); setTab("compare");
    } catch (e: any) {
      setError(e.message || "분석 실패");
    } finally { setLoading(false); }
  };

  const sc = result?.matchScore ?? 0;
  const scoreColor = sc >= 80 ? "#059669" : sc >= 60 ? "#D97706" : "#DC2626";
  const scoreBg    = sc >= 80 ? "#E6F4EA" : sc >= 60 ? "#FFFBEA" : "#FFF0EB";
  const scoreLabel = sc >= 80 ? "포토클리닉 DNA 일치" : sc >= 60 ? "소폭 조정 필요" : "보정 필요";

  return (
    <main style={{ minHeight: "100vh", background: C.bg, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif", color: C.txt }}>

      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="" className="pc-header-logo"/>
            <span className="pc-header-title">색감 체크</span>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 80px" }}>

        <div style={{ display: "grid", gridTemplateColumns: result ? "340px 1fr" : "560px", gap: 24, justifyContent: "center" }}>

          {/* ── 왼쪽 패널 ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {!preview && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: C.orange, letterSpacing: ".18em", textTransform: "uppercase", marginBottom: 6 }}>PHOTO CLINIC</div>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: C.teal }}>색감 체크</h1>
                <p style={{ margin: "8px 0 0", fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
                  촬영 후 샘플 사진을 올리면<br/>
                  포토클리닉 컬러 DNA 기준으로 피부톤을 분석하고<br/>
                  Camera Raw 보정값을 알려드립니다.
                </p>
              </div>
            )}

            {/* 업로드 */}
            {!preview ? (
              <div
                onClick={() => inputRef.current?.click()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) handleFile(f); }}
                onDragOver={e => e.preventDefault()}
                style={{ border: `2px dashed ${C.border}`, borderRadius: 16, background: C.white, padding: "52px 24px", textAlign: "center", cursor: "pointer" }}
              >
                <div style={{ fontSize: 40, marginBottom: 14 }}>📷</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: C.teal, marginBottom: 6 }}>사진 업로드</div>
                <div style={{ fontSize: 12, color: C.hint }}>드래그하거나 클릭<br/>JPG · PNG · WEBP</div>
                <input ref={inputRef} type="file" accept="image/*" style={{ display:"none" }}
                  onChange={e => { const f = e.target.files?.[0]; if(f) handleFile(f); }}/>
              </div>
            ) : (
              <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <img src={preview} alt="" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block" }}/>
                <div style={{ padding: "12px 14px", display: "flex", gap: 8 }}>
                  <button onClick={analyze} disabled={loading} style={{
                    flex: 1, height: 44, border: "none", borderRadius: 10,
                    background: loading ? C.hint : C.teal, color: "#fff",
                    fontWeight: 900, fontSize: 14, cursor: loading ? "not-allowed" : "pointer",
                    fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                    {loading
                      ? <><RefreshCw size={15} style={{ animation: "spin .7s linear infinite" }}/> 분석 중…</>
                      : <><Camera size={15}/> AI 색감 분석</>}
                  </button>
                  <button onClick={() => { setPreview(""); setImgB64(""); setResult(null); setError(""); }}
                    style={{ width: 44, height: 44, border: `1.5px solid ${C.border}`, borderRadius: 10, background: C.white, cursor: "pointer", fontSize: 18 }}>↺</button>
                </div>
              </div>
            )}

            {error && (
              <div style={{ padding: "12px 14px", background: "#FFF0EB", borderRadius: 10, fontSize: 13, color: C.orange, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }}/>{error}
              </div>
            )}

            {/* DNA 기준 미니카드 */}
            <div style={{ background: "#1C2B28", borderRadius: 14, padding: "18px" }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,.35)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 3 }}>PHOTO CLINIC</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#fff", marginBottom: 2 }}>컬러 DNA v1</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginBottom: 12 }}>클린 뉴트럴 · 신뢰감형</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {[["#D1CECC","배경"],["#F0EBCC","하이"],["#C4B37E","미드"],["#A8A55A","쉐도"]].map(([hex, lbl]) => (
                  <div key={hex} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ height: 28, borderRadius: 6, background: hex, marginBottom: 4 }}/>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,.35)", fontWeight: 700 }}>{lbl}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", lineHeight: 1.9 }}>
                5900K · Tint +3 · Exposure +0.2<br/>
                Highlights -30 · Shadows +20 · Vibrance -5
              </div>
            </div>
          </div>

          {/* ── 오른쪽: 결과 ── */}
          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {!result.detected ? (
                <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "48px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🤔</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: C.teal }}>피부를 찾지 못했어요</div>
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>인물이 잘 보이는 사진을 올려주세요</div>
                </div>
              ) : (
                <>
                  {/* 매칭 점수 */}
                  <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "18px 22px", display: "flex", gap: 20, alignItems: "center" }}>
                    <div style={{
                      width: 76, height: 76, borderRadius: "50%", flexShrink: 0,
                      background: `conic-gradient(${scoreColor} ${sc}%, #E5E7EB ${sc}%)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "inset 0 0 0 13px #fff",
                    }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{sc}</div>
                        <div style={{ fontSize: 9, color: C.hint }}>점</div>
                      </div>
                    </div>
                    <div>
                      <div style={{ display: "inline-block", fontSize: 12, fontWeight: 800, padding: "3px 12px", borderRadius: 99, background: scoreBg, color: scoreColor, marginBottom: 6 }}>
                        {sc >= 80 && <CheckCircle2 size={11} style={{ marginRight: 4, verticalAlign: "middle" }}/>}
                        {scoreLabel}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.txt, lineHeight: 1.6 }}>{result.skinNote}</div>
                      <div style={{ fontSize: 11, color: C.hint, marginTop: 4 }}>
                        색온도: {result.colorTemp} · 채도: {result.saturation} · 신뢰도 {result.confidence}%
                      </div>
                    </div>
                  </div>

                  {/* 탭 */}
                  <div className="pc-inline-tabs" style={{ display: "flex", background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 3, gap: 2 }}>
                    {([["compare","📊 피부톤 비교"],["guide","🎛 Camera Raw 가이드"]] as const).map(([id, lbl]) => (
                      <button key={id} onClick={() => setTab(id)} style={{
                        flex: 1, padding: "8px 0", border: "none", borderRadius: 9, cursor: "pointer",
                        fontFamily: "inherit", fontSize: 13, fontWeight: tab === id ? 900 : 500,
                        background: tab === id ? C.teal : "transparent",
                        color: tab === id ? "#fff" : C.muted,
                      }}>{lbl}</button>
                    ))}
                  </div>

                  {/* 탭 1: 피부톤 비교 */}
                  {tab === "compare" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {(["highlight","mid","shadow"] as const).map(k => (
                        <SwatchCompare key={k}
                          label={{ highlight: "피부 하이라이트 (이마·코)", mid: "피부 미드톤 (볼·얼굴)", shadow: "피부 쉐도우 (턱·목)" }[k]}
                          current={result.current![k]} target={result.target![k]} diff={result.diff![k]}/>
                      ))}

                      {/* 보정 요약 */}
                      {result.adjustments && (
                        <div style={{ background: "#FFF8F5", border: `1px solid ${C.orange}25`, borderRadius: 12, padding: "14px 16px" }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: C.orange, marginBottom: 10 }}>📋 빠른 보정 가이드</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                            {result.adjustments.temperature !== 0 && (
                              <div style={{ fontSize: 13, color: C.txt }}>
                                🌡 색온도 <strong>{result.adjustments.temperature > 0 ? `+${result.adjustments.temperature}` : result.adjustments.temperature}</strong>
                                {" — "}{result.adjustments.temperature > 0 ? "너무 쿨, 따뜻하게" : "너무 웜, 중성으로"}
                              </div>
                            )}
                            {Math.abs(result.adjustments.exposure) > 0.05 && (
                              <div style={{ fontSize: 13, color: C.txt }}>
                                ☀️ 노출 <strong>{result.adjustments.exposure > 0 ? `+${result.adjustments.exposure}` : result.adjustments.exposure}</strong>
                              </div>
                            )}
                            {result.adjustments.vibrance !== -5 && (
                              <div style={{ fontSize: 13, color: C.txt }}>
                                🎨 Vibrance <strong>{result.adjustments.vibrance > 0 ? `+${result.adjustments.vibrance}` : result.adjustments.vibrance}</strong>
                                {result.adjustments.vibrance < -5 ? " — 채도 높음, 더 절제" : " — 채도 낮음, 살짝 올림"}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: C.hint, marginTop: 2, lineHeight: 1.8 }}>
                              HSL → Reds S-8 L+5 / Oranges H+3 S-6 L+4 / Yellows S-10
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 탭 2: Camera Raw 가이드 */}
                  {tab === "guide" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ background: "#1C2B28", borderRadius: 14, padding: "18px" }}>
                        <div style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,.4)", letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 14 }}>Camera Raw 적용값</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                          {[
                            { label: "색온도", value: result.adjustments?.temperature ? `${5900 + result.adjustments.temperature}K` : "5900K", sub: "", hi: !!result.adjustments?.temperature },
                            { label: "색조 Tint",  value: "+3",   sub: "약간 마젠타",  hi: false },
                            { label: "노출",        value: result.adjustments?.exposure ? (result.adjustments.exposure > 0 ? `+${result.adjustments.exposure}` : String(result.adjustments.exposure)) : "+0.2", sub: "", hi: Math.abs(result.adjustments?.exposure ?? 0) > 0.05 },
                            { label: "하이라이트", value: "-30",  sub: "날아감 방지",  hi: false },
                            { label: "섀도우",     value: "+20",  sub: "밝힘",        hi: false },
                            { label: "화이트",     value: "+8",   sub: "",            hi: false },
                            { label: "블랙",       value: "+12",  sub: "올림",        hi: false },
                            { label: "선명도",     value: "+8",   sub: "입체감",      hi: false },
                            { label: "Vibrance",   value: result.adjustments?.vibrance ?? -5, sub: "채도 절제", hi: result.adjustments?.vibrance !== -5 },
                          ].map((item, i) => <AdjCard key={i} {...item}/>)}
                        </div>
                      </div>

                      {/* HSL 테이블 */}
                      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                        <div style={{ padding: "13px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.03)" }}>
                          <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>HSL — 피부톤 보정</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>노란기·붉은기 절제 → 클린한 한국인 피부톤</div>
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "#FAFAFA" }}>
                              {["색상","Hue","Saturation","Luminance"].map(h => (
                                <th key={h} style={{ padding: "8px 14px", fontSize: 11, fontWeight: 800, color: C.muted, textAlign: h === "색상" ? "left" : "center", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {DNA_HSL.map((row, i) => (
                              <tr key={i} style={{ borderBottom: i < 2 ? `1px solid ${C.border}` : "none" }}>
                                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: C.txt }}>{row.label}</td>
                                {[row.h, row.s, row.l].map((v, j) => (
                                  <td key={j} style={{ padding: "10px 14px", textAlign: "center", fontSize: 14, fontWeight: 900, color: v > 0 ? "#059669" : v < 0 ? "#DC2626" : C.hint }}>
                                    {v > 0 ? `+${v}` : v || "0"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* 편집 순서 */}
                      <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: "16px 18px" }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: C.teal, marginBottom: 12 }}>권장 편집 순서</div>
                        {[
                          { n: 1, step: "Camera Raw", desc: "위 기준값 적용", sub: "XMP 프리셋 드래그&드롭" },
                          { n: 2, step: "Evoto",      desc: "피부 보정",      sub: "색감 건드리지 않고 피부만" },
                          { n: 3, step: "Photoshop",  desc: "미세 보정 및 내보내기", sub: "이 단계에서 색감 최소 조정" },
                        ].map(({ n, step, desc, sub }) => (
                          <div key={n} style={{ display: "flex", gap: 12, marginBottom: n < 3 ? 10 : 0 }}>
                            <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.teal, color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{n}</div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: C.txt }}>{step} <span style={{ fontWeight: 400, color: C.muted }}>— {desc}</span></div>
                              <div style={{ fontSize: 11, color: C.hint }}>{sub}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
