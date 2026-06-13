"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { Upload, Sparkles, Download, Copy, Check, RefreshCw } from "lucide-react";

// ── 색상 ──────────────────────────────────────────────────
const C = {
  teal: "#155855", orange: "#E85D2C", cream: "#F5F0EB",
  bg: "#F0F9F8", white: "#fff", border: "rgba(21,88,85,.12)",
  muted: "#5A7470", light: "#EAF4F2",
};

// ── 비율 ──────────────────────────────────────────────────
const RATIOS = [
  { key: "1:1",  label: "1:1 피드",    w: 540, h: 540 },
  { key: "4:5",  label: "4:5 세로",    w: 432, h: 540 },
  { key: "9:16", label: "9:16 스토리", w: 304, h: 540 },
];

// ── 템플릿 ────────────────────────────────────────────────
const TEMPLATES = [
  { key: "photo-bottom",  name: "사진 + 텍스트",    desc: "상단 사진 · 하단 크림 카드" },
  { key: "photo-overlay", name: "오버레이",          desc: "사진 위에 텍스트" },
  { key: "text-only",     name: "텍스트 카드",       desc: "크림 배경 · 중앙 텍스트" },
  { key: "frame",         name: "프레임",             desc: "사진 + 바깥 프레임" },
  { key: "split-v",       name: "포인트 바",         desc: "컬러 바 + 텍스트" },
];

// ── 콘텐츠 유형 ───────────────────────────────────────────
const CONTENT_TYPES = [
  { key: "portfolio",  label: "포트폴리오", emoji: "📸" },
  { key: "bts",        label: "촬영 현장",  emoji: "🎬" },
  { key: "philosophy", label: "철학·생각",  emoji: "💭" },
  { key: "space",      label: "공간 감성",  emoji: "🏛" },
  { key: "profile",    label: "의료진 프로필", emoji: "👤" },
];

const DEPTS = ["피부과", "성형외과", "치과", "안과", "정형외과", "한의원", "산부인과", "내과"];
const TONES = ["따뜻·감성", "다크·고급", "모던·절제", "클린·밝음"];

type Ratio = "1:1" | "4:5" | "9:16";
type Template = "photo-bottom" | "photo-overlay" | "text-only" | "frame" | "split-v";
type CaptionItem = { type: string; text: string };

// ── 캔버스 렌더러 ─────────────────────────────────────────
function renderCanvas(
  canvas: HTMLCanvasElement,
  opts: {
    template: Template; ratio: Ratio;
    photo: string | null; mainText: string; subText: string;
    accentColor: string; bgColor: string;
  }
) {
  const r = RATIOS.find(r => r.key === opts.ratio)!;
  canvas.width  = r.w;
  canvas.height = r.h;
  const ctx = canvas.getContext("2d")!;
  const { w, h } = r;

  const drawBg = () => {
    ctx.fillStyle = opts.bgColor;
    ctx.fillRect(0, 0, w, h);
  };

  const drawPhoto = (x: number, y: number, pw: number, ph: number) => {
    if (!opts.photo) {
      ctx.fillStyle = "#ddd";
      ctx.fillRect(x, y, pw, ph);
      ctx.fillStyle = "#999";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("사진 없음", x + pw/2, y + ph/2);
      return;
    }
    const img = new Image();
    img.onload = () => {
      // cover fit
      const ir = img.width / img.height;
      const cr = pw / ph;
      let sx=0,sy=0,sw=img.width,sh=img.height;
      if (ir > cr) { sw = img.height * cr; sx = (img.width-sw)/2; }
      else { sh = img.width / cr; sy = (img.height-sh)/2; }
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, pw, ph);
      ctx.clip();
      ctx.drawImage(img, sx, sy, sw, sh, x, y, pw, ph);
      ctx.restore();
    };
    img.src = opts.photo;
  };

  const drawText = (
    text: string, x: number, y: number, maxW: number,
    size: number, color: string, weight = "700",
    align: CanvasTextAlign = "left"
  ) => {
    if (!text) return 0;
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px 'Apple SD Gothic Neo', sans-serif`;
    ctx.textAlign = align;
    const words = text.split("\n");
    let totalH = 0;
    for (const line of words) {
      // 줄바꿈 처리
      const parts: string[] = [];
      let cur = "";
      for (const ch of line) {
        const test = cur + ch;
        if (ctx.measureText(test).width > maxW && cur) { parts.push(cur); cur = ch; }
        else cur = test;
      }
      if (cur) parts.push(cur);
      for (const p of parts) {
        ctx.fillText(p, x, y + totalH);
        totalH += size * 1.5;
      }
    }
    return totalH;
  };

  const pad = 28;
  ctx.clearRect(0, 0, w, h);

  if (opts.template === "photo-bottom") {
    const ph = Math.round(h * 0.6);
    drawBg();
    drawPhoto(0, 0, w, ph);
    // 하단 텍스트 영역
    const ty = ph + pad;
    drawText(opts.mainText, pad, ty + 24, w - pad*2, 20, "#1C2B28");
    if (opts.subText) drawText(opts.subText, pad, ty + 24 + 36, w - pad*2, 13, C.muted, "400");
    // 브랜드 도트
    ctx.fillStyle = opts.accentColor;
    ctx.beginPath();
    ctx.arc(pad, ty + 10, 4, 0, Math.PI*2);
    ctx.fill();
  }

  else if (opts.template === "photo-overlay") {
    drawPhoto(0, 0, w, h);
    // 하단 그라디언트 오버레이
    const grad = ctx.createLinearGradient(0, h*0.5, 0, h);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    drawText(opts.mainText, pad, h - 80, w - pad*2, 20, "#fff");
    if (opts.subText) drawText(opts.subText, pad, h - 48, w - pad*2, 12, "rgba(255,255,255,.8)", "400");
  }

  else if (opts.template === "text-only") {
    drawBg();
    // 중앙 정렬
    const cx = w/2;
    const cy = h/2 - 30;
    // 액센트 바
    ctx.fillStyle = opts.accentColor;
    ctx.fillRect(cx - 24, cy - 40, 48, 3);
    drawText(opts.mainText, cx, cy - 8, w - pad*3, 22, "#1C2B28", "900", "center");
    if (opts.subText) drawText(opts.subText, cx, cy + 50, w - pad*3, 13, C.muted, "400", "center");
    // 하단 브랜드
    ctx.fillStyle = C.muted;
    ctx.font = "500 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PHOTO CLINIC", cx, h - 28);
  }

  else if (opts.template === "frame") {
    const fp = 16;
    drawBg();
    drawPhoto(fp, fp, w - fp*2, h - fp*2);
    // 프레임 테두리
    ctx.strokeStyle = opts.accentColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(fp/2, fp/2, w - fp, h - fp);
    // 텍스트 박스
    if (opts.mainText) {
      const bh = 64;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(fp, h - fp - bh, w - fp*2, bh);
      drawText(opts.mainText, fp + 14, h - fp - bh + 22, w - fp*2 - 28, 16, "#1C2B28", "700");
    }
  }

  else if (opts.template === "split-v") {
    drawBg();
    const barW = 6;
    ctx.fillStyle = opts.accentColor;
    ctx.fillRect(pad, pad, barW, h - pad*2);
    drawText(opts.mainText, pad + barW + 18, pad + 40, w - pad*2 - barW - 18, 22, "#1C2B28", "900");
    if (opts.subText) drawText(opts.subText, pad + barW + 18, pad + 100, w - pad*2 - barW - 18, 13, C.muted, "400");
    // 하단 사진 (있으면)
    if (opts.photo) drawPhoto(pad + barW + 18, h - 200, w - pad*2 - barW - 18, 180);
  }
}

// ── 복사 버튼 ─────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: copied ? C.light : C.white, color: copied ? C.teal : C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "복사됨" : "복사"}
    </button>
  );
}

// ── 메인 ─────────────────────────────────────────────────
export default function InstaDesignPage() {
  const [ratio,    setRatio]    = useState<Ratio>("4:5");
  const [template, setTemplate] = useState<Template>("photo-bottom");
  const [photo,    setPhoto]    = useState<string | null>(null);
  const [mainText, setMainText] = useState("");
  const [subText,  setSubText]  = useState("");
  const [accent,   setAccent]   = useState(C.orange);
  const [bgColor,  setBgColor]  = useState(C.cream);

  // AI 캡션
  const [contentType, setContentType] = useState("portfolio");
  const [dept,        setDept]        = useState("");
  const [tone,        setTone]        = useState("따뜻·감성");
  const [captions,    setCaptions]    = useState<CaptionItem[]>([]);
  const [hashtags,    setHashtags]    = useState("");
  const [selIdx,      setSelIdx]      = useState(0);
  const [generating,  setGenerating]  = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  // 캔버스 렌더
  const render = useCallback(() => {
    if (!canvasRef.current) return;
    renderCanvas(canvasRef.current, { template, ratio, photo, mainText, subText, accentColor: accent, bgColor });
  }, [template, ratio, photo, mainText, subText, accent, bgColor]);

  useEffect(() => { render(); }, [render]);

  // 사진 업로드
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setPhoto(ev.target?.result as string); };
    reader.readAsDataURL(file);
  };

  // AI 캡션 생성
  const generateCaption = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType, dept, tone, customNote: "" }),
      });
      const data = await res.json();
      if (data.captions?.length) {
        setCaptions(data.captions);
        setHashtags(data.hashtags || "");
        setSelIdx(0);
        setMainText(data.captions[0].text.split("\n")[0]);
        setSubText(data.captions[0].text.split("\n").slice(1).join("\n").trim());
      }
    } catch {}
    finally { setGenerating(false); }
  };

  // 다운로드
  const download = () => {
    if (!canvasRef.current) return;
    const a = document.createElement("a");
    a.href = canvasRef.current.toDataURL("image/jpeg", 0.92);
    a.download = `photoclinic_insta_${Date.now()}.jpg`;
    a.click();
  };

  const currentRatio = RATIOS.find(r => r.key === ratio)!;
  const scale = Math.min(1, 340 / currentRatio.w);

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <PageHeader title="인스타그램 디자이너" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 80px", display: "grid", gridTemplateColumns: "1fr 360px", gap: 24 }}>

        {/* ── 왼쪽: 설정 패널 ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* STEP 1: 사진 업로드 */}
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.02)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.teal, color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>1</div>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>사진 업로드</span>
            </div>
            <div style={{ padding: 16 }}>
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
              {photo ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <img src={photo} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}` }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#374141", marginBottom: 4 }}>사진 등록됨 ✅</div>
                    <button onClick={() => fileRef.current?.click()} style={{ fontSize: 11, color: C.orange, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>다른 사진 선택</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} style={{
                  width: "100%", height: 90, borderRadius: 10, border: `2px dashed ${C.border}`,
                  background: C.bg, cursor: "pointer", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit",
                }}>
                  <Upload size={20} color={C.muted} />
                  <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>클릭하여 사진 업로드</span>
                </button>
              )}
            </div>
          </div>

          {/* STEP 2: 비율 + 템플릿 */}
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.02)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.teal, color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>2</div>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>비율 · 레이아웃</span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              {/* 비율 */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8 }}>비율</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {RATIOS.map(r => (
                    <button key={r.key} onClick={() => setRatio(r.key as Ratio)} style={{
                      flex: 1, height: 36, borderRadius: 8, fontFamily: "inherit", cursor: "pointer",
                      border: `1.5px solid ${ratio === r.key ? C.teal : C.border}`,
                      background: ratio === r.key ? C.light : C.white,
                      color: ratio === r.key ? C.teal : C.muted,
                      fontSize: 12, fontWeight: ratio === r.key ? 900 : 400,
                    }}>{r.label}</button>
                  ))}
                </div>
              </div>
              {/* 템플릿 */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8 }}>레이아웃 템플릿</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {TEMPLATES.map(t => (
                    <button key={t.key} onClick={() => setTemplate(t.key as Template)} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", borderRadius: 9, fontFamily: "inherit", cursor: "pointer",
                      border: `1.5px solid ${template === t.key ? C.teal : C.border}`,
                      background: template === t.key ? C.light : C.white,
                      textAlign: "left",
                    }}>
                      <span style={{ fontSize: 13, fontWeight: template === t.key ? 900 : 600, color: template === t.key ? C.teal : "#374141" }}>{t.name}</span>
                      <span style={{ fontSize: 11, color: C.muted }}>{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* 색상 */}
              <div style={{ display: "flex", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>포인트 컬러</div>
                  <input type="color" value={accent} onChange={e => setAccent(e.target.value)}
                    style={{ width: 44, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, cursor: "pointer", padding: 2 }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>배경 컬러</div>
                  <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                    style={{ width: 44, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, cursor: "pointer", padding: 2 }} />
                </div>
              </div>
            </div>
          </div>

          {/* STEP 3: 텍스트 */}
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.02)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.teal, color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>3</div>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>텍스트 입력</span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 5 }}>메인 텍스트</div>
                <textarea value={mainText} onChange={e => setMainText(e.target.value)} rows={2}
                  placeholder="사진 위에 표시될 주요 문구"
                  style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 5 }}>서브 텍스트 (선택)</div>
                <textarea value={subText} onChange={e => setSubText(e.target.value)} rows={2}
                  placeholder="추가 설명 문구"
                  style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>
            </div>
          </div>

          {/* STEP 4: AI 캡션 */}
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.02)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.orange, color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>4</div>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>AI 캡션 · 해시태그 생성</span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {/* 콘텐츠 유형 */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 7 }}>콘텐츠 유형</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {CONTENT_TYPES.map(ct => (
                    <button key={ct.key} onClick={() => setContentType(ct.key)} style={{
                      padding: "6px 12px", borderRadius: 99, fontFamily: "inherit", cursor: "pointer",
                      border: `1.5px solid ${contentType === ct.key ? C.teal : C.border}`,
                      background: contentType === ct.key ? C.light : C.white,
                      color: contentType === ct.key ? C.teal : C.muted,
                      fontSize: 12, fontWeight: contentType === ct.key ? 800 : 400,
                    }}>{ct.emoji} {ct.label}</button>
                  ))}
                </div>
              </div>
              {/* 진료과 + 톤 */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 5 }}>진료과</div>
                  <select value={dept} onChange={e => setDept(e.target.value)}
                    style={{ width: "100%", height: 38, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 10px", fontSize: 13, fontFamily: "inherit", outline: "none", background: C.white, boxSizing: "border-box" }}>
                    <option value="">전체/미지정</option>
                    {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 5 }}>분위기</div>
                  <select value={tone} onChange={e => setTone(e.target.value)}
                    style={{ width: "100%", height: 38, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 10px", fontSize: 13, fontFamily: "inherit", outline: "none", background: C.white, boxSizing: "border-box" }}>
                    {TONES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {/* 생성 버튼 */}
              <button onClick={generateCaption} disabled={generating} style={{
                width: "100%", height: 46, borderRadius: 10, border: "none",
                background: generating ? "#E5E7EB" : `linear-gradient(135deg, ${C.orange}, #EB8F22)`,
                color: generating ? "#9CA3AF" : "#fff",
                fontSize: 14, fontWeight: 900, cursor: generating ? "not-allowed" : "pointer",
                fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: generating ? "none" : "0 4px 14px rgba(232,93,44,.3)",
              }}>
                {generating
                  ? <><div style={{ width: 16, height: 16, border: "2px solid #9CA3AF", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} /> 생성 중...</>
                  : <><Sparkles size={16} /> AI 캡션 · 해시태그 생성</>
                }
              </button>

              {/* 캡션 결과 */}
              {captions.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {captions.map((c, i) => (
                    <div key={i} onClick={() => {
                        setSelIdx(i);
                        setMainText(c.text.split("\n")[0]);
                        setSubText(c.text.split("\n").slice(1).join("\n").trim());
                      }}
                      style={{
                        padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                        border: `2px solid ${selIdx === i ? C.teal : C.border}`,
                        background: selIdx === i ? C.light : C.white,
                      }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: selIdx === i ? C.teal : C.muted }}>
                          {selIdx === i ? "✅ " : ""}{c.type}
                        </span>
                        <CopyBtn text={c.text} />
                      </div>
                      <p style={{ fontSize: 12, color: "#374141", lineHeight: 1.7, margin: 0, whiteSpace: "pre-line" }}>
                        {c.text.slice(0, 120)}{c.text.length > 120 ? "..." : ""}
                      </p>
                    </div>
                  ))}
                  {hashtags && (
                    <div style={{ padding: "10px 14px", background: "#F8F9FA", borderRadius: 10, border: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>해시태그</span>
                        <CopyBtn text={hashtags} />
                      </div>
                      <p style={{ fontSize: 11, color: C.teal, lineHeight: 1.7, margin: 0 }}>{hashtags}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 오른쪽: 미리보기 ── */}
        <div style={{ position: "sticky", top: 80, alignSelf: "flex-start" }}>
          <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 14 }}>미리보기</div>
            {/* 캔버스 */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "#E8E8E8", borderRadius: 10, padding: 12, marginBottom: 14,
            }}>
              <canvas ref={canvasRef}
                style={{
                  width: currentRatio.w * scale,
                  height: currentRatio.h * scale,
                  borderRadius: 6, display: "block", boxShadow: "0 4px 16px rgba(0,0,0,.15)",
                }}
              />
            </div>
            {/* 다운로드 */}
            <button onClick={download} style={{
              width: "100%", height: 46, borderRadius: 10, border: "none",
              background: `linear-gradient(135deg, ${C.teal}, #1e7870)`,
              color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer",
              fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 14px rgba(21,88,85,.25)",
            }}>
              <Download size={16} /> JPG 다운로드
            </button>
            <div style={{ fontSize: 11, color: C.muted, textAlign: "center", marginTop: 8 }}>
              고해상도 {currentRatio.w} × {currentRatio.h}px
            </div>
          </div>

          {/* 빠른 팁 */}
          <div style={{ marginTop: 14, background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: C.teal, marginBottom: 8 }}>💡 사용 팁</div>
            {[
              "사진을 먼저 올리면 레이아웃이 바로 적용돼요",
              "AI 캡션 클릭하면 텍스트가 자동 입력돼요",
              "포인트 컬러로 병원 브랜드 컬러 설정하세요",
            ].map((tip, i) => (
              <div key={i} style={{ fontSize: 11, color: C.muted, padding: "4px 0", borderBottom: i < 2 ? `1px solid ${C.border}` : "none" }}>
                · {tip}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
