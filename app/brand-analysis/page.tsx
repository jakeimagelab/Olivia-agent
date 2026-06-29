"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const C = {
  green:  "#155855",
  orange: "#E85D2C",
  gold:   "#EB8F22",
  sage:   "#569082",
  ivory:  "#faf7f2",
  white:  "#ffffff",
  light:  "#EAF2F1",
  border: "rgba(21,88,85,0.12)",
  muted:  "#7A9490",
  text:   "#1a2b29",
  red:    "#DC2626",
  redBg:  "#FEF2F2",
};

/* ── Types ──────────────────────────────────────────────────── */
interface KeywordGroup {
  category: string;
  keywords: string[];
  interpretation: string;
  usage: string;
}
interface ServiceCategory {
  category: string;
  webWording: string;
  meaning: string;
  shootingUsage: string;
}
interface BrandFilmLine {
  usage: string;
  line: string;
}
interface PhotoContiItem {
  scene: string;
  shots: string;
  reason: string;
}
interface AdRisk {
  type: string;
  example: string;
  fix: string;
}
interface BrandResult {
  url: string;
  purpose: string;
  brandName: string;
  oneLiner: string;
  topKeywords: string[];
  mainMessage: string;
  shootingDirection: string;
  shootingDirectionReason: string;
  contentDirections: { brandFilm: string; photo: string; sns: string };
  keywordGroups: KeywordGroup[];
  serviceCategories: ServiceCategory[];
  brandFilmLines: BrandFilmLine[];
  photoConti: PhotoContiItem[];
  adRisks: AdRisk[];
}

/* ── Helper Components ──────────────────────────────────────── */
function Btn({ onClick, children, variant = "primary", disabled, style: s }: {
  onClick?: () => void; children: React.ReactNode;
  variant?: "primary" | "secondary" | "orange" | "ghost";
  disabled?: boolean; style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    height: 42, padding: "0 20px", border: "none", borderRadius: 10,
    fontFamily: "inherit", fontSize: 13, fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1, transition: "opacity .15s",
  };
  const v = {
    primary:   { background: C.green,  color: "#fff" },
    secondary: { background: C.white,  color: C.green,  border: `1.5px solid ${C.border}` },
    orange:    { background: C.orange, color: "#fff" },
    ghost:     { background: "transparent", color: C.muted, border: `1px solid ${C.border}` },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...v[variant], ...s }}>{children}</button>;
}

function Card({ children, style: s }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.white, borderRadius: 14,
      border: `1px solid ${C.border}`,
      boxShadow: "0 1px 8px rgba(21,88,85,.05)", ...s
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 900, color: C.sage, letterSpacing: ".08em", textTransform: "uppercase" as const, marginBottom: 14 }}>
      {children}
    </div>
  );
}

function Chip({ label, color = C.green }: { label: string; color?: string }) {
  return (
    <span style={{
      display: "inline-block", fontSize: 12, fontWeight: 700,
      padding: "4px 12px", borderRadius: 99,
      background: color + "18", color,
      border: `1px solid ${color}28`, marginRight: 6, marginBottom: 6,
    }}>{label}</span>
  );
}

function Table({ headers, rows, redRows }: {
  headers: string[]; rows: string[][];
  redRows?: number[];
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                background: C.light, color: C.green, fontWeight: 900,
                padding: "10px 14px", textAlign: "left" as const,
                border: `1px solid ${C.border}`, whiteSpace: "nowrap" as const,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: redRows?.includes(ri) ? C.redBg : ri % 2 === 0 ? C.white : C.ivory }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: "9px 14px", border: `1px solid ${C.border}`,
                  lineHeight: 1.5, color: redRows?.includes(ri) ? C.red : C.text,
                }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Downloads ──────────────────────────────────────────────── */
function makeWordHtml(r: BrandResult): string {
  const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<html xmlns:o='urn:schemas-microsoft-com:office:office'
    xmlns:w='urn:schemas-microsoft-com:office:word'
    xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>${escHtml(r.brandName)} 브랜드 분석</title>
<style>
  body { font-family:'Malgun Gothic',sans-serif; color:#1a2b29; line-height:1.7; margin:40px; }
  h1 { color:#155855; border-bottom:2px solid #155855; padding-bottom:8px; }
  h2 { color:#155855; margin-top:28px; }
  table { border-collapse:collapse; width:100%; margin:12px 0; }
  th { background:#EAF2F1; color:#155855; padding:8px 12px; border:1px solid #C8DDD9; text-align:left; }
  td { padding:8px 12px; border:1px solid #C8DDD9; }
  .chip { display:inline-block; background:#EAF2F1; color:#155855; border-radius:99px;
          padding:2px 10px; margin:2px; font-size:12px; }
  .sub { color:#569082; font-size:12px; }
  .red { color:#DC2626; }
  .redrow { background:#FEF2F2; }
</style></head><body>
<h1>${escHtml(r.brandName)} 브랜드 분석 리포트</h1>
<p class="sub">분석 URL: ${escHtml(r.url)} | 목적: ${escHtml(r.purpose)}</p>

<h2>브랜드 한 줄 정의</h2>
<p>${escHtml(r.oneLiner)}</p>

<h2>핵심 키워드 TOP 10</h2>
<p>${r.topKeywords.map(k => `<span class="chip">${escHtml(k)}</span>`).join(" ")}</p>

<h2>메인 메시지</h2>
<p>${escHtml(r.mainMessage)}</p>

<h2>추천 촬영 방향</h2>
<p><strong>${escHtml(r.shootingDirection)}</strong> — ${escHtml(r.shootingDirectionReason)}</p>

<h2>콘텐츠 활용 방향</h2>
<p><strong>브랜드필름:</strong> ${escHtml(r.contentDirections.brandFilm)}</p>
<p><strong>사진촬영:</strong> ${escHtml(r.contentDirections.photo)}</p>
<p><strong>SNS:</strong> ${escHtml(r.contentDirections.sns)}</p>

<h2>브랜드 키워드 분석</h2>
<table>
  <tr><th>분류</th><th>키워드</th><th>해석</th><th>촬영 활용</th></tr>
  ${r.keywordGroups.map(g => `<tr>
    <td><strong>${escHtml(g.category)}</strong></td>
    <td>${g.keywords.map(k => `<span class="chip">${escHtml(k)}</span>`).join(" ")}</td>
    <td>${escHtml(g.interpretation)}</td>
    <td>${escHtml(g.usage)}</td>
  </tr>`).join("")}
</table>

<h2>서비스 카테고리</h2>
<table>
  <tr><th>카테고리</th><th>홈페이지 워딩</th><th>의미</th><th>촬영 활용</th></tr>
  ${r.serviceCategories.map(s => `<tr>
    <td>${escHtml(s.category)}</td>
    <td>${escHtml(s.webWording)}</td>
    <td>${escHtml(s.meaning)}</td>
    <td>${escHtml(s.shootingUsage)}</td>
  </tr>`).join("")}
</table>

<h2>브랜드필름 문장</h2>
<table>
  <tr><th>용도</th><th>문장</th></tr>
  ${r.brandFilmLines.map(l => `<tr><td>${escHtml(l.usage)}</td><td><strong>${escHtml(l.line)}</strong></td></tr>`).join("")}
</table>

<h2>사진 콘티 활용</h2>
<table>
  <tr><th>장면</th><th>필요한 컷</th><th>이유</th></tr>
  ${r.photoConti.map(p => `<tr>
    <td>${escHtml(p.scene)}</td>
    <td>${escHtml(p.shots)}</td>
    <td>${escHtml(p.reason)}</td>
  </tr>`).join("")}
</table>

${r.adRisks.length > 0 ? `<h2>의료광고 리스크 체크</h2>
<table>
  <tr><th>위험 유형</th><th>위험 표현 예시</th><th>수정 방향</th></tr>
  ${r.adRisks.map(a => `<tr class="redrow">
    <td class="red">${escHtml(a.type)}</td>
    <td>${escHtml(a.example)}</td>
    <td>${escHtml(a.fix)}</td>
  </tr>`).join("")}
</table>` : "<h2>의료광고 리스크</h2><p>특별한 위험 표현이 감지되지 않았습니다.</p>"}
</body></html>`;
}

async function downloadWord(r: BrandResult) {
  const html = makeWordHtml(r);
  const blob = new Blob(["﻿" + html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${r.brandName}_브랜드분석.doc`;
  a.click(); URL.revokeObjectURL(url);
}

async function downloadExcel(r: BrandResult) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const s1 = XLSX.utils.aoa_to_sheet([
    ["항목", "내용"],
    ["브랜드명", r.brandName],
    ["한 줄 정의", r.oneLiner],
    ["메인 메시지", r.mainMessage],
    ["추천 촬영 방향", r.shootingDirection],
    ["방향 이유", r.shootingDirectionReason],
    ["핵심 키워드", r.topKeywords.join(", ")],
    ["브랜드필름 방향", r.contentDirections.brandFilm],
    ["사진 촬영 방향", r.contentDirections.photo],
    ["SNS 방향", r.contentDirections.sns],
  ]);
  XLSX.utils.book_append_sheet(wb, s1, "요약");

  // Sheet 2: Keywords
  const kwRows: string[][] = [["분류", "키워드", "해석", "촬영 활용"]];
  for (const g of r.keywordGroups) {
    kwRows.push([g.category, g.keywords.join(", "), g.interpretation, g.usage]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kwRows), "브랜드 키워드");

  // Sheet 3: Services
  const svcRows: string[][] = [["카테고리", "홈페이지 워딩", "의미", "촬영 활용"]];
  for (const s of r.serviceCategories) svcRows.push([s.category, s.webWording, s.meaning, s.shootingUsage]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(svcRows), "서비스 카테고리");

  // Sheet 4: Brand Film
  const bfRows: string[][] = [["용도", "문장"]];
  for (const l of r.brandFilmLines) bfRows.push([l.usage, l.line]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bfRows), "브랜드필름 문장");

  // Sheet 5: Photo Conti
  const pcRows: string[][] = [["장면", "필요한 컷", "이유"]];
  for (const p of r.photoConti) pcRows.push([p.scene, p.shots, p.reason]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pcRows), "사진 콘티");

  // Sheet 6: Ad Risks
  const arRows: string[][] = [["위험 유형", "위험 표현", "수정 방향"]];
  for (const a of r.adRisks) arRows.push([a.type, a.example, a.fix]);
  if (r.adRisks.length === 0) arRows.push(["이상 없음", "-", "-"]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(arRows), "의료광고 리스크");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = `${r.brandName}_브랜드분석.xlsx`;
  a.click(); URL.revokeObjectURL(href);
}

/* ── Progress messages ──────────────────────────────────────── */
const PROGRESS_STEPS = [
  { pct: 8,  msg: "홈페이지 접속 중..." },
  { pct: 22, msg: "텍스트 수집 중..." },
  { pct: 38, msg: "하위 페이지 탐색 중..." },
  { pct: 55, msg: "브랜드 요소 분류 중..." },
  { pct: 70, msg: "AI 분석 중 (Claude)..." },
  { pct: 85, msg: "결과 정리 중..." },
];

const TABS = ["요약", "브랜드 키워드", "서비스 카테고리", "브랜드필름 문장", "사진 콘티", "광고 리스크"];

const PURPOSE_OPTIONS = [
  { value: "all",        label: "전체 분석",      desc: "모든 항목 종합" },
  { value: "brand_film", label: "브랜드필름",     desc: "영상 기획 중심" },
  { value: "photo",      label: "사진 촬영",      desc: "스틸컷 콘티 중심" },
  { value: "proposal",   label: "제안서",          desc: "카피 & 방향 중심" },
  { value: "sns",        label: "SNS 콘텐츠",     desc: "인스타 활용 중심" },
];

/* ── Main Page ──────────────────────────────────────────────── */
export default function BrandAnalysisPage() {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [url, setUrl] = useState("");
  const [purpose, setPurpose] = useState("all");
  const [depth, setDepth] = useState("standard");
  const [activeTab, setActiveTab] = useState(0);
  const [result, setResult] = useState<BrandResult | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState(PROGRESS_STEPS[0].msg);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Animate progress bar during loading
  useEffect(() => {
    if (step !== 1) return;
    let idx = 0;
    setProgress(PROGRESS_STEPS[0].pct);
    setProgressMsg(PROGRESS_STEPS[0].msg);
    const interval = setInterval(() => {
      idx = Math.min(idx + 1, PROGRESS_STEPS.length - 1);
      setProgress(PROGRESS_STEPS[idx].pct);
      setProgressMsg(PROGRESS_STEPS[idx].msg);
      if (idx === PROGRESS_STEPS.length - 1) clearInterval(interval);
    }, 2800);
    return () => clearInterval(interval);
  }, [step]);

  const handleAnalyze = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) { setError("URL을 입력해주세요."); return; }
    setError("");
    setStep(1);
    setProgress(0);
    try {
      const res = await fetch("/api/brand-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, purpose, depth }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "분석에 실패했습니다");
      setProgress(100);
      setProgressMsg("완료!");
      await new Promise(r => setTimeout(r, 600));
      setResult(data);
      setActiveTab(0);
      setStep(2);
    } catch (e: any) {
      setError(e.message ?? "오류가 발생했습니다");
      setStep(0);
    }
  }, [url, purpose, depth]);

  const handleDownload = async (type: "word" | "excel") => {
    if (!result) return;
    setDownloading(type);
    try {
      if (type === "word") await downloadWord(result);
      else await downloadExcel(result);
    } finally {
      setDownloading(null);
    }
  };

  /* ── Step 0: Form ─────────────────────────────────────────── */
  const renderForm = () => (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", padding: "40px 0 32px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.green, marginBottom: 8 }}>
          홈페이지 브랜드 분석
        </div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
          병원 홈페이지 URL을 입력하면 올리비아가 브랜드 키워드, 촬영 방향,<br />
          브랜드필름 문장, 사진 콘티 방향을 자동으로 분석합니다.
        </div>
      </div>

      {/* URL Input */}
      <Card style={{ padding: "28px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.sage, marginBottom: 8, letterSpacing: ".05em" }}>
          홈페이지 URL
        </div>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAnalyze(); }}
          placeholder="https://hospital.kr 또는 hospital.kr"
          style={{
            width: "100%", boxSizing: "border-box" as const,
            border: `1.5px solid ${error ? C.red : C.border}`,
            borderRadius: 10, padding: "14px 16px",
            fontSize: 15, fontFamily: "inherit",
            background: C.white, color: C.text, outline: "none",
          }}
        />
        {error && (
          <div style={{ marginTop: 8, fontSize: 13, color: C.red, fontWeight: 700 }}>{error}</div>
        )}
      </Card>

      {/* Purpose */}
      <Card style={{ padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.sage, marginBottom: 14, letterSpacing: ".05em" }}>
          분석 목적
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
          {PURPOSE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPurpose(opt.value)}
              style={{
                padding: "12px 8px", borderRadius: 10,
                border: `1.5px solid ${purpose === opt.value ? C.green : C.border}`,
                background: purpose === opt.value ? C.light : C.white,
                cursor: "pointer", fontFamily: "inherit", textAlign: "center" as const,
                transition: "all .15s",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900, color: purpose === opt.value ? C.green : C.text }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Depth */}
      <Card style={{ padding: "18px 24px", marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.sage, marginBottom: 12, letterSpacing: ".05em" }}>
          분석 깊이
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { value: "simple",   label: "간단 분석", desc: "메인 페이지만 · 빠름 (~15초)" },
            { value: "standard", label: "상세 분석", desc: "하위 페이지 포함 · 정확 (~30초)" },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setDepth(opt.value)}
              style={{
                padding: "12px 16px", borderRadius: 10,
                border: `1.5px solid ${depth === opt.value ? C.green : C.border}`,
                background: depth === opt.value ? C.light : C.white,
                cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900, color: depth === opt.value ? C.green : C.text }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </Card>

      <Btn onClick={handleAnalyze} style={{ width: "100%", height: 50, fontSize: 15 }}>
        브랜드 분석 시작 →
      </Btn>
    </div>
  );

  /* ── Step 1: Loading ──────────────────────────────────────── */
  const renderLoading = () => (
    <div style={{ maxWidth: 500, margin: "80px auto", textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 20 }}>🔍</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: C.green, marginBottom: 8 }}>
        홈페이지 분석 중
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 28 }}>{url}</div>

      {/* Progress bar */}
      <div style={{ background: C.light, borderRadius: 99, height: 8, marginBottom: 12, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 99,
          background: `linear-gradient(90deg, ${C.green}, ${C.sage})`,
          width: `${progress}%`, transition: "width 2s ease",
        }} />
      </div>
      <div style={{ fontSize: 13, color: C.sage, fontWeight: 700 }}>{progressMsg}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
        하위 페이지 탐색 · AI 분석 · 결과 정리 중입니다. 잠시만 기다려주세요.
      </div>
    </div>
  );

  /* ── Step 2: Results ──────────────────────────────────────── */
  const renderResults = () => {
    if (!result) return null;
    return (
      <div>
        {/* Result header */}
        <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.green, marginBottom: 4 }}>
                {result.brandName}
              </div>
              <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6, maxWidth: 560 }}>
                {result.oneLiner}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>
                {result.url} · {result.purpose}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn variant="secondary" onClick={() => handleDownload("word")} disabled={!!downloading}>
                {downloading === "word" ? "생성 중..." : "↓ Word"}
              </Btn>
              <Btn variant="secondary" onClick={() => handleDownload("excel")} disabled={!!downloading}>
                {downloading === "excel" ? "생성 중..." : "↓ Excel"}
              </Btn>
              <Btn variant="secondary" onClick={() => window.print()}>
                🖨 인쇄/PDF
              </Btn>
              <Btn variant="ghost" onClick={() => { setStep(0); setResult(null); }}>
                다시 분석
              </Btn>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, overflowX: "auto", background: C.white, borderRadius: 12, border: `1px solid ${C.border}` }}>
          {TABS.map((tab, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              style={{
                flex: 1, minWidth: 90, padding: "12px 6px",
                border: "none", borderBottom: `3px solid ${activeTab === i ? C.green : "transparent"}`,
                background: "transparent", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: activeTab === i ? 900 : 600,
                color: activeTab === i ? C.green : C.muted,
                transition: "all .15s", whiteSpace: "nowrap" as const,
              }}
            >
              {tab}
              {i === 5 && result.adRisks.length > 0 && (
                <span style={{ marginLeft: 4, fontSize: 10, background: C.red, color: "#fff", borderRadius: 99, padding: "1px 5px" }}>
                  {result.adRisks.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab 0: Summary */}
        {activeTab === 0 && (
          <div style={{ display: "grid", gap: 16 }}>
            {/* Keywords */}
            <Card style={{ padding: "20px 24px" }}>
              <SectionTitle>핵심 키워드 TOP 10</SectionTitle>
              <div>{result.topKeywords.map((k, i) => <Chip key={i} label={k} color={i < 3 ? C.orange : C.green} />)}</div>
            </Card>

            {/* Main message + shooting direction */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Card style={{ padding: "20px 24px" }}>
                <SectionTitle>메인 메시지</SectionTitle>
                <div style={{ fontSize: 14, color: C.text, lineHeight: 1.7 }}>{result.mainMessage}</div>
              </Card>
              <Card style={{ padding: "20px 24px" }}>
                <SectionTitle>추천 촬영 방향</SectionTitle>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.orange, marginBottom: 8 }}>
                  {result.shootingDirection}
                </div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{result.shootingDirectionReason}</div>
              </Card>
            </div>

            {/* Content directions */}
            <Card style={{ padding: "20px 24px" }}>
              <SectionTitle>콘텐츠 활용 방향</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                {[
                  { label: "브랜드필름", text: result.contentDirections.brandFilm, icon: "🎬" },
                  { label: "사진촬영",   text: result.contentDirections.photo,      icon: "📷" },
                  { label: "SNS 콘텐츠", text: result.contentDirections.sns,        icon: "📱" },
                ].map((d, i) => (
                  <div key={i} style={{ background: C.ivory, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 18, marginBottom: 6 }}>{d.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: C.green, marginBottom: 6 }}>{d.label}</div>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{d.text}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Tab 1: Brand Keywords */}
        {activeTab === 1 && (
          <Card style={{ padding: "20px 24px" }}>
            <SectionTitle>브랜드 키워드 분류</SectionTitle>
            <div style={{ display: "grid", gap: 16 }}>
              {result.keywordGroups.map((g, i) => (
                <div key={i} style={{ background: C.ivory, borderRadius: 10, padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: C.green, background: C.light, padding: "3px 10px", borderRadius: 99 }}>
                      {g.category}
                    </span>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    {g.keywords.map((k, j) => <Chip key={j} label={k} />)}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 900, color: C.sage, marginBottom: 4 }}>해석</div>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{g.interpretation}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 900, color: C.orange, marginBottom: 4 }}>촬영 활용</div>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{g.usage}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Tab 2: Service Categories */}
        {activeTab === 2 && (
          <Card style={{ padding: "20px 24px" }}>
            <SectionTitle>서비스 카테고리 정리</SectionTitle>
            <Table
              headers={["카테고리", "홈페이지 워딩", "의미", "촬영 활용"]}
              rows={result.serviceCategories.map(s => [s.category, s.webWording, s.meaning, s.shootingUsage])}
            />
          </Card>
        )}

        {/* Tab 3: Brand Film Lines */}
        {activeTab === 3 && (
          <Card style={{ padding: "20px 24px" }}>
            <SectionTitle>브랜드필름 문장</SectionTitle>
            <div style={{ display: "grid", gap: 12 }}>
              {result.brandFilmLines.map((l, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "120px 1fr",
                  background: C.ivory, borderRadius: 10, overflow: "hidden",
                }}>
                  <div style={{
                    background: C.light, padding: "16px 14px",
                    fontSize: 11, fontWeight: 900, color: C.green,
                    display: "flex", alignItems: "center",
                  }}>
                    {l.usage}
                  </div>
                  <div style={{ padding: "16px 18px", fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.6 }}>
                    "{l.line}"
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Tab 4: Photo Conti */}
        {activeTab === 4 && (
          <Card style={{ padding: "20px 24px" }}>
            <SectionTitle>사진 콘티 활용</SectionTitle>
            <Table
              headers={["장면", "필요한 컷", "이유"]}
              rows={result.photoConti.map(p => [p.scene, p.shots, p.reason])}
            />
          </Card>
        )}

        {/* Tab 5: Ad Risk */}
        {activeTab === 5 && (
          <Card style={{ padding: "20px 24px" }}>
            <SectionTitle>의료광고 리스크 체크</SectionTitle>
            {result.adRisks.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.sage }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>특별한 위험 표현이 감지되지 않았습니다.</div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 14, padding: "10px 14px", background: C.redBg, borderRadius: 8, fontSize: 13, color: C.red, fontWeight: 700 }}>
                  ⚠ {result.adRisks.length}건의 주의 표현이 감지되었습니다. 의료광고 심의 전에 반드시 확인하세요.
                </div>
                <Table
                  headers={["위험 유형", "위험 표현 예시", "수정 방향"]}
                  rows={result.adRisks.map(a => [a.type, a.example, a.fix])}
                  redRows={result.adRisks.map((_, i) => i)}
                />
              </>
            )}
          </Card>
        )}
      </div>
    );
  };

  /* ── Layout ───────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: "100vh", background: C.ivory, fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(250,247,242,.92)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`,
        padding: "0 24px", height: 52,
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <Link href="/" style={{ fontSize: 13, color: C.muted, textDecoration: "none", fontWeight: 700 }}>← 홈</Link>
        <div style={{ width: 1, height: 16, background: C.border }} />
        <div style={{ fontSize: 14, fontWeight: 900, color: C.green }}>홈페이지 브랜드 분석</div>
        {result && (
          <>
            <div style={{ width: 1, height: 16, background: C.border }} />
            <div style={{ fontSize: 12, color: C.muted }}>{result.brandName}</div>
          </>
        )}
      </div>

      {/* Main */}
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "24px 20px 80px" }}>
        {step === 0 && renderForm()}
        {step === 1 && renderLoading()}
        {step === 2 && renderResults()}
      </div>

      {/* Print style */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
