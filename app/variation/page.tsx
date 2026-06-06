"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { ArrowLeft, Upload, X, Download, Sparkles, Loader2 } from "lucide-react";

type ResultImage = { url: string; no: number };

/* ── 슬라이더 컴포넌트 ── */
function GaugeBar({
  label,
  sub,
  value,
  onChange,
  leftLabel,
  rightLabel,
  color = "#155855",
}: {
  label: string;
  sub?: string;
  value: number;
  onChange: (v: number) => void;
  leftLabel: string;
  rightLabel: string;
  color?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#1C2B28" }}>{label}</p>
          {sub && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9BB5B0" }}>{sub}</p>}
        </div>
        <span style={{
          fontSize: 13, fontWeight: 900, color,
          background: color + "18",
          borderRadius: 99, padding: "2px 10px"
        }}>{value}%</span>
      </div>
      <input
        type="range" min={0} max={100} step={5} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: "100%", height: 6, cursor: "pointer",
          accentColor: color, borderRadius: 99,
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "#9BB5B0" }}>{leftLabel}</span>
        <span style={{ fontSize: 11, color: "#9BB5B0" }}>{rightLabel}</span>
      </div>
    </div>
  );
}

export default function VariationPage() {
  const [file,         setFile]         = useState<File | null>(null);
  const [preview,      setPreview]      = useState("");
  const [fluxStrength, setFluxStrength] = useState(40);   // 0 = Flux 건너뜀
  const [openaiStrength, setOpenaiStrength] = useState(80); // 0 = OpenAI 건너뜀
  const [loading,      setLoading]      = useState(false);
  const [results,      setResults]      = useState<ResultImage[]>([]);
  const [selected,     setSelected]     = useState<Set<number>>(new Set());
  const [error,        setError]        = useState("");
  const [pipeline,     setPipeline]     = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
    setResults([]); setSelected(new Set()); setError(""); setPipeline("");
  };

  const generate = async () => {
    if (!file) return;
    setLoading(true); setError(""); setResults([]); setPipeline("");
    try {
      const fd = new FormData();
      fd.append("image",          file);
      fd.append("fluxStrength",   String(fluxStrength));
      fd.append("openaiStrength", String(openaiStrength));
      fd.append("count",          "4");

      const res  = await fetch("/api/variation", { method: "POST", body: fd });
      const data = await res.json() as {
        ok: boolean; images?: ResultImage[]; error?: string; pipeline?: string;
      };
      if (!data.ok) throw new Error(data.error || "생성 실패");
      setResults(data.images || []);
      setPipeline(data.pipeline || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (no: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(no) ? next.delete(no) : next.add(no);
      return next;
    });

  const downloadImage = (url: string, no: number) => {
    const a = document.createElement("a");
    a.href = url; a.download = `variation_${no}.jpg`; a.target = "_blank";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadSelected = () => {
    const targets = results.filter(r => selected.size === 0 ? true : selected.has(r.no));
    targets.forEach((r, i) => setTimeout(() => downloadImage(r.url, r.no), i * 300));
  };

  /* 파이프라인 뱃지 */
  const pipelineLabel = pipeline === "openai-only" ? "OpenAI 단독"
    : pipeline === "flux+openai" ? "Flux + OpenAI"
    : pipeline === "flux-only"   ? "Flux 단독"
    : "";

  return (
    <div style={{ minHeight: "100vh", background: "#F5F0E8", fontFamily: "'Noto Sans KR', sans-serif" }}>

      {/* 헤더 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4"
        style={{ background: "#155855" }}>
        <Link href="/" className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: "rgba(255,255,255,.7)", textDecoration: "none" }}>
          <ArrowLeft size={14} />관리자 홈
        </Link>
        <div style={{ width: 1, height: 14, background: "rgba(255,255,255,.2)" }} />
        <Sparkles size={16} color="#EB8F22" />
        <div>
          <p className="text-sm font-bold" style={{ color: "#fff" }}>사진 베리에이션</p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,.6)" }}>
            원본 사진의 느낌을 유지하며 다양한 버전 생성
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6"
        style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>

        {/* ── 왼쪽 컨트롤 ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* 사진 업로드 */}
          <div style={{ borderRadius: 16, overflow: "hidden", background: "#fff", border: "1px solid #C8DDD9" }}>
            <div style={{ padding: "10px 16px", background: "#EAF4F2", borderBottom: "1px solid #C8DDD9" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#155855" }}>📷 원본 사진</p>
            </div>
            <div style={{ padding: 14 }}>
              {preview ? (
                <div style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="원본" style={{ width: "100%", borderRadius: 10, objectFit: "cover", maxHeight: 200 }} />
                  <button onClick={() => { setFile(null); setPreview(""); setResults([]); }}
                    style={{
                      position: "absolute", top: 8, right: 8,
                      width: 28, height: 28, borderRadius: "50%",
                      background: "rgba(0,0,0,.5)", color: "#fff",
                      border: "none", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  style={{
                    width: "100%", borderRadius: 10, padding: "36px 0",
                    border: "2px dashed #C8DDD9", background: "#FAFAF8",
                    cursor: "pointer", display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 8
                  }}>
                  <Upload size={22} color="#9BB5B0" />
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#5A7470" }}>클릭 또는 드래그</p>
                  <p style={{ margin: 0, fontSize: 11, color: "#9BB5B0" }}>JPG · PNG · HEIC</p>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            </div>
          </div>

          {/* Flux 강도 슬라이더 */}
          <div style={{ borderRadius: 16, overflow: "hidden", background: "#fff", border: "1px solid #C8DDD9" }}>
            <div style={{ padding: "10px 16px", background: "#EAF4F2", borderBottom: "1px solid #C8DDD9" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#155855" }}>⚡ Flux 변화 강도</p>
            </div>
            <div style={{ padding: "14px 16px", display: "grid", gap: 6 }}>
              <GaugeBar
                label="변화 강도"
                sub="0%이면 Flux 단계를 건너뜁니다"
                value={fluxStrength}
                onChange={setFluxStrength}
                leftLabel="원본 유지"
                rightLabel="많이 변화"
                color="#155855"
              />
              {fluxStrength === 0 && (
                <p style={{ margin: 0, fontSize: 11, color: "#EB8F22", fontWeight: 700 }}>
                  ℹ️ Flux 건너뜀 — OpenAI만 사용
                </p>
              )}
            </div>
          </div>

          {/* OpenAI 강도 슬라이더 */}
          <div style={{ borderRadius: 16, overflow: "hidden", background: "#fff", border: "1px solid #C8DDD9" }}>
            <div style={{ padding: "10px 16px", background: "#EAF4F2", borderBottom: "1px solid #C8DDD9" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#155855" }}>🧑 OpenAI 얼굴 보정</p>
            </div>
            <div style={{ padding: "14px 16px", display: "grid", gap: 6 }}>
              <GaugeBar
                label="얼굴 보존 강도"
                sub="0%이면 OpenAI 단계를 건너뜁니다"
                value={openaiStrength}
                onChange={setOpenaiStrength}
                leftLabel="사용 안 함"
                rightLabel="최대 보존"
                color="#E85D2C"
              />
              {openaiStrength === 0 && (
                <p style={{ margin: 0, fontSize: 11, color: "#EB8F22", fontWeight: 700 }}>
                  ℹ️ OpenAI 건너뜀 — Flux 결과 그대로 사용
                </p>
              )}
            </div>
          </div>

          {/* 파이프라인 안내 */}
          <div style={{
            borderRadius: 12, padding: "12px 14px",
            background: "#EAF4F2", border: "1px solid #C8DDD9",
            fontSize: 12, color: "#5A7470", lineHeight: 1.7
          }}>
            <p style={{ margin: "0 0 4px", fontWeight: 800, color: "#155855" }}>현재 파이프라인</p>
            {fluxStrength > 0 && openaiStrength > 0 && (
              <p style={{ margin: 0 }}>⚡ Flux 변형 → 🧑 OpenAI 얼굴 복원</p>
            )}
            {fluxStrength > 0 && openaiStrength === 0 && (
              <p style={{ margin: 0 }}>⚡ Flux 변형만 적용</p>
            )}
            {fluxStrength === 0 && openaiStrength > 0 && (
              <p style={{ margin: 0 }}>🧑 OpenAI만 적용 (얼굴 최대 보존)</p>
            )}
            {fluxStrength === 0 && openaiStrength === 0 && (
              <p style={{ margin: 0, color: "#E85D2C" }}>⚠️ 강도가 모두 0% — 생성되지 않습니다</p>
            )}
          </div>

          {/* 생성 버튼 */}
          <button onClick={generate}
            disabled={loading || !file || (fluxStrength === 0 && openaiStrength === 0)}
            style={{
              height: 52, width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              borderRadius: 12, border: "none", fontFamily: "inherit",
              fontWeight: 700, fontSize: 14, cursor:
                loading || !file || (fluxStrength === 0 && openaiStrength === 0)
                  ? "not-allowed" : "pointer",
              background:
                loading || !file || (fluxStrength === 0 && openaiStrength === 0)
                  ? "#9BB5B0" : "#E85D2C",
              color: "#fff"
            }}>
            {loading
              ? <><Loader2 size={18} className="animate-spin" />생성 중... (약 60~120초)</>
              : <><Sparkles size={18} />베리에이션 4장 생성</>
            }
          </button>

          {error && (
            <div style={{
              borderRadius: 12, padding: "12px 14px", fontSize: 13,
              background: "#FFF0EB", border: "1px solid #FACCB8", color: "#E85D2C"
            }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {/* ── 오른쪽 결과 ── */}
        <div>
          {results.length === 0 && !loading && (
            <div style={{
              borderRadius: 16, padding: "56px 32px",
              background: "#fff", border: "1px solid #C8DDD9",
              textAlign: "center"
            }}>
              <p style={{ fontSize: 36, marginBottom: 12 }}>🎨</p>
              <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#155855" }}>
                사진 베리에이션 생성기
              </p>
              <p style={{ margin: "0 0 20px", fontSize: 12, color: "#9BB5B0", lineHeight: 1.7 }}>
                원본 사진을 올리고<br />
                Flux · OpenAI 강도를 조절 후<br />
                생성 버튼을 눌러주세요
              </p>
              <div style={{
                borderRadius: 10, padding: "12px 16px", textAlign: "left",
                background: "#EAF4F2", fontSize: 12, color: "#5A7470", lineHeight: 1.75
              }}>
                <p style={{ margin: "0 0 4px", fontWeight: 800, color: "#155855" }}>추천 설정</p>
                Flux 40% + OpenAI 80% → 얼굴 보존 + 자연스러운 변화<br />
                Flux 0% + OpenAI 100% → 얼굴 완전 보존 (색감만 조정)<br />
                Flux 70% + OpenAI 0% → 빠른 생성 (얼굴 변할 수 있음)
              </div>
            </div>
          )}

          {loading && (
            <div style={{
              borderRadius: 16, padding: "56px 32px",
              background: "#fff", border: "1px solid #C8DDD9",
              textAlign: "center", display: "flex", flexDirection: "column",
              alignItems: "center"
            }}>
              <Loader2 size={44} style={{ color: "#155855", marginBottom: 18 }}
                className="animate-spin" />
              <p style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: "#155855" }}>
                AI가 베리에이션을 만들고 있어요
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#9BB5B0", lineHeight: 1.8 }}>
                {fluxStrength > 0 && (
                  <><b style={{ color: "#155855" }}>Step 1.</b> Flux — 조명·분위기 변형 중 ({fluxStrength}%)<br /></>
                )}
                {openaiStrength > 0 && (
                  <><b style={{ color: "#155855" }}>Step 2.</b> OpenAI — 얼굴·피부 복원 중 ({openaiStrength}%)<br /></>
                )}
                약 {fluxStrength > 0 && openaiStrength > 0 ? "90~120" : "30~60"}초 소요됩니다
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#155855" }}>
                    베리에이션 결과 {results.length}장
                    {pipelineLabel && (
                      <span style={{
                        marginLeft: 8, fontSize: 11, fontWeight: 700,
                        background: "#EAF4F2", color: "#155855",
                        borderRadius: 99, padding: "2px 8px"
                      }}>{pipelineLabel}</span>
                    )}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9BB5B0" }}>
                    {selected.size > 0 ? `${selected.size}장 선택됨` : "클릭해서 선택 · 저장"}
                  </p>
                </div>
                <button onClick={downloadSelected} style={{
                  height: 36, padding: "0 14px",
                  display: "flex", alignItems: "center", gap: 6,
                  borderRadius: 10, border: "none",
                  background: "#155855", color: "#fff",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit"
                }}>
                  <Download size={14} />
                  {selected.size > 0 ? `${selected.size}장` : "전체"} 저장
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {results.map(r => (
                  <div key={r.no} onClick={() => toggleSelect(r.no)}
                    style={{
                      position: "relative", borderRadius: 12, overflow: "hidden",
                      cursor: "pointer",
                      border: selected.has(r.no) ? "3px solid #E85D2C" : "3px solid transparent",
                      boxShadow: "0 2px 10px rgba(0,0,0,.08)"
                    }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.url} alt={`Variation ${r.no}`}
                      style={{ width: "100%", display: "block", objectFit: "cover", aspectRatio: "3/2" }} />
                    <div style={{
                      position: "absolute", top: 8, left: 8,
                      width: 26, height: 26, borderRadius: "50%",
                      background: selected.has(r.no) ? "#E85D2C" : "rgba(0,0,0,.4)",
                      color: "#fff", fontSize: 11, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      {selected.has(r.no) ? "✓" : r.no}
                    </div>
                    <button onClick={e => { e.stopPropagation(); downloadImage(r.url, r.no); }}
                      style={{
                        position: "absolute", bottom: 8, right: 8,
                        padding: "3px 8px", borderRadius: 6, border: "none",
                        background: "rgba(0,0,0,.5)", color: "#fff",
                        fontSize: 11, fontWeight: 700, cursor: "pointer"
                      }}>저장</button>
                  </div>
                ))}
              </div>

              {preview && (
                <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #C8DDD9" }}>
                  <p style={{
                    margin: 0, padding: "8px 14px", fontSize: 11, fontWeight: 700,
                    background: "#EAF4F2", color: "#9BB5B0",
                    textTransform: "uppercase", letterSpacing: "0.1em"
                  }}>원본</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="원본"
                    style={{ width: "100%", display: "block", objectFit: "cover", maxHeight: 180 }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
