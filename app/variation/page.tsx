"use client";

import { useState, useRef } from "react";
import { Upload, X, Download, Sparkles, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";

type ResultImage = { url: string; no: number };

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
    <div className="gauge-bar">
      <div className="gauge-bar-top">
        <div>
          <p className="gauge-label">{label}</p>
          {sub && <p className="gauge-sub" style={{ color }}>{sub}</p>}
        </div>
        <span className="gauge-value" style={{ color, background: color + "18" }}>
          {value}%
        </span>
      </div>
      <input
        type="range" min={0} max={100} step={5} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="gauge-slider"
        style={{ accentColor: color }}
      />
      <div className="gauge-row-labels">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

export default function VariationPage() {
  const [file,           setFile]           = useState<File | null>(null);
  const [preview,        setPreview]        = useState("");
  const [fluxStrength,   setFluxStrength]   = useState(40);
  const [openaiStrength, setOpenaiStrength] = useState(80);
  const [loading,        setLoading]        = useState(false);
  const [results,        setResults]        = useState<ResultImage[]>([]);
  const [selected,       setSelected]       = useState<Set<number>>(new Set());
  const [error,          setError]          = useState("");
  const [pipeline,       setPipeline]       = useState("");
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

  const pipelineLabel =
    pipeline === "openai-only" ? "OpenAI 단독"
    : pipeline === "flux+openai" ? "Flux + OpenAI"
    : pipeline === "flux-only"   ? "Flux 단독"
    : "";

  const pipelineDesc =
    fluxStrength > 0 && openaiStrength > 0 ? "⚡ Flux 변형 → 🧑 OpenAI 얼굴 복원 (2단계 파이프라인)"
    : fluxStrength > 0                     ? "⚡ Flux 변형만 적용 (빠른 생성)"
    : openaiStrength > 0                   ? "🧑 OpenAI만 적용 (얼굴 최대 보존)"
    : null;

  const disabled = loading || !file || (fluxStrength === 0 && openaiStrength === 0);

  return (
    <div className="pc-page">
      <PageHeader title="Photo Variation" />

      <div className="pc-content pc-content--wide">

        {/* 히어로 */}
        <div className="pc-hero">
          <p className="pc-hero-kicker">AI PHOTO VARIATION</p>
          <h1 className="pc-hero-title">사진 베리에이션 생성기</h1>
          <p className="pc-hero-desc">
            원본 사진을 올리고 Flux·OpenAI 강도를 조절하면 얼굴·구도·분위기를 유지한 4가지 버전을 생성합니다.
          </p>
        </div>

        <div className="var-layout">

          {/* ── 왼쪽 컨트롤 패널 ── */}
          <div className="var-controls">

            {/* 원본 사진 */}
            <div className="pc-card">
              <div className="pc-card-header">
                <span className="pc-card-title">
                  <Upload size={14} /> 원본 사진
                </span>
              </div>
              <div className="var-upload-body">
                {preview ? (
                  <div className="var-preview-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="원본" className="var-preview-img" />
                    <button
                      className="var-remove-btn"
                      onClick={() => { setFile(null); setPreview(""); setResults([]); }}
                      aria-label="사진 제거"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    className="var-dropzone"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const f = e.dataTransfer.files[0];
                      if (f) handleFile(f);
                    }}
                  >
                    <Upload size={20} className="var-dropzone-icon" />
                    <span className="var-dropzone-label">클릭 또는 드래그하여 업로드</span>
                    <span className="var-dropzone-hint">JPG · PNG · HEIC</span>
                  </button>
                )}
                <input
                  ref={fileRef} type="file" accept="image/*"
                  style={{ display: "none" }}
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
                />
              </div>
            </div>

            {/* Flux 슬라이더 */}
            <div className="pc-card pc-card--padded">
              <p className="var-panel-label">⚡ Flux 변화 강도</p>
              <GaugeBar
                label="변화 강도"
                sub={fluxStrength === 0 ? "Flux 건너뜀 — OpenAI만 사용합니다" : undefined}
                value={fluxStrength}
                onChange={setFluxStrength}
                leftLabel="원본 유지"
                rightLabel="많이 변화"
                color="#155855"
              />
            </div>

            {/* OpenAI 슬라이더 */}
            <div className="pc-card pc-card--padded">
              <p className="var-panel-label">🧑 OpenAI 얼굴 보정</p>
              <GaugeBar
                label="얼굴 보존 강도"
                sub={openaiStrength === 0 ? "OpenAI 건너뜀 — Flux 결과 그대로 사용" : undefined}
                value={openaiStrength}
                onChange={setOpenaiStrength}
                leftLabel="사용 안 함"
                rightLabel="최대 보존"
                color="#E85D2C"
              />
            </div>

            {/* 파이프라인 표시 */}
            <div className={`var-pipeline ${!pipelineDesc ? "var-pipeline--warn" : ""}`}>
              <p className="var-pipeline-title">현재 파이프라인</p>
              {pipelineDesc
                ? <p className="var-pipeline-desc">{pipelineDesc}</p>
                : <p className="var-pipeline-warn">⚠️ 강도가 모두 0% — 생성되지 않습니다</p>
              }
            </div>

            {/* 생성 버튼 */}
            <button
              className="pc-btn pc-btn--orange pc-btn--lg var-gen-btn"
              onClick={generate}
              disabled={disabled}
            >
              {loading
                ? <><Loader2 size={18} className="animate-spin" />생성 중... (약 60~120초)</>
                : <><Sparkles size={18} />베리에이션 4장 생성</>
              }
            </button>

            {error && <div className="generator-error">⚠ {error}</div>}

            {/* 추천 설정 팁 */}
            {!results.length && !loading && (
              <div className="var-tips">
                <p className="var-tips-title">추천 설정</p>
                <p>Flux 40% + OpenAI 80% → 얼굴 보존 + 자연스러운 변화</p>
                <p>Flux 0% + OpenAI 100% → 얼굴 완전 보존 (색감만 조정)</p>
                <p>Flux 70% + OpenAI 0% → 빠른 생성 (얼굴 변할 수 있음)</p>
              </div>
            )}
          </div>

          {/* ── 오른쪽 결과 ── */}
          <div className="var-results">

            {/* 빈 상태 */}
            {results.length === 0 && !loading && (
              <div className="pc-card var-empty">
                <div className="var-empty-icon">🎨</div>
                <p className="var-empty-title">사진을 올리고 생성 버튼을 눌러주세요</p>
                <p className="var-empty-desc">
                  원본 사진의 얼굴·구도·색감을 최대한 유지하면서<br />
                  4가지 자연스러운 변형 버전을 생성합니다.
                </p>
              </div>
            )}

            {/* 로딩 */}
            {loading && (
              <div className="pc-card var-loading">
                <Loader2 size={40} className="animate-spin var-loading-icon" />
                <p className="var-loading-title">AI가 베리에이션을 생성하고 있어요</p>
                <p className="var-loading-desc">
                  {fluxStrength > 0 && (
                    <span><b>Step 1.</b> Flux — 조명·분위기 변형 중 ({fluxStrength}%)<br /></span>
                  )}
                  {openaiStrength > 0 && (
                    <span><b>Step 2.</b> OpenAI — 얼굴·피부 복원 중 ({openaiStrength}%)<br /></span>
                  )}
                  약 {fluxStrength > 0 && openaiStrength > 0 ? "90~120" : "30~60"}초 소요됩니다
                </p>
              </div>
            )}

            {/* 결과 */}
            {results.length > 0 && (
              <div className="var-result-wrap">
                <div className="var-result-header">
                  <div>
                    <p className="var-result-title">
                      베리에이션 결과 {results.length}장
                      {pipelineLabel && (
                        <span className="pc-badge pc-badge--teal" style={{ marginLeft: 8 }}>
                          {pipelineLabel}
                        </span>
                      )}
                    </p>
                    <p className="var-result-sub">
                      {selected.size > 0 ? `${selected.size}장 선택됨` : "이미지를 클릭해서 선택 · 저장"}
                    </p>
                  </div>
                  <button className="pc-btn pc-btn--primary pc-btn--sm" onClick={downloadSelected}>
                    <Download size={14} />
                    {selected.size > 0 ? `${selected.size}장` : "전체"} 저장
                  </button>
                </div>

                <div className="var-grid">
                  {results.map(r => (
                    <div
                      key={r.no}
                      className={`var-card ${selected.has(r.no) ? "var-card--selected" : ""}`}
                      onClick={() => toggleSelect(r.no)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.url} alt={`Variation ${r.no}`} className="var-card-img" />
                      <div className={`var-card-badge ${selected.has(r.no) ? "var-card-badge--active" : ""}`}>
                        {selected.has(r.no) ? "✓" : r.no}
                      </div>
                      <button
                        className="var-card-save"
                        onClick={e => { e.stopPropagation(); downloadImage(r.url, r.no); }}
                      >
                        <Download size={11} /> 저장
                      </button>
                    </div>
                  ))}
                </div>

                {/* 원본 비교 */}
                {preview && (
                  <div className="pc-card var-original">
                    <div className="pc-card-header">
                      <span className="pc-card-title">원본 사진</span>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="원본" className="var-original-img" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
