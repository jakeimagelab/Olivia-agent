"use client";

import { useRef, useState, useCallback } from "react";
import { RefreshCw, Camera, Copy, Check } from "lucide-react";

const C = {
  teal: "#155855", orange: "#E85D2C", green: "#22876A",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2", bg: "#EDF5F3",
  mint: "#EAF4F2", dark: "#1C2B28",
};

const DNA_TARGETS = {
  highlight: { r: 244, g: 224, b: 210, hex: "#F4E0D2", label: "하이라이트 (이마·코)" },
  mid:       { r: 217, g: 186, b: 169, hex: "#D9BAA9", label: "미드톤 (볼·광대)" },
  shadow:    { r: 182, g: 146, b: 130, hex: "#B69282", label: "쉐도우 (턱선·목)" },
};

type AnalysisResult = {
  ok: boolean; detected?: boolean; matchScore?: number;
  current?: any; target?: any; diff?: any;
  colorTemp?: string; saturation?: string; skinNote?: string; confidence?: number;
  adjustments?: any; photoshop?: any;
};

function PsSlider({ label, value }: { label: string; value: number }) {
  if (Math.abs(value) < 2) return null;
  const pct = Math.round(Math.abs(value) / 15 * 100);
  const isNeg = value < 0;
  const sides = label.split("↔");
  const activeSide = isNeg ? sides[0] : sides[1];
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11 }}>
        <span style={{ color: "rgba(255,255,255,.45)" }}>{sides[0]}</span>
        <span style={{ fontWeight: 900, color: isNeg ? "#93C5FD" : "#FCA5A5", fontSize: 14 }}>
          {value > 0 ? `+${value}` : value}
        </span>
        <span style={{ color: "rgba(255,255,255,.45)" }}>{sides[1]}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.1)", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", height: "100%", borderRadius: 3,
          background: isNeg ? "#93C5FD" : "#FCA5A5",
          width: `${pct / 2}%`,
          left: isNeg ? `${50 - pct / 2}%` : "50%",
        }}/>
        <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: "rgba(255,255,255,.3)" }}/>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 4 }}>
        → <strong style={{ color: "rgba(255,255,255,.8)" }}>{activeSide}</strong> 방향으로 조정
      </div>
    </div>
  );
}

function SwatchRow({ label, current, target, diff }: any) {
  const ok = diff.dist <= 12;
  const warn = diff.dist > 25;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ width: 40, height: 40, borderRadius: 8, background: current.hex, border: `1px solid ${C.border}`, flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, color: C.hint }}>{current.hex}</div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 6,
        background: ok ? "#E6F4EA" : warn ? "#FFF0EB" : "#FFFBEA",
        color: ok ? "#166534" : warn ? C.orange : "#92400E" }}>
        {ok ? "✓ 일치" : `차이 ${diff.dist}`}
      </div>
      <div style={{ width: 40, height: 40, borderRadius: 8, background: target.hex, border: `1px solid ${C.border}`, flexShrink: 0 }}/>
    </div>
  );
}

// ── 색감 동기화 전용 슬라이더 ──────────────────────────────
function SyncSlider({ label, value }: { label: string; value: number }) {
  if (Math.abs(value) < 2) return null;
  const pct = Math.round(Math.abs(value) / 20 * 100);
  const isNeg = value < 0;
  const sides = label.split("↔");
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11 }}>
        <span style={{ color: "rgba(255,255,255,.45)" }}>{sides[0]}</span>
        <span style={{ fontWeight: 900, color: isNeg ? "#93C5FD" : "#FCA5A5", fontSize: 14 }}>
          {value > 0 ? `+${value}` : value}
        </span>
        <span style={{ color: "rgba(255,255,255,.45)" }}>{sides[1]}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.1)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", height: "100%", borderRadius: 3, background: isNeg ? "#93C5FD" : "#FCA5A5", width: `${pct / 2}%`, left: isNeg ? `${50 - pct / 2}%` : "50%" }}/>
        <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: "rgba(255,255,255,.3)" }}/>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 4 }}>
        → <strong style={{ color: "rgba(255,255,255,.75)" }}>{isNeg ? sides[0] : sides[1]}</strong> 방향
      </div>
    </div>
  );
}

// ── 동기화 업로드 존 ───────────────────────────────────────
function SyncUpload({ label, preview, onFile, onClear, badge }: {
  label: string; preview: string;
  onFile: (f: File) => void; onClear: () => void;
  badge: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 800,
          background: badge === "기준" ? C.teal : C.orange, color: "#fff" }}>{badge}</div>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.txt }}>{label}</span>
      </div>
      {!preview ? (
        <div
          onClick={() => ref.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) onFile(f); }}
          onDragOver={e => e.preventDefault()}
          style={{ border: `2px dashed ${C.border}`, borderRadius: 14, background: C.white,
            aspectRatio: "4/3", display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", cursor: "pointer", gap: 8 }}>
          <div style={{ fontSize: 28 }}>{badge === "기준" ? "📌" : "🔄"}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.teal }}>사진 업로드</div>
          <div style={{ fontSize: 11, color: C.hint }}>클릭 · 드래그</div>
          <input ref={ref} type="file" accept="image/*" style={{ display:"none" }}
            onChange={e => { const f = e.target.files?.[0]; if(f) onFile(f); }}/>
        </div>
      ) : (
        <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: `2px solid ${badge === "기준" ? C.teal : C.orange}` }}>
          <img src={preview} alt="" style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block" }}/>
          <button onClick={onClear} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28,
            borderRadius: "50%", border: "none", background: "rgba(0,0,0,.55)", color: "#fff",
            cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ── 동기화 탭 ──────────────────────────────────────────────
function SyncTab() {
  const [refPreview,  setRefPreview]  = useState("");
  const [refB64,      setRefB64]      = useState("");
  const [refMime,     setRefMime]     = useState("image/jpeg");
  const [tgtPreview,  setTgtPreview]  = useState("");
  const [tgtB64,      setTgtB64]      = useState("");
  const [tgtMime,     setTgtMime]     = useState("image/jpeg");
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState<any>(null);
  const [error,       setError]       = useState("");
  const [copied,      setCopied]      = useState(false);
  const [resTab,      setResTab]      = useState<"swatch"|"ps"|"cameraraw">("swatch");

  const loadImg = (file: File, setPreview: (s:string)=>void, setB64: (s:string)=>void, setMime: (s:string)=>void) => {
    if (!file.type.startsWith("image/")) return;
    setMime(file.type);
    const r = new FileReader();
    r.onload = e => {
      const url = e.target?.result as string;
      setPreview(url);
      setB64(url.split(",")[1]);
    };
    r.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!refB64 || !tgtB64) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/color-sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceBase64: refB64, referenceMime: refMime, targetBase64: tgtB64, targetMime: tgtMime }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResult(data); setResTab("swatch");
    } catch (e: any) {
      setError(e.message || "분석 실패");
    } finally { setLoading(false); }
  };

  const copyGuide = () => {
    if (!result?.photoshop?.guide) return;
    const txt = ["[색감 동기화 보정 가이드]", ...result.photoshop.guide].join("\n");
    navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const sc = result?.syncScore ?? 0;
  const scoreColor = sc >= 85 ? "#059669" : sc >= 65 ? "#D97706" : C.orange;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, margin: "0 auto" }}>

      {/* 안내 */}
      <div style={{ background: C.mint, borderRadius: 12, padding: "14px 18px", display: "flex", gap: 12, alignItems: "center", borderLeft: `3px solid ${C.teal}` }}>
        <div style={{ fontSize: 20 }}>🔄</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.teal, marginBottom: 2 }}>색감 동기화</div>
          <div style={{ fontSize: 12, color: C.muted }}>기준 사진과 동기화할 사진을 올리면 두 사진의 피부톤 차이를 분석하고 Photoshop · Camera Raw 보정값을 알려줍니다.</div>
        </div>
      </div>

      {/* 두 장 업로드 */}
      <div style={{ display: "flex", gap: 16 }}>
        <SyncUpload label="기준 사진" badge="기준" preview={refPreview}
          onFile={f => { setResult(null); loadImg(f, setRefPreview, setRefB64, setRefMime); }}
          onClear={() => { setRefPreview(""); setRefB64(""); setResult(null); }}/>
        <div style={{ display: "flex", alignItems: "center", color: C.hint, fontSize: 20, flexShrink: 0 }}>→</div>
        <SyncUpload label="동기화할 사진" badge="대상" preview={tgtPreview}
          onFile={f => { setResult(null); loadImg(f, setTgtPreview, setTgtB64, setTgtMime); }}
          onClear={() => { setTgtPreview(""); setTgtB64(""); setResult(null); }}/>
      </div>

      {/* 분석 버튼 */}
      <button onClick={analyze} disabled={loading || !refB64 || !tgtB64} style={{
        height: 52, border: "none", borderRadius: 14,
        background: (!refB64 || !tgtB64) ? C.hint : loading ? C.muted : C.teal,
        color: "#fff", fontWeight: 900, fontSize: 15, cursor: (!refB64 || !tgtB64 || loading) ? "not-allowed" : "pointer",
        fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      }}>
        {loading
          ? <><RefreshCw size={16} style={{ animation: "spin .7s linear infinite" }}/> AI 분석 중… (두 장 동시 처리)</>
          : "🔄 색감 동기화 분석"}
      </button>

      {error && <div style={{ padding: "12px 16px", background: "#FFF0EB", borderRadius: 10, fontSize: 13, color: C.orange }}>{error}</div>}

      {/* 결과 */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* 점수 카드 */}
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "18px 22px", display: "flex", gap: 20, alignItems: "center" }}>
            <div style={{
              width: 76, height: 76, borderRadius: "50%", flexShrink: 0,
              background: `conic-gradient(${scoreColor} ${sc}%, #E5E7EB ${sc}%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "inset 0 0 0 13px #fff",
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{sc}</div>
                <div style={{ fontSize: 9, color: C.hint }}>일치율</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "#EAF4F2", color: C.teal, fontWeight: 700 }}>
                  기준: {result.reference.colorTemp} · {result.reference.saturation}채도
                </div>
                <div style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "#FFF8F5", color: C.orange, fontWeight: 700 }}>
                  대상: {result.target.colorTemp} · {result.target.saturation}채도
                </div>
              </div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                {sc >= 85 ? "색감이 거의 동일합니다. 보정이 거의 필요 없어요." :
                  sc >= 65 ? "소폭 조정으로 동기화 가능합니다." :
                  "색감 차이가 있습니다. 아래 가이드로 보정하세요."}
              </div>
            </div>
          </div>

          {/* 결과 탭 */}
          <div style={{ display: "flex", background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 3, gap: 2 }}>
            {([["swatch","🎨 피부톤 비교"],["ps","🖥 Photoshop"],["cameraraw","🎛 Camera Raw"]] as const).map(([id, lbl]) => (
              <button key={id} onClick={() => setResTab(id)} style={{
                flex: 1, padding: "8px 0", border: "none", borderRadius: 9, cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: resTab === id ? 900 : 500,
                background: resTab === id ? C.teal : "transparent",
                color: resTab === id ? "#fff" : C.muted,
              }}>{lbl}</button>
            ))}
          </div>

          {/* 피부톤 비교 */}
          {resTab === "swatch" && (
            <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "20px" }}>
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.teal, textAlign: "center" }}>기준 사진</div>
                <div/>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.orange, textAlign: "center" }}>대상 사진</div>
              </div>
              {(["highlight","mid","shadow"] as const).map(k => {
                const lbl = { highlight:"하이라이트", mid:"미드톤", shadow:"쉐도우" }[k];
                const d = result.diff[k];
                const ok = d.dist <= 10;
                const warn = d.dist > 25;
                return (
                  <div key={k} className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: result.reference[k].hex, border: `1px solid ${C.border}`, flexShrink: 0 }}/>
                      <div style={{ fontSize: 10, color: C.hint }}>{result.reference[k].hex}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, marginBottom: 3 }}>{lbl}</div>
                      <div style={{ fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 6,
                        background: ok ? "#E6F4EA" : warn ? "#FFF0EB" : "#FFFBEA",
                        color: ok ? "#166534" : warn ? C.orange : "#92400E" }}>
                        {ok ? "✓" : `±${d.dist}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                      <div style={{ fontSize: 10, color: C.hint }}>{result.target[k].hex}</div>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: result.target[k].hex, border: `1px solid ${C.border}`, flexShrink: 0 }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Photoshop */}
          {resTab === "ps" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "#1E2D2A", borderRadius: 14, padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,.35)", letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 5 }}>Photoshop 2026 · 대상 사진에 적용</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", marginBottom: 2 }}>색상 균형 (Color Balance)</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>이미지 → 조정 → 색상 균형 (Shift+Ctrl+B) · 중간 영역 · 광도 유지 ✓</div>
                  </div>
                  <button onClick={copyGuide} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.8)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                    {copied ? <Check size={13}/> : <Copy size={13}/>}{copied ? "복사됨" : "복사"}
                  </button>
                </div>
                {result.photoshop?.hasAdjustment ? (
                  <>
                    <SyncSlider label="녹청↔빨강" value={result.photoshop.overall.cyanRed} />
                    <SyncSlider label="마젠타↔녹색" value={result.photoshop.overall.magGreen} />
                    <SyncSlider label="노랑↔파랑" value={result.photoshop.overall.yellowBlue} />
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,.5)", fontSize: 13 }}>
                    ✓ 색상 균형 보정 불필요
                  </div>
                )}
              </div>
              {result.photoshop?.guide?.length > 0 && (
                <div style={{ background: "#FFF8F5", border: `1px solid ${C.orange}30`, borderRadius: 12, padding: "16px 18px" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.orange, marginBottom: 10 }}>자연어 보정 가이드</div>
                  {result.photoshop.guide.map((g: string, i: number) => (
                    <div key={i} style={{ fontSize: 13, color: C.txt, marginBottom: 7, display: "flex", gap: 8 }}>
                      <span style={{ color: C.orange, fontWeight: 900 }}>→</span>{g}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Camera Raw */}
          {resTab === "cameraraw" && (
            <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "20px" }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.muted, marginBottom: 16 }}>대상 사진 → Camera Raw 조정 (기준 사진 기준)</div>
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  ["색온도", result.adjustments.temperature ? (result.adjustments.temperature > 0 ? `+${result.adjustments.temperature}` : String(result.adjustments.temperature)) + "K" : "±0", result.adjustments.temperature !== 0],
                  ["노출", result.adjustments.exposure > 0 ? `+${result.adjustments.exposure}` : String(result.adjustments.exposure || "±0"), Math.abs(result.adjustments.exposure) >= 0.05],
                  ["Vibrance", result.adjustments.vibrance > 0 ? `+${result.adjustments.vibrance}` : String(result.adjustments.vibrance || "±0"), result.adjustments.vibrance !== 0],
                ].map(([lbl, val, hi]) => (
                  <div key={String(lbl)} style={{ background: hi ? "#1C2B28" : "#F4F8F7", borderRadius: 12, padding: "16px", textAlign: "center", border: hi ? `2px solid ${C.orange}` : `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, color: hi ? "rgba(255,255,255,.4)" : C.hint, marginBottom: 6 }}>{lbl}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: hi ? (String(val).startsWith("+") ? "#6EE7B7" : "#FCA5A5") : C.muted }}>{val}</div>
                  </div>
                ))}
              </div>
              {!result.photoshop?.hasAdjustment && result.adjustments.temperature === 0 && (
                <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "#059669", fontWeight: 700 }}>
                  ✓ 두 사진의 색감이 거의 동일합니다
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PhotoRetouchingPage() {
  const inputRef   = useRef<HTMLInputElement>(null);
  const [tab,      setTab]      = useState<"check" | "sync" | "recipe">("check");
  const [preview,  setPreview]  = useState("");
  const [imgB64,   setImgB64]   = useState("");
  const [imgMime,  setImgMime]  = useState("image/jpeg");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<AnalysisResult | null>(null);
  const [error,    setError]    = useState("");
  const [resTab,   setResTab]   = useState<"compare" | "ps" | "cameraraw">("compare");
  const [copied,   setCopied]   = useState(false);
  const [dragging, setDragging] = useState(false);

  const processFile = (file: File) => {
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

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const img = items.find(i => i.type.startsWith("image/"));
    if (img) { const file = img.getAsFile(); if (file) processFile(file); }
  }, []);

  const handleGlobalPaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    if (preview) return;
    handlePaste(e);
  }, [preview, handlePaste]);

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
      setResult(data); setResTab("compare");
    } catch (e: any) {
      setError(e.message || "분석 실패");
    } finally { setLoading(false); }
  };

  const copyGuide = () => {
    if (!result?.photoshop?.guide) return;
    const txt = ["[포토클리닉 색상균형 가이드]", "이미지 → 조정 → 색상 균형 (Shift+Ctrl+B)", "톤: 중간 영역 / 광도 유지 체크", ...result.photoshop.guide].join("\n");
    navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const sc = result?.matchScore ?? 0;
  const scoreColor = sc >= 80 ? "#059669" : sc >= 60 ? "#D97706" : C.orange;

  return (
    <main
      style={{ background: C.bg, fontFamily: "'Noto Sans KR', sans-serif", color: C.txt }}
      onPaste={handleGlobalPaste}
    >
      <div style={{ background: "#FFFFFF", borderBottom: `1px solid ${C.border}`, display: "flex", padding: "0 8px", overflowX: "auto" }}>
        {([["check","색감 체크"],["sync","색감 동기화"],["recipe","보정 레시피"]] as const).map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "11px 20px", border: "none", borderBottom: `2.5px solid ${tab === id ? C.teal : "transparent"}`,
            background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 13,
            fontWeight: tab === id ? 800 : 600, color: tab === id ? C.teal : C.hint,
            whiteSpace: "nowrap",
          }}>{lbl}</button>
        ))}
      </div>

      <div style={{ background: C.light, padding: "6px 24px", fontSize: 11, fontWeight: 800, color: C.teal, borderBottom: `1px solid ${C.border}` }}>
        포토클리닉 색감 작업실 — 업로드 · 분석 · 보정 가이드
      </div>

      <div style={{ background: C.bg, minHeight: "100vh", color: C.txt }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px 80px" }}>
        {/* 페이지 탭 */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: C.orange, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 4 }}>PHOTO RETOUCHING</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.teal, marginBottom: 6 }}>
            {tab === "check" ? "AI 색감 체크" : tab === "sync" ? "색감 동기화" : "포토클리닉 보정 레시피"}
          </div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
            {tab === "check"
              ? "사진 한 장을 업로드하면 포토클리닉 컬러 DNA와 비교해 보정 방향을 정리합니다."
              : tab === "sync"
                ? "기준 사진과 대상 사진을 비교해 같은 톤으로 맞추는 보정값을 안내합니다."
                : "Camera Raw와 Photoshop에서 바로 참고할 수 있는 기본 보정 기준입니다."}
          </div>
        </div>
        <div style={{ display: "none" }}>
          {([["check","🎨 색감 체크"],["sync","🔄 색감 동기화"],["recipe","📋 보정 레시피"]] as const).map(([id, lbl]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, minWidth: 150, padding: "12px 18px", border: "none", borderRadius: 10, cursor: "pointer",
              fontFamily: "inherit", fontSize: 14, fontWeight: tab === id ? 900 : 700,
              color: tab === id ? "#fff" : C.muted,
              background: tab === id ? C.teal : "transparent",
              whiteSpace: "nowrap",
            }}>{lbl}</button>
          ))}
        </div>

        {/* ── 색감 체크 ── */}
        {tab === "check" && (
          <div className="pc-mobile-stack" style={{ display: "grid", gridTemplateColumns: result ? "340px 1fr" : "minmax(0, 640px)", gap: 18, justifyContent: "center" }}>

            {/* 왼쪽 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {!preview ? (
                <div
                  onClick={() => inputRef.current?.click()}
                  onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if(f) processFile(f); }}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  style={{
                    border: `1.5px dashed ${dragging ? C.teal : C.border}`, borderRadius: 14,
                    background: dragging ? C.light : C.white, padding: "52px 24px",
                    textAlign: "center", cursor: "pointer", transition: "all .15s",
                    boxShadow: "0 8px 24px rgba(21,88,85,.04)",
                  }}>
                  <div style={{ fontSize: 38, marginBottom: 14 }}>📷</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: C.teal, marginBottom: 8 }}>사진 업로드</div>
                  <div style={{ fontSize: 12, color: C.hint, lineHeight: 2 }}>
                    클릭하거나 드래그&드롭<br/>
                    포토샵·Preview에서 복사 후 <strong style={{ color: C.orange }}>Ctrl+V</strong> 붙여넣기<br/>
                    <span style={{ fontSize: 11 }}>JPG · PNG · WEBP</span>
                  </div>
                  <input ref={inputRef} type="file" accept="image/*" style={{ display:"none" }}
                    onChange={e => { const f = e.target.files?.[0]; if(f) processFile(f); }}/>
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
                      style={{ width: 44, height: 44, border: `1.5px solid ${C.border}`, borderRadius: 10, background: C.white, cursor: "pointer", fontSize: 18, color: C.muted }}>↺</button>
                  </div>
                </div>
              )}

              {error && (
                <div style={{ padding: "12px 14px", background: "#FFF0EB", borderRadius: 10, fontSize: 13, color: C.orange }}>{error}</div>
              )}

              {/* DNA 미니카드 */}
              <div style={{ background: C.white, borderRadius: 14, padding: "18px", border: `1px solid ${C.border}`, boxShadow: "0 8px 24px rgba(21,88,85,.04)" }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: C.orange, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 3 }}>포토클리닉</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: C.teal, marginBottom: 2 }}>컬러 DNA v1</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>3장 평균 확정값</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {Object.values(DNA_TARGETS).map(t => (
                    <div key={t.hex} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ height: 28, borderRadius: 6, background: t.hex, marginBottom: 4, border: `1px solid ${C.border}` }}/>
                      <div style={{ fontSize: 9, color: C.hint }}>{t.hex}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.9 }}>
                  5900K · Tint+3 · Expo+0.2<br/>
                  Highlights-30 · Shadows+20
                </div>
              </div>
            </div>

            {/* 오른쪽: 결과 */}
            {result && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {!result.detected ? (
                  <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "48px", textAlign: "center" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🤔</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: C.teal }}>피부를 찾지 못했어요</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>인물이 잘 보이는 사진을 올려주세요</div>
                  </div>
                ) : (
                  <>
                    {/* 점수 */}
                    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "18px 22px", display: "flex", gap: 18, alignItems: "center" }}>
                      <div style={{
                        width: 72, height: 72, borderRadius: "50%", flexShrink: 0,
                        background: `conic-gradient(${scoreColor} ${sc}%, #E5E7EB ${sc}%)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "inset 0 0 0 12px #fff",
                      }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 19, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{sc}</div>
                          <div style={{ fontSize: 9, color: C.hint }}>점</div>
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.txt, lineHeight: 1.5, marginBottom: 4 }}>{result.skinNote}</div>
                        <div style={{ fontSize: 11, color: C.hint }}>
                          {result.colorTemp} · 채도 {result.saturation} · 신뢰도 {result.confidence}%
                        </div>
                        {result.photoshop?.hasAdjustment && (
                          <div style={{ marginTop: 6, display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 99, background: "#FFF0EB", color: C.orange }}>
                            Photoshop 보정 필요
                          </div>
                        )}
                        {!result.photoshop?.hasAdjustment && sc >= 80 && (
                          <div style={{ marginTop: 6, display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 99, background: "#E6F4EA", color: "#059669" }}>
                            ✓ 포토클리닉 DNA 일치
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 결과 탭 */}
                    <div style={{ display: "flex", background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: 3, gap: 2 }}>
                      {([["compare","📊 피부톤 비교"],["ps","🖥 Photoshop 보정"],["cameraraw","🎛 Camera Raw"]] as const).map(([id, lbl]) => (
                        <button key={id} onClick={() => setResTab(id)} style={{
                          flex: 1, padding: "8px 0", border: "none", borderRadius: 9, cursor: "pointer",
                          fontFamily: "inherit", fontSize: 12, fontWeight: resTab === id ? 900 : 500,
                          background: resTab === id ? C.teal : "transparent",
                          color: resTab === id ? "#fff" : C.muted,
                        }}>{lbl}</button>
                      ))}
                    </div>

                    {/* 피부톤 비교 */}
                    {resTab === "compare" && (
                      <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.hint, marginBottom: 12 }}>
                          <span style={{ fontWeight: 700, color: C.muted }}>현재 사진 vs DNA 타겟</span>
                          <span>← 현재 &nbsp;&nbsp; DNA →</span>
                        </div>
                        {(["highlight","mid","shadow"] as const).map(k => (
                          <SwatchRow key={k}
                            label={{ highlight:"하이라이트 (이마·코)", mid:"미드톤 (볼·광대)", shadow:"쉐도우 (턱선·목)" }[k]}
                            current={result.current![k]} target={result.target![k]} diff={result.diff![k]}/>
                        ))}
                      </div>
                    )}

                    {/* Photoshop 가이드 */}
                    {resTab === "ps" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ background: "#1E2D2A", borderRadius: 14, padding: "20px", border: `1px solid rgba(255,255,255,.06)` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,.35)", letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 5 }}>Photoshop 2026</div>
                              <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", marginBottom: 2 }}>색상 균형</div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>이미지 → 조정 → 색상 균형 (Shift+Ctrl+B)<br/>톤: 중간 영역 · 광도 유지 ✓</div>
                            </div>
                            <button onClick={copyGuide} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.8)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                              {copied ? <Check size={13}/> : <Copy size={13}/>}
                              {copied ? "복사됨" : "가이드 복사"}
                            </button>
                          </div>

                          {result.photoshop?.hasAdjustment ? (
                            <>
                              <PsSlider label="녹청↔빨강" value={result.photoshop.overall.cyanRed} />
                              <PsSlider label="마젠타↔녹색" value={result.photoshop.overall.magGreen} />
                              <PsSlider label="노랑↔파랑" value={result.photoshop.overall.yellowBlue} />
                            </>
                          ) : (
                            <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,.5)", fontSize: 13 }}>
                              ✓ 색상 균형 보정 불필요 — DNA와 일치
                            </div>
                          )}
                        </div>

                        {result.photoshop?.guide?.length > 0 && (
                          <div style={{ background: "#FFF8F5", border: `1px solid ${C.orange}30`, borderRadius: 12, padding: "16px 18px" }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: C.orange, marginBottom: 10 }}>자연어 보정 가이드</div>
                            {result.photoshop.guide.map((g: string, i: number) => (
                              <div key={i} style={{ fontSize: 13, color: C.txt, marginBottom: 6, display: "flex", gap: 8 }}>
                                <span style={{ color: C.orange, fontWeight: 900 }}>→</span>{g}
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: "14px 16px" }}>
                          <div style={{ fontSize: 11, fontWeight: 900, color: C.muted, marginBottom: 8 }}>핵심 원칙</div>
                          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.9 }}>
                            · 절대값보다 <strong style={{ color: C.txt }}>R:G:B 비율</strong>이 더 중요<br/>
                            · 미드톤 기준 G는 R보다 약 <strong style={{ color: C.txt }}>-30</strong>, B는 약 <strong style={{ color: C.txt }}>-48</strong> 낮아야 포토클리닉 색감<br/>
                            · 적용 후 Ctrl+Z로 전후 비교 필수
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Camera Raw */}
                    {resTab === "cameraraw" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ background: C.dark, borderRadius: 14, padding: "18px" }}>
                          <div style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,.4)", letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 14 }}>Camera Raw 적용값</div>
                          <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                            {([
                              ["색온도", result.adjustments?.temperature ? `${5900 + result.adjustments.temperature}K` : "5900K", !!result.adjustments?.temperature],
                              ["Tint", "+3", false],
                              ["노출", result.adjustments?.exposure > 0 ? `+${result.adjustments.exposure}` : String(result.adjustments?.exposure ?? "+0.2"), Math.abs(result.adjustments?.exposure ?? 0) > 0.05],
                              ["하이라이트", "-30", false],
                              ["섀도우", "+20", false],
                              ["화이트", "+8", false],
                              ["블랙", "+12", false],
                              ["선명도", "+8", false],
                              ["Vibrance", String(result.adjustments?.vibrance ?? -5), result.adjustments?.vibrance !== -5],
                            ] as [string, string, boolean][]).map(([lbl, val, hi]) => (
                              <div key={lbl} style={{ background: hi ? C.teal : "#243530", borderRadius: 10, padding: "12px 14px", border: hi ? `2px solid ${C.orange}` : "none" }}>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", marginBottom: 4 }}>{lbl}</div>
                                <div style={{ fontSize: 20, fontWeight: 900, color: val.startsWith("+") ? "#6EE7B7" : val.startsWith("-") ? "#FCA5A5" : "#fff" }}>{val}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                          <div style={{ padding: "12px 16px", background: C.mint, fontSize: 12, fontWeight: 900, color: C.teal, borderBottom: `1px solid ${C.border}` }}>HSL 피부톤 보정</div>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ background: "#FAFAFA" }}>
                                {["색상", "Hue", "Saturation", "Luminance"].map(h => (
                                  <th key={h} style={{ padding: "8px 14px", fontSize: 11, fontWeight: 800, color: C.muted, textAlign: h === "색상" ? "left" : "center", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {([["레드 (Reds)", 0, -8, 5],["오렌지 (Oranges)", 3, -6, 4],["옐로우 (Yellows)", 0, -10, 0]] as [string,number,number,number][]).map(([lbl, h, s, l], i) => (
                                <tr key={lbl} style={{ borderBottom: i < 2 ? `1px solid ${C.border}` : "none" }}>
                                  <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700 }}>{lbl}</td>
                                  {[h, s, l].map((v, j) => (
                                    <td key={j} style={{ padding: "10px 14px", textAlign: "center", fontSize: 14, fontWeight: 900, color: v > 0 ? "#059669" : v < 0 ? "#DC2626" : C.hint }}>
                                      {v > 0 ? `+${v}` : v || "0"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 색감 동기화 탭 ── */}
        {tab === "sync" && <SyncTab />}

        {/* ── 보정 레시피 탭 ── */}
        {tab === "recipe" && (
          <div style={{ maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: C.dark, borderRadius: 16, padding: "24px" }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,.35)", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 6 }}>포토클리닉 컬러 DNA v1</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginBottom: 4 }}>클린 뉴트럴 · 신뢰감형</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)", lineHeight: 1.8, marginBottom: 16 }}>차갑지도 따뜻하지도 않은 중성 색온도. 채도를 절제해 의료 브랜딩 특유의 신뢰감 구현</div>
              <div style={{ display: "flex", gap: 10 }}>
                {Object.values(DNA_TARGETS).map(t => (
                  <div key={t.hex} style={{ flex: 1 }}>
                    <div style={{ height: 36, borderRadius: 8, background: t.hex, marginBottom: 6 }}/>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", textAlign: "center" }}>{t.label.split(" ")[0]}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", textAlign: "center" }}>R{t.r} G{t.g} B{t.b}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "18px" }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: C.orange, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>Camera Raw 기준값</div>
                {[["색온도","5900K"],["색조 Tint","+3"],["노출","+0.2"],["하이라이트","-30"],["섀도우","+20"],["화이트","+8"],["블랙","+12"],["선명도","+8"],["Vibrance","-5"]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                    <span style={{ color: C.muted }}>{k}</span>
                    <span style={{ fontWeight: 800, color: v.startsWith("-") ? "#DC2626" : v.startsWith("+") ? "#059669" : C.txt }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "18px" }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: C.orange, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 12 }}>Photoshop 색상균형 기본</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 2, marginBottom: 12 }}>이미지 → 조정 → 색상 균형<br/>단축키: Shift+Ctrl+B</div>
                {[["녹청↔빨강","0 (기본)"],["마젠타↔녹색","0 (기본)"],["노랑↔파랑","0 (기본)"]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                    <span style={{ color: C.muted }}>{k}</span>
                    <span style={{ fontWeight: 700, color: C.hint }}>{v}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: C.hint, marginTop: 10, lineHeight: 1.8 }}>
                  색감 체크 탭에서 AI 분석 후<br/>사진별 맞춤 수치를 확인하세요
                </div>
              </div>
            </div>

            <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "20px" }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: C.orange, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>권장 편집 순서</div>
              {[
                { n:1, step:"Camera Raw / ACR", desc:"위 기준값 적용", sub:"XMP 프리셋 드래그&드롭으로 한 번에" },
                { n:2, step:"Evoto", desc:"피부 보정", sub:"색감 건드리지 않고 피부 질감만" },
                { n:3, step:"Photoshop 2026", desc:"색상 균형 미세 조정", sub:"색감 체크 탭 → AI 분석 → 가이드 복사 → 적용" },
              ].map(({ n, step, desc, sub }) => (
                <div key={n} style={{ display: "flex", gap: 14, marginBottom: n < 3 ? 14 : 0 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.teal, color: "#fff", fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.txt }}>{step} <span style={{ fontWeight: 400, color: C.muted, fontSize: 13 }}>— {desc}</span></div>
                    <div style={{ fontSize: 11, color: C.hint }}>{sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
