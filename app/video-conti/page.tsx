"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";

/* ─── types ──────────────────────────────────────────────── */
interface BgmSection {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  energyLevel: "low" | "mid" | "high";
  rmsEnergy: number;
  suggestedTheme?: string;
  instrumentation?: string;
}

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
  bgmSectionIndex: number;
  startSec: number;
  endSec: number;
  cuts: Cut[];
}

interface Client { id: string; name: string; website_url?: string; }

/* ─── colors ─────────────────────────────────────────────── */
const C = {
  teal: "#155855", orange: "#E85D2C", green: "#22876A",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2",
};

const energyColor = (level: string) => {
  if (level === "high") return C.teal;
  if (level === "mid") return C.green;
  return C.hint;
};

/* ─── small helpers ──────────────────────────────────────── */
function Msg({ msg }: { msg: { text: string; ok: boolean } | null }) {
  if (!msg) return null;
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12,
      background: msg.ok ? "#f0fdf4" : "#fff5f5",
      color: msg.ok ? C.green : C.orange,
      border: `1px solid ${msg.ok ? "#86efac" : "#fca5a5"}`,
    }}>{msg.text}</div>
  );
}

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 12, fontWeight: 800,
      background: done ? C.green : active ? C.teal : C.light,
      color: done || active ? C.white : C.hint,
      border: `2px solid ${done ? C.green : active ? C.teal : C.border}`,
      flexShrink: 0,
    }}>{done ? "✓" : n}</div>
  );
}

function StepHeader({ step }: { step: number }) {
  const labels = ["홈페이지 분석", "BGM 업로드", "콘티 자동 생성", "편집 & 완료"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
      {labels.map((l, i) => (
        <React.Fragment key={i}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <StepBadge n={i + 1} active={step === i + 1} done={step > i + 1} />
            <span style={{ fontSize: 13, fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? C.teal : C.muted }}>{l}</span>
          </div>
          {i < labels.length - 1 && <div style={{ flex: 1, height: 1, minWidth: 16, background: C.border }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.white, borderRadius: 12, border: `1px solid ${C.border}`,
      padding: "20px 24px", boxShadow: "0 1px 6px rgba(21,88,85,.04)",
      ...style,
    }}>{children}</div>
  );
}

function Btn({
  onClick, disabled, loading, children, variant = "primary", style,
}: {
  onClick?: () => void; disabled?: boolean; loading?: boolean;
  children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger";
  style?: React.CSSProperties;
}) {
  const bg = variant === "primary" ? C.teal : variant === "danger" ? C.orange : variant === "ghost" ? "transparent" : C.light;
  const col = variant === "primary" || variant === "danger" ? C.white : C.teal;
  const bdr = variant === "secondary" ? `1px solid ${C.border}` : variant === "ghost" ? `1px solid ${C.border}` : "none";
  return (
    <button
      onClick={onClick} disabled={disabled || loading}
      style={{
        padding: "8px 16px", borderRadius: 8, border: bdr,
        background: bg, color: col, fontSize: 13, fontWeight: 700, cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled || loading ? 0.6 : 1, transition: "opacity .15s", ...style,
      }}
    >{loading ? "처리 중…" : children}</button>
  );
}

/* ─── Step 1: Brand Analysis ─────────────────────────────── */
function Step1({
  onSaved,
}: {
  onSaved: (id: string, ba: any) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ba, setBa] = useState<any>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/clients").then(r => r.json()).then(d => {
      if (d.ok) setClients((d.clients ?? []).map((c: any) => ({ id: c.id, name: c.hospital_name, website_url: c.website_url ?? "" })));
    });
  }, []);

  const handleClientChange = (id: string) => {
    setClientId(id);
    const c = clients.find(x => x.id === id);
    if (c?.website_url) setUrl(c.website_url);
  };

  const analyze = async () => {
    if (!url) { setMsg({ text: "URL을 입력해주세요", ok: false }); return; }
    setAnalyzing(true); setMsg(null);
    try {
      const r = await fetch("/api/brand-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, purpose: "brand_film" }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "분석 실패");
      setBa(d);
      setMsg({ text: `분석 완료: ${d.brandName}`, ok: true });
    } catch (e: any) {
      setMsg({ text: e.message, ok: false });
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (!ba) return;
    setSaving(true);
    try {
      const client = clients.find(x => x.id === clientId);
      const r = await fetch("/api/video-conti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId || null,
          title: `${ba.brandName ?? "브랜드"} 영상콘티`,
          hospitalName: client?.name ?? ba.brandName ?? "",
          sourceUrl: url,
          brandAnalysis: ba,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "저장 실패");
      onSaved(d.id, ba);
    } catch (e: any) {
      setMsg({ text: e.message, ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Msg msg={msg} />
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.teal, marginBottom: 12 }}>클라이언트 선택 (선택)</div>
        <select
          value={clientId} onChange={e => handleClientChange(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, marginBottom: 12 }}
        >
          <option value="">-- 클라이언트 선택 --</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.teal, marginBottom: 8 }}>홈페이지 URL</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://hospital.co.kr"
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}
          />
          <Btn onClick={analyze} loading={analyzing}>분석하기</Btn>
        </div>
      </Card>

      {ba && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.teal, marginBottom: 4 }}>{ba.brandName}</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>{ba.oneLiner}</div>

          {ba.keywordGroups && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.hint, marginBottom: 6 }}>키워드 그룹</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ba.keywordGroups.flatMap((g: any) => g.keywords ?? []).map((kw: string, i: number) => (
                  <span key={i} style={{ fontSize: 11, background: C.light, color: C.teal, padding: "2px 8px", borderRadius: 20 }}>{kw}</span>
                ))}
              </div>
            </div>
          )}

          {ba.brandFilmLines && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.hint, marginBottom: 6 }}>브랜드필름 자막 라인</div>
              {ba.brandFilmLines.map((l: any, i: number) => (
                <div key={i} style={{ fontSize: 13, padding: "6px 10px", borderRadius: 6, background: C.light, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: C.teal, marginRight: 8 }}>[{l.usage}]</span>
                  <span style={{ color: C.txt }}>{l.line}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <Btn onClick={save} loading={saving}>저장하고 다음 →</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─── Step 2: BGM Upload ─────────────────────────────────── */
function Step2({
  videoContiId,
  onDone,
}: {
  videoContiId: string;
  onDone: (sections: BgmSection[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sections, setSections] = useState<BgmSection[] | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const upload = async () => {
    if (!file) { setMsg({ text: "파일을 선택해주세요", ok: false }); return; }
    setUploading(true); setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("videoContiId", videoContiId);
      const r = await fetch("/api/video-conti/bgm-upload", { method: "POST", body: form });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "업로드 실패");
      setSections(d.sections ?? []);
      setMsg({ text: d.note ?? `BGM 분석 완료 (${d.sections?.length ?? 0}개 구간)`, ok: true });
    } catch (e: any) {
      setMsg({ text: e.message, ok: false });
    } finally {
      setUploading(false);
    }
  };

  const totalDuration = sections?.length ? sections[sections.length - 1].endSec : 0;

  return (
    <div>
      <Msg msg={msg} />
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.teal, marginBottom: 8 }}>BGM 파일 업로드</div>
        <div style={{ fontSize: 12, color: C.hint, marginBottom: 12 }}>WAV 파일 권장 (상세 분석), MP3도 허용</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input ref={fileRef} type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ flex: 1 }} />
          <Btn onClick={upload} loading={uploading} disabled={!file}>업로드 & 분석</Btn>
        </div>
        {file && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</div>}
      </Card>

      {sections && sections.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.teal, marginBottom: 12 }}>BGM 구간 분석 결과</div>

          {/* Timeline bar */}
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 36, marginBottom: 12 }}>
            {sections.map(s => (
              <div
                key={s.index}
                style={{
                  flex: s.durationSec || (s.endSec - s.startSec),
                  background: energyColor(s.energyLevel),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: C.white,
                  overflow: "hidden", cursor: "default",
                  borderRight: "2px solid rgba(255,255,255,.3)",
                }}
                title={`${s.suggestedTheme ?? ""} (${s.startSec}s~${s.endSec}s)`}
              >
                {s.index + 1}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sections.map(s => (
              <div key={s.index} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, background: C.light }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: energyColor(s.energyLevel), display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{s.index + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.txt }}>{s.suggestedTheme ?? `구간 ${s.index + 1}`}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{s.startSec}s ~ {s.endSec}s · 에너지: <span style={{ color: energyColor(s.energyLevel), fontWeight: 700 }}>{s.energyLevel}</span></div>
                  {s.instrumentation && <div style={{ fontSize: 11, color: C.hint, marginTop: 2 }}>악기: {s.instrumentation}</div>}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <Btn onClick={() => onDone(sections)}>다음 →</Btn>
          </div>
        </Card>
      )}

      {sections && sections.length === 0 && (
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <Btn onClick={() => onDone([])}>다음 →</Btn>
        </div>
      )}
    </div>
  );
}

/* ─── Step 3: Generate Scenes ────────────────────────────── */
function Step3({
  videoContiId,
  ba,
  bgmSections,
  onDone,
}: {
  videoContiId: string;
  ba: any;
  bgmSections: BgmSection[] | null;
  onDone: (scenes: Scene[]) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const generate = async () => {
    setGenerating(true); setMsg(null);
    try {
      const r = await fetch("/api/video-conti/generate-scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: videoContiId }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "생성 실패");
      setScenes(d.scenes);
      setMsg({ text: `${d.scenes.length}개 씬 생성 완료`, ok: true });
    } catch (e: any) {
      setMsg({ text: e.message, ok: false });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <Msg msg={msg} />

      {/* Summary */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.teal, marginBottom: 10 }}>분석 요약</div>
        <div style={{ fontSize: 13, color: C.txt, marginBottom: 6 }}><b>브랜드:</b> {ba?.brandName ?? "-"}</div>
        <div style={{ fontSize: 13, color: C.txt, marginBottom: 6 }}><b>촬영 방향:</b> {ba?.shootingDirection ?? "-"}</div>
        <div style={{ fontSize: 13, color: C.txt }}><b>BGM 구간:</b> {bgmSections?.length ?? 0}개</div>
      </Card>

      {!scenes && (
        <Card style={{ textAlign: "center", padding: "32px 24px" }}>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>브랜드 분석과 BGM 구간 정보를 바탕으로<br />AI가 씬별 콘티를 자동 생성합니다</div>
          <Btn onClick={generate} loading={generating}>AI 콘티 생성</Btn>
        </Card>
      )}

      {generating && (
        <Card style={{ textAlign: "center", padding: "24px" }}>
          <div style={{ fontSize: 13, color: C.muted }}>씬 콘티를 생성하는 중… (약 20-30초 소요)</div>
        </Card>
      )}

      {scenes && (
        <div>
          {scenes.map(scene => (
            <Card key={scene.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.teal, marginBottom: 8 }}>씬 {scene.order}: {scene.title}</div>
              <div style={{ fontSize: 12, color: C.hint, marginBottom: 8 }}>{scene.startSec}s ~ {scene.endSec}s</div>
              {scene.cuts.map(cut => (
                <div key={cut.id} style={{ padding: "8px 10px", borderRadius: 6, background: C.light, marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 4 }}>컷 {cut.order} · {cut.timecodeStart} ~ {cut.timecodeEnd}</div>
                  <div style={{ fontSize: 12, color: C.txt }}>{cut.visualNote}</div>
                  {cut.subtitleCopy && <div style={{ fontSize: 12, color: C.teal, marginTop: 2 }}>자막: {cut.subtitleCopy}</div>}
                </div>
              ))}
            </Card>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <Btn onClick={() => onDone(scenes)}>편집하기 →</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Step 4: Editor ─────────────────────────────────────── */
function Step4({
  videoContiId,
  initialScenes,
  onBack,
}: {
  videoContiId: string;
  initialScenes: Scene[];
  onBack: () => void;
}) {
  const [scenes, setScenes] = useState<Scene[]>(initialScenes);
  const [selectedScene, setSelectedScene] = useState<string>(initialScenes[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const currentScene = scenes.find(s => s.id === selectedScene);

  const updateCut = (sceneId: string, cutId: string, field: keyof Cut, value: string) => {
    setScenes(prev => prev.map(s =>
      s.id !== sceneId ? s : {
        ...s,
        cuts: s.cuts.map(c => c.id !== cutId ? c : { ...c, [field]: value }),
      }
    ));
  };

  const addCut = (sceneId: string) => {
    setScenes(prev => prev.map(s =>
      s.id !== sceneId ? s : {
        ...s,
        cuts: [...s.cuts, {
          id: `cut-${Date.now()}`, order: s.cuts.length + 1,
          timecodeStart: "", timecodeEnd: "", visualNote: "", subtitleCopy: "", narrationCopy: "",
        }],
      }
    ));
  };

  const removeCut = (sceneId: string, cutId: string) => {
    setScenes(prev => prev.map(s =>
      s.id !== sceneId ? s : { ...s, cuts: s.cuts.filter(c => c.id !== cutId) }
    ));
  };

  const addScene = () => {
    const newScene: Scene = {
      id: `scene-${Date.now()}`, order: scenes.length + 1,
      title: `씬 ${scenes.length + 1}`, bgmSectionIndex: scenes.length,
      startSec: 0, endSec: 0, cuts: [],
    };
    setScenes(prev => [...prev, newScene]);
    setSelectedScene(newScene.id);
  };

  const removeScene = (id: string) => {
    setScenes(prev => prev.filter(s => s.id !== id));
    setSelectedScene(scenes.find(s => s.id !== id)?.id ?? "");
  };

  const moveScene = (id: string, dir: -1 | 1) => {
    setScenes(prev => {
      const idx = prev.findIndex(s => s.id === id);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr.map((s, i) => ({ ...s, order: i + 1 }));
    });
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch(`/api/video-conti/${videoContiId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "저장 실패");
      setMsg({ text: "저장 완료", ok: true });
    } catch (e: any) {
      setMsg({ text: e.message, ok: false });
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    setFinalizing(true); setMsg(null);
    try {
      const r = await fetch(`/api/video-conti/${videoContiId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes, status: "final" }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "완료 처리 실패");
      setMsg({ text: "최종 완료로 상태 변경되었습니다", ok: true });
    } catch (e: any) {
      setMsg({ text: e.message, ok: false });
    } finally {
      setFinalizing(false);
    }
  };

  const createShare = async () => {
    try {
      const r = await fetch("/api/video-conti/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoContiId }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "공유 링크 생성 실패");
      setShareUrl(window.location.origin + d.url);
      setMsg({ text: "공유 링크가 생성되었습니다", ok: true });
    } catch (e: any) {
      setMsg({ text: e.message, ok: false });
    }
  };

  // Total duration for timeline preview
  const totalDuration = Math.max(...scenes.map(s => s.endSec || 0), 1);

  return (
    <div>
      <Msg msg={msg} />

      {/* Share URL */}
      {shareUrl && (
        <Card style={{ marginBottom: 12, background: C.light }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.teal, marginBottom: 4 }}>공유 링크</div>
          <input readOnly value={shareUrl} onClick={e => (e.target as HTMLInputElement).select()}
            style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12 }} />
        </Card>
      )}

      {/* Main editor layout */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* Sidebar: scenes list */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <Card style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.hint, marginBottom: 8 }}>씬 목록</div>
            {scenes.map((s, i) => (
              <div
                key={s.id}
                style={{
                  padding: "8px 10px", borderRadius: 7, marginBottom: 4, cursor: "pointer",
                  background: selectedScene === s.id ? C.teal : "transparent",
                  color: selectedScene === s.id ? C.white : C.txt,
                  border: `1px solid ${selectedScene === s.id ? C.teal : C.border}`,
                }}
                onClick={() => setSelectedScene(s.id)}
              >
                <div style={{ fontSize: 12, fontWeight: 700 }}>씬 {s.order}</div>
                <div style={{ fontSize: 11, opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <button onClick={e => { e.stopPropagation(); moveScene(s.id, -1); }} disabled={i === 0}
                    style={{ fontSize: 10, padding: "1px 4px", borderRadius: 4, border: "none", background: "rgba(255,255,255,.2)", cursor: "pointer", color: "inherit" }}>↑</button>
                  <button onClick={e => { e.stopPropagation(); moveScene(s.id, 1); }} disabled={i === scenes.length - 1}
                    style={{ fontSize: 10, padding: "1px 4px", borderRadius: 4, border: "none", background: "rgba(255,255,255,.2)", cursor: "pointer", color: "inherit" }}>↓</button>
                  <button onClick={e => { e.stopPropagation(); removeScene(s.id); }}
                    style={{ fontSize: 10, padding: "1px 4px", borderRadius: 4, border: "none", background: "rgba(255,0,0,.15)", cursor: "pointer", color: C.orange }}>✕</button>
                </div>
              </div>
            ))}
            <Btn onClick={addScene} variant="secondary" style={{ width: "100%", marginTop: 6, fontSize: 12 }}>+ 씬 추가</Btn>
          </Card>
        </div>

        {/* Right: cuts editor */}
        <div style={{ flex: 1 }}>
          {currentScene ? (
            <Card>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
                <input
                  value={currentScene.title}
                  onChange={e => setScenes(prev => prev.map(s => s.id !== currentScene.id ? s : { ...s, title: e.target.value }))}
                  style={{ flex: 1, fontSize: 15, fontWeight: 700, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border}` }}
                />
                <div style={{ fontSize: 12, color: C.hint }}>{currentScene.startSec}s ~ {currentScene.endSec}s</div>
              </div>

              {currentScene.cuts.map((cut, ci) => (
                <div key={cut.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px", marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.teal }}>컷 {cut.order}</div>
                    <button onClick={() => removeCut(currentScene.id, cut.id)} style={{ fontSize: 11, color: C.orange, background: "none", border: "none", cursor: "pointer" }}>삭제</button>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    {(["timecodeStart", "timecodeEnd"] as const).map(f => (
                      <input key={f} value={cut[f]} onChange={e => updateCut(currentScene.id, cut.id, f, e.target.value)}
                        placeholder={f === "timecodeStart" ? "시작 (MM:SS)" : "종료 (MM:SS)"}
                        style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12 }} />
                    ))}
                  </div>
                  {(["visualNote", "subtitleCopy", "narrationCopy"] as const).map(f => (
                    <div key={f} style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: C.hint, marginBottom: 2 }}>
                        {f === "visualNote" ? "비주얼 노트" : f === "subtitleCopy" ? "자막" : "나레이션"}
                      </div>
                      <textarea value={cut[f]} onChange={e => updateCut(currentScene.id, cut.id, f, e.target.value)} rows={2}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, resize: "vertical", boxSizing: "border-box" }} />
                    </div>
                  ))}
                </div>
              ))}

              <Btn onClick={() => addCut(currentScene.id)} variant="secondary" style={{ fontSize: 12 }}>+ 컷 추가</Btn>
            </Card>
          ) : (
            <Card style={{ textAlign: "center", padding: "32px" }}>
              <div style={{ color: C.hint }}>왼쪽에서 씬을 선택하세요</div>
            </Card>
          )}
        </div>
      </div>

      {/* Timeline preview */}
      {scenes.some(s => s.endSec > 0) && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.hint, marginBottom: 8 }}>타임라인 미리보기</div>
          <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden" }}>
            {scenes.map((s, i) => {
              const dur = (s.endSec - s.startSec) || 10;
              return (
                <div key={s.id} style={{
                  flex: dur, background: i % 2 === 0 ? C.teal : C.green,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: C.white, overflow: "hidden",
                  borderRight: "2px solid rgba(255,255,255,.4)",
                  cursor: "pointer",
                }} onClick={() => setSelectedScene(s.id)} title={s.title}>
                  {s.order}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Bottom toolbar */}
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <Btn onClick={onBack} variant="ghost">← 뒤로</Btn>
        <div style={{ flex: 1 }} />
        <Btn onClick={save} loading={saving} variant="secondary">저장</Btn>
        <Btn onClick={finalize} loading={finalizing}>최종완료</Btn>
        <Btn onClick={createShare} variant="secondary">공유 링크 생성</Btn>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────── */
function VideoContiInner() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [videoContiId, setVideoContiId] = useState<string | null>(null);
  const [brandAnalysis, setBrandAnalysis] = useState<any>(null);
  const [bgmSections, setBgmSections] = useState<BgmSection[] | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);

  // Load existing record if ?id= param present
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) return;
    fetch(`/api/video-conti/${id}`).then(r => r.json()).then(d => {
      if (!d.ok) return;
      const row = d.data;
      setVideoContiId(row.id);
      if (row.brand_analysis) setBrandAnalysis(row.brand_analysis);
      if (row.bgm_sections) setBgmSections(row.bgm_sections);
      if (row.scenes?.length) { setScenes(row.scenes); setStep(4); }
      else if (row.bgm_sections?.length) setStep(3);
      else if (row.brand_analysis) setStep(2);
    });
  }, [searchParams]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fbfa" }}>
      <PageHeader title="영상 콘티 생성" backHref="/" backLabel="관리자 홈" />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        <StepHeader step={step} />

        {step === 1 && (
          <Step1
            onSaved={(id, ba) => {
              setVideoContiId(id);
              setBrandAnalysis(ba);
              setStep(2);
            }}
          />
        )}

        {step === 2 && videoContiId && (
          <Step2
            videoContiId={videoContiId}
            onDone={(secs) => {
              setBgmSections(secs);
              setStep(3);
            }}
          />
        )}

        {step === 3 && videoContiId && (
          <Step3
            videoContiId={videoContiId}
            ba={brandAnalysis}
            bgmSections={bgmSections}
            onDone={(s) => {
              setScenes(s);
              setStep(4);
            }}
          />
        )}

        {step === 4 && videoContiId && (
          <Step4
            videoContiId={videoContiId}
            initialScenes={scenes}
            onBack={() => setStep(3)}
          />
        )}
      </div>
    </div>
  );
}

export default function VideoContiPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#9BB5B0" }}>로딩 중...</div>}>
      <VideoContiInner />
    </Suspense>
  );
}
