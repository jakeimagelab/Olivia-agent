"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";
import { DEPARTMENT_DISPLAY } from "@/lib/photo-classifier/types";
import type { VideoClipFile, VideoScene, VideoStats } from "@/lib/video-classifier/types";

/* ════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
const VIDEO_EXTS = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv"]);
const GAP_OPTIONS = [3, 5, 7, 10];
const STEPS = ["설정", "파일 스캔", "그룹 검토", "AI 분석", "최종 검토", "폴더 정리", "완료"];

const DEPARTMENTS = Object.entries(DEPARTMENT_DISPLAY) as [MedicalDepartment, string][];

const C = {
  teal: "#155855", orange: "#E85D2C", green: "#22876A", red: "#DC2626",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2", bg: "#EDF5F3",
};

/* ════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
async function copyFileHandle(src: FileSystemFileHandle, dest: FileSystemDirectoryHandle, name: string) {
  const file = await src.getFile();
  const buf = await file.arrayBuffer();
  const fh = await (dest as any).getFileHandle(name, { create: true });
  const wr = await fh.createWritable();
  await wr.write(buf);
  await wr.close();
}

function waitForEvent(el: HTMLVideoElement, event: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; el.removeEventListener(event, handler); resolve(false); }
    }, timeoutMs);
    const handler = () => {
      if (!done) { done = true; clearTimeout(timer); el.removeEventListener(event, handler); resolve(true); }
    };
    el.addEventListener(event, handler);
  });
}

function frameFractionsForCount(n: number): number[] {
  if (n <= 1) return [0.5];
  if (n === 2) return [0.15, 0.85];
  const step = 1 / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.min(0.92, Math.max(0.08, i * step)));
}

// 영상에서 대표 프레임(시작/중간/끝 등)을 캔버스로 캡처. seek 실패 시 1회 재시도 후 해당 프레임만 스킵.
async function extractVideoFrames(file: File, fractions: number[]): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.style.position = "fixed";
  video.style.left = "-9999px";
  document.body.appendChild(video);

  const frames: string[] = [];
  try {
    video.src = url;
    const loaded = await waitForEvent(video, "loadedmetadata", 8000);
    if (!loaded || !isFinite(video.duration) || video.duration <= 0) return frames;

    const canvas = document.createElement("canvas");
    const scale = Math.min(480 / (video.videoWidth || 480), 480 / (video.videoHeight || 270), 1);
    canvas.width = Math.max(1, Math.round((video.videoWidth || 480) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || 270) * scale));
    const ctx = canvas.getContext("2d")!;

    for (const frac of fractions) {
      const target = Math.min(Math.max(frac * video.duration, 0), Math.max(video.duration - 0.05, 0));
      let captured = false;
      for (let attempt = 0; attempt < 2 && !captured; attempt++) {
        video.currentTime = target;
        const seeked = await waitForEvent(video, "seeked", 3000);
        if (!seeked) continue;
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL("image/jpeg", 0.6));
          captured = true;
        } catch {}
      }
    }
  } finally {
    document.body.removeChild(video);
    URL.revokeObjectURL(url);
  }
  return frames;
}

function framesPerClip(clipCount: number): number {
  if (clipCount <= 2) return 3;
  if (clipCount === 3) return 2;
  return 1;
}

const MP4_EXTS = new Set(["mp4", "mov", "m4v"]);
const MAC_EPOCH_OFFSET_SEC = 2082844800; // seconds between 1904-01-01 and 1970-01-01

// MP4/MOV(ISO base media) 컨테이너의 moov/mvhd 박스에서 실제 촬영 시각을 읽는다.
// 파일 복사/전송 시각인 lastModified보다 정확한 씬 그룹핑 기준을 제공한다.
async function readVideoCreationTime(file: File): Promise<number | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!MP4_EXTS.has(ext)) return null;

  async function findAtom(start: number, end: number, path: string[]): Promise<number | null> {
    let pos = start;
    while (pos < end - 8) {
      const header = new DataView(await file.slice(pos, pos + 8).arrayBuffer());
      let size = header.getUint32(0);
      const type = String.fromCharCode(header.getUint8(4), header.getUint8(5), header.getUint8(6), header.getUint8(7));
      let headerSize = 8;
      if (size === 1) {
        const ext64 = new DataView(await file.slice(pos + 8, pos + 16).arrayBuffer());
        size = Number(ext64.getBigUint64(0));
        headerSize = 16;
      }
      if (size < headerSize) break;
      if (type === path[0]) {
        if (path.length === 1) return pos;
        const inner = await findAtom(pos + headerSize, pos + size, path.slice(1));
        if (inner !== null) return inner;
      }
      pos += size;
    }
    return null;
  }

  try {
    const mvhdPos = await findAtom(0, file.size, ["moov", "mvhd"]);
    if (mvhdPos === null) return null;
    const head = new DataView(await file.slice(mvhdPos, mvhdPos + 32).arrayBuffer());
    const version = head.getUint8(8);
    const creationTimeSec = version === 1 ? Number(head.getBigUint64(12)) : head.getUint32(12);
    if (!creationTimeSec) return null;
    const unixMs = (creationTimeSec - MAC_EPOCH_OFFSET_SEC) * 1000;
    if (unixMs <= 0 || unixMs > Date.now() + 24 * 3600 * 1000) return null;
    return unixMs;
  } catch {
    return null;
  }
}

/* ════════════════════════════════════════════════
   PRESENTATIONAL HELPERS
═══════════════════════════════════════════════ */
function Btn({ onClick, disabled, children, variant = "primary" }: {
  onClick?: () => void; disabled?: boolean; children: React.ReactNode; variant?: "primary" | "ghost";
}) {
  const primary = variant === "primary";
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "10px 18px", borderRadius: 10, border: primary ? "none" : `1.5px solid ${C.border}`,
      background: disabled ? C.hint : primary ? C.teal : C.white,
      color: primary ? C.white : C.txt, fontWeight: 800, fontSize: 13,
      cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
    }}>
      {children}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
      {children}
    </div>
  );
}

function ProgressBar({ cur, total, msg }: { cur: number; total: number; msg: string }) {
  const pct = total > 0 ? Math.round((cur / total) * 100) : 0;
  return (
    <div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>{msg}</div>
      <div style={{ height: 8, borderRadius: 99, background: C.light, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: C.teal, transition: "width .2s" }} />
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
export default function VideoSortingPage() {
  const [hasFS, setHasFS] = useState(false);
  useEffect(() => { setHasFS("showDirectoryPicker" in window); }, []);

  const [step, setStep] = useState(0);
  const [rootDir, setRootDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [department, setDepartment] = useState<MedicalDepartment>("dermatology");
  const [gapMinutes, setGapMinutes] = useState(5);
  const [scannedEntries, setScannedEntries] = useState<{ name: string; handle: FileSystemFileHandle; mtime: number }[]>([]);
  const [scenes, setScenes] = useState<VideoScene[]>([]);
  const [failedClips, setFailedClips] = useState<{ name: string; handle: FileSystemFileHandle; reason: string }[]>([]);
  const [progress, setProgress] = useState({ cur: 0, total: 0, msg: "" });
  const [stats, setStats] = useState<VideoStats | null>(null);

  const pickDir = async () => {
    try {
      const h = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      setRootDir(h);
    } catch {}
  };

  const analyzeOneScene = async (list: VideoScene[], i: number) => {
    const scene = list[i];
    const perClip = framesPerClip(scene.clips.length);
    const collected: { fileName: string; base64: string }[] = [];
    const previewThumbs: string[] = [];

    for (const clip of scene.clips) {
      if (collected.length >= 6) break;
      const want = Math.min(perClip, 6 - collected.length);
      try {
        const file = await clip.handle.getFile();
        const frames = await extractVideoFrames(file, frameFractionsForCount(want));
        frames.forEach((base64, idx) => {
          collected.push({ fileName: `${clip.name}#${idx}`, base64 });
          previewThumbs.push(base64);
        });
      } catch {}
    }

    if (collected.length === 0) {
      list[i] = {
        ...scene,
        sceneType: "etc",
        suggestedName: scene.folderName,
        aiConfidence: 0,
        aiReason: "프레임 추출 실패 — 수동 확인이 필요합니다",
        needsReview: true,
        nameLoading: false,
        previewThumbs: [],
      };
      return;
    }

    try {
      const res = await fetch("/api/video-scene-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department,
          sceneId: scene.folderName,
          frames: collected,
          options: { useHighModel: false },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const num = String(scene.index).padStart(2, "0");
        const suggested = data.suggestedFolderName ? `Scene${num}_${data.suggestedFolderName}` : scene.folderName;
        list[i] = {
          ...scene,
          sceneType: data.sceneType ?? null,
          suggestedName: suggested,
          // editedName은 그대로 두고, 사용자가 "AI 제안명 적용"을 눌러야 폴더명이 바뀐다
          aiConfidence: data.confidence ?? null,
          aiReason: data.reason ?? null,
          needsReview: data.needsReview ?? false,
          nameLoading: false,
          previewThumbs,
        };
      } else {
        list[i] = { ...scene, nameLoading: false, aiReason: data.error ?? "분석 실패", needsReview: true, previewThumbs };
      }
    } catch {
      list[i] = { ...scene, nameLoading: false, aiReason: "네트워크 오류", needsReview: true, previewThumbs };
    }
  };

  const runSceneAnalysis = useCallback(async (list: VideoScene[]) => {
    const updated = list.map((s) => ({ ...s, nameLoading: true }));
    setScenes([...updated]);
    for (let i = 0; i < updated.length; i++) {
      setProgress({ cur: i, total: updated.length, msg: `씬 분석 중: ${updated[i].folderName}` });
      await analyzeOneScene(updated, i);
      setScenes([...updated]);
    }
    setStep(4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department]);

  const groupEntries = (
    entries: { name: string; handle: FileSystemFileHandle; mtime: number }[],
    gapMs: number,
  ): VideoScene[] => {
    const sorted = [...entries].sort((a, b) => a.mtime - b.mtime);
    const groups: typeof sorted[] = sorted.length > 0 ? [[sorted[0]]] : [];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].mtime - sorted[i - 1].mtime > gapMs) groups.push([sorted[i]]);
      else groups[groups.length - 1].push(sorted[i]);
    }

    return groups.map((g, si) => {
      const num = String(si + 1).padStart(2, "0");
      const folderName = `Scene${num}`;
      const clips: VideoClipFile[] = g.map((e) => ({
        name: e.name, basename: e.name.replace(/\.[^.]+$/, ""), handle: e.handle, mtime: e.mtime,
      }));
      return {
        index: si + 1, folderName, editedName: folderName,
        startTime: g[0].mtime, endTime: g[g.length - 1].mtime,
        clips, sceneDir: null,
        sceneType: null, suggestedName: null, aiConfidence: null, aiReason: null,
        needsReview: false, nameLoading: false,
      };
    });
  };

  const handleScan = useCallback(async () => {
    if (!rootDir) return;
    setStep(1);
    const entries: { name: string; handle: FileSystemFileHandle; mtime: number }[] = [];
    const failed: { name: string; handle: FileSystemFileHandle; reason: string }[] = [];
    setProgress({ cur: 0, total: 0, msg: "폴더 스캔 중..." });
    let lastUpdate = Date.now();

    for await (const [name, handle] of (rootDir as any).entries()) {
      if (handle.kind !== "file") continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (!VIDEO_EXTS.has(ext)) continue;
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        const creationTime = await readVideoCreationTime(file);
        entries.push({ name, handle: handle as FileSystemFileHandle, mtime: creationTime ?? file.lastModified });
      } catch {
        failed.push({ name, handle: handle as FileSystemFileHandle, reason: "파일을 읽을 수 없음" });
      }
      if (Date.now() - lastUpdate > 300) {
        setProgress({ cur: 0, total: 0, msg: `스캔: ${name}` });
        lastUpdate = Date.now();
      }
    }

    setScannedEntries(entries);
    setFailedClips(failed);
    setScenes(groupEntries(entries, gapMinutes * 60 * 1000));
    setStep(2);
  }, [rootDir, gapMinutes]);

  const handleRegroup = useCallback(() => {
    setScenes(groupEntries(scannedEntries, gapMinutes * 60 * 1000));
  }, [scannedEntries, gapMinutes]);

  const handleStartAnalysis = useCallback(() => {
    setStep(3);
    runSceneAnalysis(scenes);
  }, [scenes, runSceneAnalysis]);

  const retryScene = useCallback(async (i: number) => {
    const updated = scenes.map((s) => ({ ...s }));
    updated[i] = { ...updated[i], nameLoading: true };
    setScenes([...updated]);
    await analyzeOneScene(updated, i);
    setScenes([...updated]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, department]);

  const retryFailedClip = useCallback(async (name: string) => {
    const entry = failedClips.find((f) => f.name === name);
    if (!entry) return;
    try {
      const file = await entry.handle.getFile();
      const creationTime = await readVideoCreationTime(file);
      const mtime = creationTime ?? file.lastModified;
      const num = String(scenes.length + 1).padStart(2, "0");
      const folderName = `Scene${num}`;
      const newScene: VideoScene = {
        index: scenes.length + 1, folderName, editedName: folderName,
        startTime: mtime, endTime: mtime,
        clips: [{ name: entry.name, basename: entry.name.replace(/\.[^.]+$/, ""), handle: entry.handle, mtime }],
        sceneDir: null, sceneType: null, suggestedName: null, aiConfidence: null, aiReason: null,
        needsReview: false, nameLoading: false,
      };
      setScannedEntries((prev) => [...prev, { name: entry.name, handle: entry.handle, mtime }]);
      setFailedClips((prev) => prev.filter((f) => f.name !== name));
      const updatedScenes = [...scenes, newScene];

      if (step >= 4) {
        // AI 분석이 이미 끝난 시점의 재시도는 즉시 개별 분석
        updatedScenes[updatedScenes.length - 1] = { ...newScene, nameLoading: true };
        setScenes(updatedScenes);
        await analyzeOneScene(updatedScenes, updatedScenes.length - 1);
        setScenes([...updatedScenes]);
      } else {
        // 그룹 검토 단계에서는 목록에만 추가 — "AI 분석 시작" 시 함께 분석됨
        setScenes(updatedScenes);
      }
    } catch {
      setFailedClips((prev) => prev.map((f) => (f.name === name ? { ...f, reason: "재시도 실패" } : f)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failedClips, scenes, department, step]);

  const updateSceneName = (i: number, name: string) => {
    setScenes((prev) => prev.map((s, idx) => (idx === i ? { ...s, editedName: name } : s)));
  };

  const applySuggestedName = (i: number) => {
    setScenes((prev) => prev.map((s, idx) => (idx === i && s.suggestedName ? { ...s, editedName: s.suggestedName } : s)));
  };

  const applyAllSuggestedNames = () => {
    setScenes((prev) => prev.map((s) => (s.suggestedName ? { ...s, editedName: s.suggestedName } : s)));
  };

  const handleExport = useCallback(async () => {
    if (!rootDir) return;
    setStep(5);
    const videoBase = await (rootDir as any).getDirectoryHandle("VIDEO", { create: true }) as FileSystemDirectoryHandle;
    const totalClips = scenes.reduce((s, sc) => s + sc.clips.length, 0);
    let done = 0;
    let moved = 0;
    let lastUpdate = Date.now();
    const updated = scenes.map((s) => ({ ...s }));

    for (let si = 0; si < updated.length; si++) {
      const sc = updated[si];
      const targetName = sc.editedName || sc.folderName;
      const sceneDir = await (videoBase as any).getDirectoryHandle(targetName, { create: true }) as FileSystemDirectoryHandle;
      const newClips: VideoClipFile[] = [];

      for (const clip of sc.clips) {
        if (Date.now() - lastUpdate > 300) {
          setProgress({ cur: done, total: totalClips, msg: `${targetName}: ${clip.name}` });
          lastUpdate = Date.now();
        }
        try {
          await copyFileHandle(clip.handle, sceneDir, clip.name);
          const destHandle = await (sceneDir as any).getFileHandle(clip.name) as FileSystemFileHandle;
          await (rootDir as any).removeEntry(clip.name).catch(() => {});
          newClips.push({ ...clip, handle: destHandle });
          moved++;
        } catch {
          newClips.push(clip);
        }
        done++;
      }
      updated[si] = { ...sc, folderName: targetName, sceneDir, clips: newClips };
    }

    setScenes(updated);
    setStats({
      totalClips, totalScenes: updated.length,
      failedClips: failedClips.length, movedClips: moved,
    });
    setStep(5);
  }, [rootDir, scenes, failedClips]);

  const allAnalyzed = scenes.every((s) => !s.nameLoading);

  /* ════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════ */
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px 80px", fontFamily: "'Noto Sans KR', sans-serif" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
        {STEPS.map((label, i) => (
          <div key={label} style={{
            padding: "6px 12px", borderRadius: 99, fontSize: 12, fontWeight: 800,
            background: i === step ? C.teal : C.light, color: i === step ? C.white : C.muted,
          }}>
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: C.txt, marginBottom: 16 }}>🎥 영상 분류 설정</h2>

          {!hasFS && (
            <div style={{ padding: 14, background: "#FFF3CD", borderRadius: 10, fontSize: 12, color: "#856404", border: "1px solid #FFD980", marginBottom: 16 }}>
              ⚠️ Chrome 또는 Edge 브라우저에서만 파일 시스템 접근이 가능합니다.
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>1. 영상 폴더 선택</div>
            <Btn onClick={pickDir} disabled={!hasFS}>{rootDir ? "✅ 폴더 선택됨 — 다시 선택" : "📁 폴더 선택"}</Btn>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>2. 진료과 선택</div>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as MedicalDepartment)}
              style={{ padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 13, fontWeight: 700, color: C.txt, fontFamily: "inherit" }}
            >
              {DEPARTMENTS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>3. 씬 그룹핑 시간 간격</div>
            <div style={{ display: "flex", gap: 8 }}>
              {GAP_OPTIONS.map((g) => (
                <button key={g} onClick={() => setGapMinutes(g)} style={{
                  flex: 1, padding: "10px 0", borderRadius: 8,
                  border: `1.5px solid ${gapMinutes === g ? C.teal : C.border}`,
                  background: gapMinutes === g ? C.light : C.white,
                  cursor: "pointer", fontSize: 13, fontWeight: gapMinutes === g ? 900 : 600,
                  color: gapMinutes === g ? C.teal : C.muted, fontFamily: "inherit",
                }}>
                  {g}분
                </button>
              ))}
            </div>
          </div>

          <Btn onClick={handleStart} disabled={!rootDir}>시작하기 →</Btn>
        </Card>
      )}

      {(step === 1 || step === 2) && (
        <Card>
          <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg} />
        </Card>
      )}

      {step === 3 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>
              씬 {scenes.length}개 · 영상 {scenes.reduce((s, sc) => s + sc.clips.length, 0)}개
              {failedClips.length > 0 && ` · 실패 ${failedClips.length}개`}
            </div>
            <Btn onClick={handleExport} disabled={!allAnalyzed || scenes.length === 0}>폴더 정리 실행 →</Btn>
          </div>

          {failedClips.length > 0 && (
            <Card>
              <div style={{ fontWeight: 800, color: C.red, marginBottom: 8 }}>⚠️ 읽기 실패한 파일</div>
              {failedClips.map((f) => (
                <div key={f.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                  <span style={{ fontSize: 13, color: C.txt }}>{f.name} — {f.reason}</span>
                  <button onClick={() => retryFailedClip(f.name)} style={{ fontSize: 12, fontWeight: 700, color: C.teal, background: "none", border: "none", cursor: "pointer" }}>재시도</button>
                </div>
              ))}
            </Card>
          )}

          <div style={{ display: "grid", gap: 14, marginTop: failedClips.length > 0 ? 14 : 0 }}>
            {scenes.map((scene, i) => (
              <Card key={scene.folderName}>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", width: 160 }}>
                    {(scene.previewThumbs ?? []).slice(0, 4).map((url, idx) => (
                      <img key={idx} src={url} alt="" style={{ width: 74, height: 42, objectFit: "cover", borderRadius: 6 }} />
                    ))}
                    {(!scene.previewThumbs || scene.previewThumbs.length === 0) && (
                      <div style={{ width: "100%", fontSize: 12, color: C.hint }}>미리보기 없음</div>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    {scene.nameLoading ? (
                      <div style={{ fontSize: 13, color: C.muted }}>분석 중...</div>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <input
                            value={scene.editedName}
                            onChange={(e) => updateSceneName(i, e.target.value)}
                            style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}
                          />
                          {scene.needsReview && (
                            <span style={{ fontSize: 11, fontWeight: 800, color: C.orange, background: "#FFF3E8", padding: "2px 8px", borderRadius: 99 }}>확인 필요</span>
                          )}
                          <button onClick={() => retryScene(i)} style={{ fontSize: 12, fontWeight: 700, color: C.teal, background: "none", border: "none", cursor: "pointer" }}>재분석</button>
                        </div>
                        <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                          신뢰도 {scene.aiConfidence != null ? `${Math.round(scene.aiConfidence * 100)}%` : "-"} · 영상 {scene.clips.length}개
                        </div>
                        {scene.aiReason && <div style={{ fontSize: 12, color: C.hint }}>{scene.aiReason}</div>}
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <Card>
          <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg} />
        </Card>
      )}

      {step === 5 && stats && (
        <Card>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: C.green, marginBottom: 16 }}>✅ 완료</h2>
          <div style={{ fontSize: 14, color: C.txt, lineHeight: 1.8 }}>
            총 영상 {stats.totalClips}개 · 씬 {stats.totalScenes}개 · 이동 {stats.movedClips}개
            {stats.failedClips > 0 && ` · 실패 ${stats.failedClips}개`}
          </div>
          <div style={{ marginTop: 16 }}>
            <Link href="/photo-sorting" style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>사진작업실로 돌아가기 →</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
