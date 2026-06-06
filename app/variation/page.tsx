"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { ArrowLeft, Upload, X, Download, Sparkles, Loader2 } from "lucide-react";

const DIRECTIONS = [
  { key: "natural",  label: "자연스럽게",  desc: "원본 느낌 최대 유지",    emoji: "✨" },
  { key: "warm",     label: "따뜻하게",    desc: "골든아워 · 웜톤",        emoji: "🌅" },
  { key: "bright",   label: "더 밝게",     desc: "에어리 · 하이키",        emoji: "☀️" },
  { key: "cool",     label: "쿨톤",        desc: "깔끔한 아침 빛",         emoji: "🌿" },
  { key: "dramatic", label: "드라마틱",    desc: "강한 림라이트 · 대비",   emoji: "🎬" },
  { key: "close",    label: "클로즈업",    desc: "타이트한 프레이밍",      emoji: "🔍" },
];

const STRENGTHS = [
  { label: "A-",  desc: "최소 변화",  count: 4 },
  { label: "A",   desc: "약간 변화",  count: 4 },
  { label: "A+",  desc: "중간 변화",  count: 4 },
  { label: "A++", desc: "많이 변화",  count: 4 },
];

type ResultImage = { url: string; no: number };

export default function VariationPage() {
  const [file,      setFile]      = useState<File | null>(null);
  const [preview,   setPreview]   = useState("");
  const [direction, setDirection] = useState("natural");
  const [strength,  setStrength]  = useState(1); // index
  const [loading,   setLoading]   = useState(false);
  const [results,   setResults]   = useState<ResultImage[]>([]);
  const [selected,  setSelected]  = useState<Set<number>>(new Set());
  const [error,     setError]     = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
    setResults([]); setSelected(new Set()); setError("");
  };

  const generate = async () => {
    if (!file) return;
    setLoading(true); setError(""); setResults([]);
    try {
      const fd = new FormData();
      fd.append("image",     file);
      fd.append("direction", direction);
      fd.append("strength",  String(strength));
      fd.append("count",     "4");

      const res  = await fetch("/api/variation", { method: "POST", body: fd });
      const data = await res.json() as { ok: boolean; images?: ResultImage[]; error?: string };
      if (!data.ok) throw new Error(data.error || "생성 실패");
      setResults(data.images || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (no: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(no) ? next.delete(no) : next.add(no);
      return next;
    });

  const downloadImage = (url: string, no: number) => {
    const a = document.createElement("a");
    a.href     = url;
    a.download = `photoclinic_variation_${no}.jpg`;
    a.target   = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadSelected = () => {
    const targets = results.filter((r) =>
      selected.size === 0 ? true : selected.has(r.no)
    );
    targets.forEach((r, i) => setTimeout(() => downloadImage(r.url, r.no), i * 300));
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8]" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>

      {/* 헤더 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4" style={{ background: "#155855" }}>
        <Link href="/" className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: "rgba(255,255,255,.7)", textDecoration: "none" }}>
          <ArrowLeft size={14} />
          관리자 홈
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

      <div className="mx-auto max-w-5xl px-4 py-6 grid gap-5"
        style={{ gridTemplateColumns: "320px 1fr", alignItems: "start" }}>

        {/* ── 왼쪽 설정 패널 ── */}
        <div className="flex flex-col gap-4">

          {/* 사진 업로드 */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #C8DDD9" }}>
            <div className="px-4 py-3" style={{ background: "#EAF4F2", borderBottom: "1px solid #C8DDD9" }}>
              <p className="text-sm font-bold" style={{ color: "#155855" }}>📷 원본 사진</p>
            </div>
            <div className="p-4">
              {preview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="원본" className="w-full rounded-xl object-cover" style={{ maxHeight: 220 }} />
                  <button onClick={() => { setFile(null); setPreview(""); setResults([]); }}
                    className="absolute top-2 right-2 flex items-center justify-center rounded-full"
                    style={{ width: 28, height: 28, background: "rgba(0,0,0,.5)", color: "#fff", border: "none", cursor: "pointer" }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  className="w-full rounded-xl flex flex-col items-center justify-center gap-2 py-10"
                  style={{ border: "2px dashed #C8DDD9", background: "#FAFAF8", cursor: "pointer" }}>
                  <Upload size={24} color="#9BB5B0" />
                  <p className="text-sm font-bold" style={{ color: "#5A7470" }}>클릭 또는 드래그</p>
                  <p className="text-xs" style={{ color: "#9BB5B0" }}>JPG · PNG · HEIC</p>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            </div>
          </div>

          {/* 변화 방향 */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #C8DDD9" }}>
            <div className="px-4 py-3" style={{ background: "#EAF4F2", borderBottom: "1px solid #C8DDD9" }}>
              <p className="text-sm font-bold" style={{ color: "#155855" }}>변화 방향</p>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {DIRECTIONS.map((d) => (
                <button key={d.key} onClick={() => setDirection(d.key)}
                  className="rounded-xl p-2.5 text-left transition-all"
                  style={{
                    border:      direction === d.key ? "2px solid #155855" : "1.5px solid #C8DDD9",
                    background:  direction === d.key ? "#EAF4F2" : "#fff",
                    cursor:      "pointer",
                    fontFamily:  "inherit",
                  }}>
                  <p className="text-base mb-0.5">{d.emoji}</p>
                  <p className="text-xs font-bold" style={{ color: direction === d.key ? "#155855" : "#1C2B28" }}>{d.label}</p>
                  <p className="text-xs" style={{ color: "#9BB5B0" }}>{d.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 변화 강도 */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #C8DDD9" }}>
            <div className="px-4 py-3" style={{ background: "#EAF4F2", borderBottom: "1px solid #C8DDD9" }}>
              <p className="text-sm font-bold" style={{ color: "#155855" }}>변화 강도</p>
              <p className="text-xs" style={{ color: "#9BB5B0" }}>낮을수록 원본과 유사</p>
            </div>
            <div className="p-3 grid grid-cols-4 gap-2">
              {STRENGTHS.map((s, i) => (
                <button key={i} onClick={() => setStrength(i)}
                  className="rounded-xl py-2.5 text-center transition-all"
                  style={{
                    border:     strength === i ? "2px solid #E85D2C" : "1.5px solid #C8DDD9",
                    background: strength === i ? "#FFF0EB" : "#fff",
                    cursor:     "pointer",
                    fontFamily: "inherit",
                  }}>
                  <p className="text-sm font-bold" style={{ color: strength === i ? "#E85D2C" : "#1C2B28" }}>{s.label}</p>
                  <p className="text-xs" style={{ color: "#9BB5B0" }}>{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 생성 버튼 */}
          <button onClick={generate} disabled={loading || !file}
            className="w-full flex items-center justify-center gap-2 rounded-xl font-bold text-sm"
            style={{
              height:     52,
              background: loading || !file ? "#9BB5B0" : "#E85D2C",
              color:      "#fff",
              border:     "none",
              cursor:     loading || !file ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}>
            {loading ? (
              <><Loader2 size={18} className="animate-spin" />2단계 생성 중... (약 90초)</>
            ) : (
              <><Sparkles size={18} />베리에이션 4장 생성</>
            )}
          </button>

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FFF0EB", border: "1px solid #FACCB8", color: "#E85D2C" }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {/* ── 오른쪽 결과 ── */}
        <div>
          {results.length === 0 && !loading && (
            <div className="rounded-2xl flex flex-col items-center justify-center py-16 px-8 text-center"
              style={{ background: "#fff", border: "1px solid #C8DDD9" }}>
              <p className="text-4xl mb-4">🎨</p>
              <p className="text-base font-bold mb-2" style={{ color: "#155855" }}>사진 베리에이션 생성기</p>
              <p className="text-xs leading-relaxed mb-5" style={{ color: "#9BB5B0" }}>
                원본 사진을 올리고 방향·강도를 선택 후<br />
                생성 버튼을 누르면 4가지 버전이 만들어져요
              </p>
              <div className="w-full rounded-xl px-4 py-3 text-left text-xs leading-relaxed"
                style={{ background: "#EAF4F2", color: "#5A7470" }}>
                <p className="font-bold mb-1" style={{ color: "#155855" }}>포토클리닉 스타일 자동 적용</p>
                역광 + 림라이트 · 따뜻한 아이보리 인테리어<br />
                얕은 심도 + 자연스러운 보케 · 밝고 화사한 분위기
              </div>
            </div>
          )}

          {loading && (
            <div className="rounded-2xl flex flex-col items-center justify-center py-16 px-8 text-center"
              style={{ background: "#fff", border: "1px solid #C8DDD9" }}>
              <Loader2 size={48} className="animate-spin mb-5" style={{ color: "#155855" }} />
              <p className="text-base font-bold mb-2" style={{ color: "#155855" }}>AI가 베리에이션을 만들고 있어요</p>
              <p className="text-xs leading-relaxed" style={{ color: "#9BB5B0" }}>
                <b style={{ color: "#155855" }}>Step 1.</b> fal.ai Flux — 조명·분위기 변형 중<br />
                <b style={{ color: "#155855" }}>Step 2.</b> OpenAI — 원본 얼굴·피부 복원 중<br />
                약 90초 소요됩니다
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold" style={{ color: "#155855" }}>베리에이션 결과 {results.length}장</p>
                  <p className="text-xs mt-0.5" style={{ color: "#9BB5B0" }}>
                    {selected.size > 0 ? `${selected.size}장 선택됨` : "클릭해서 선택 · 저장"}
                  </p>
                </div>
                <button onClick={downloadSelected}
                  className="flex items-center gap-1.5 rounded-xl px-4 text-xs font-bold"
                  style={{ height: 36, background: "#155855", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  <Download size={14} />
                  {selected.size > 0 ? `${selected.size}장` : "전체"} 저장
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {results.map((r) => (
                  <div key={r.no} onClick={() => toggleSelect(r.no)}
                    className="relative rounded-xl overflow-hidden cursor-pointer"
                    style={{
                      border:     selected.has(r.no) ? "3px solid #E85D2C" : "3px solid transparent",
                      boxShadow:  "0 2px 12px rgba(0,0,0,.08)",
                    }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.url} alt={`Variation ${r.no}`}
                      className="w-full block object-cover" style={{ aspectRatio: "3/2" }} />
                    <div className="absolute top-2 left-2 flex items-center justify-center rounded-full text-xs font-bold"
                      style={{ width: 26, height: 26, background: selected.has(r.no) ? "#E85D2C" : "rgba(0,0,0,.4)", color: "#fff" }}>
                      {selected.has(r.no) ? "✓" : r.no}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadImage(r.url, r.no); }}
                      className="absolute bottom-2 right-2 text-xs font-bold rounded-lg px-2 py-1"
                      style={{ background: "rgba(0,0,0,.5)", color: "#fff", border: "none", cursor: "pointer" }}>
                      저장
                    </button>
                  </div>
                ))}
              </div>

              {preview && (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #C8DDD9" }}>
                  <p className="px-4 py-2 text-xs font-bold uppercase tracking-widest" style={{ background: "#EAF4F2", color: "#9BB5B0" }}>원본</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="원본" className="w-full block object-cover" style={{ maxHeight: 200 }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
