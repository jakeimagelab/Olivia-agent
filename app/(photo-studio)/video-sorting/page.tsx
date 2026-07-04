"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  ClassifiedVideo,
  TimeScene,
  VideoCategory,
  VideoClipFile,
  VideoStats,
} from "@/lib/video-classifier/types";
import { VIDEO_CATEGORY_FOLDER, VIDEO_CATEGORY_ORDER } from "@/lib/video-classifier/types";

/* ════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
const VIDEO_EXTS = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv", "mxf"]);
const GAP_OPTIONS = [3, 5, 7, 10, 15];
const FRAME_OPTIONS = [3, 5] as const;

type Mode = "ai" | "time";
type Step = "setup" | "scanning" | "ai_ready" | "analyzing" | "final_review" | "scan_review" | "exporting" | "done";

const AI_STEP_ORDER: Step[] = ["setup", "scanning", "ai_ready", "analyzing", "final_review", "exporting", "done"];
const AI_STEP_LABELS = ["설정", "파일 스캔", "AI 분류 대기", "AI 분석", "최종 검토", "폴더 정리", "완료"];
const TIME_STEP_ORDER: Step[] = ["setup", "scanning", "scan_review", "exporting", "done"];
const TIME_STEP_LABELS = ["설정", "파일 스캔", "그룹 검토", "폴더 정리", "완료"];

const CATEGORY_LABELS: Record<VideoCategory, string> = {
  SPACE_ONLY: "공간만 있는 영상",
  PEOPLE_CONSULTING: "사람있음·상담대화",
  TREATMENT_SCENE: "진료시술·연출영상",
  CLOSEUP_DETAIL: "얼굴손장비·클로즈업",
  NEED_CHECK: "확인필요",
};

const C = {
  teal: "#155855", orange: "#E85D2C", green: "#22876A", red: "#DC2626",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2", bg: "#EDF5F3",
};

/* ════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
// 영상 파일은 수백 MB~수 GB일 수 있어 arrayBuffer()로 전체를 메모리에 올리지 않고 스트리밍으로 복사한다.
async function copyFileHandle(src: FileSystemFileHandle, dest: FileSystemDirectoryHandle, name: string) {
  const file = await src.getFile();
  const fh = await (dest as any).getFileHandle(name, { create: true });
  const wr = await fh.createWritable();
  await file.stream().pipeTo(wr);
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

function formatEta(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min}분 ${sec}초`;
  return `${sec}초`;
}

function groupClipsByGap(clips: VideoClipFile[], gapMs: number): TimeScene[] {
  const sorted = [...clips].sort((a, b) => a.mtime - b.mtime);
  const groups: VideoClipFile[][] = sorted.length > 0 ? [[sorted[0]]] : [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].mtime - sorted[i - 1].mtime > gapMs) groups.push([sorted[i]]);
    else groups[groups.length - 1].push(sorted[i]);
  }
  return groups.map((g, si) => ({
    folderName: `Scene_${String(si + 1).padStart(3, "0")}`,
    clips: g,
  }));
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
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
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

function SegButton({ selected, onClick, title, desc }: { selected: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, textAlign: "left", padding: "14px 16px", borderRadius: 10,
      border: `1.5px solid ${selected ? C.teal : C.border}`,
      background: selected ? C.light : C.white, cursor: "pointer", fontFamily: "inherit",
    }}>
      <div style={{ fontWeight: 900, fontSize: 14, color: C.txt, marginBottom: 4 }}>{title}{selected ? " ✓" : ""}</div>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{desc}</div>
    </button>
  );
}

/* ════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
export default function VideoSortingPage() {
  const [hasFS, setHasFS] = useState(false);
  useEffect(() => { setHasFS("showDirectoryPicker" in window); }, []);

  const [mode, setMode] = useState<Mode>("ai");
  const [step, setStep] = useState<Step>("setup");
  const [rootDir, setRootDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [maxFrames, setMaxFrames] = useState<number>(3);
  const [gapMinutes, setGapMinutes] = useState(5);
  const [fileMode, setFileMode] = useState<"copy" | "move">("move");

  const [scannedClips, setScannedClips] = useState<VideoClipFile[]>([]);
  const [classified, setClassified] = useState<ClassifiedVideo[]>([]);
  const [timeScenes, setTimeScenes] = useState<TimeScene[]>([]);
  const [failedClips, setFailedClips] = useState<{ name: string; handle: FileSystemFileHandle; reason: string }[]>([]);
  const [progress, setProgress] = useState({ cur: 0, total: 0, msg: "" });
  const [stats, setStats] = useState<VideoStats | null>(null);

  const stepOrder = mode === "ai" ? AI_STEP_ORDER : TIME_STEP_ORDER;
  const stepLabels = mode === "ai" ? AI_STEP_LABELS : TIME_STEP_LABELS;
  const stepPos = stepOrder.indexOf(step);

  const pickDir = async () => {
    try {
      const h = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      setRootDir(h);
    } catch {}
  };

  // 항목을 직접 변형하지 않고 결과를 반환한다 — 호출부가 clip.name을 키로 functional
  // setState를 적용하므로, 동시에 여러 항목을 재분석해도 서로의 갱신을 덮어쓰지 않는다.
  const classifyOne = async (item: ClassifiedVideo): Promise<ClassifiedVideo> => {
    try {
      const file = await item.clip.handle.getFile();
      const frames = await extractVideoFrames(file, frameFractionsForCount(maxFrames));
      if (frames.length === 0) {
        return { ...item, status: "error", category: "NEED_CHECK", categoryKo: "확인필요", confidence: 0, reason: "프레임 추출 실패", previewThumbs: [] };
      }
      const res = await fetch("/api/video-classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames: frames.map((base64, idx) => ({ fileName: `${item.clip.name}#${idx}`, base64 })) }),
      });
      const data = await res.json();
      if (data.ok) {
        return {
          ...item,
          category: data.category, categoryKo: data.categoryKo,
          confidence: data.confidence, sceneDescription: data.sceneDescription,
          reason: data.reason, previewThumbs: frames, status: "done",
        };
      }
      return { ...item, status: "error", category: "NEED_CHECK", categoryKo: "확인필요", confidence: 0, reason: data.error ?? "분석 실패", previewThumbs: frames };
    } catch {
      return { ...item, status: "error", category: "NEED_CHECK", categoryKo: "확인필요", confidence: 0, reason: "네트워크 오류", previewThumbs: [] };
    }
  };

  const handleScan = useCallback(async () => {
    if (!rootDir) return;
    setStep("scanning");
    const entries: VideoClipFile[] = [];
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
        entries.push({ name, basename: name.replace(/\.[^.]+$/, ""), handle: handle as FileSystemFileHandle, mtime: creationTime ?? file.lastModified });
      } catch {
        failed.push({ name, handle: handle as FileSystemFileHandle, reason: "파일을 읽을 수 없음" });
      }
      if (Date.now() - lastUpdate > 300) {
        setProgress({ cur: 0, total: 0, msg: `스캔: ${name}` });
        lastUpdate = Date.now();
      }
    }

    setScannedClips(entries);
    setFailedClips(failed);

    if (mode === "ai") {
      setClassified(entries.map((clip) => ({
        clip, category: null, categoryKo: null, confidence: null,
        sceneDescription: null, reason: null, previewThumbs: [], status: "pending",
      })));
      setStep("ai_ready");
    } else {
      setTimeScenes(groupClipsByGap(entries, gapMinutes * 60 * 1000));
      setStep("scan_review");
    }
  }, [rootDir, mode, gapMinutes]);

  const handleRegroupTime = useCallback(() => {
    setTimeScenes(groupClipsByGap(scannedClips, gapMinutes * 60 * 1000));
  }, [scannedClips, gapMinutes]);

  const handleStartAiAnalysis = useCallback(async () => {
    setStep("analyzing");
    const initial = classified;
    setClassified((prev) => prev.map((c) => ({ ...c, status: "analyzing" as const })));
    const startTime = Date.now();
    for (let i = 0; i < initial.length; i++) {
      const etaLabel = i > 0 ? formatEta(((Date.now() - startTime) / i) * (initial.length - i)) : "";
      setProgress({ cur: i, total: initial.length, msg: `분석 중: ${initial[i].clip.name}${etaLabel ? ` · 예상 남은 시간 약 ${etaLabel}` : ""}` });
      const updated = await classifyOne({ ...initial[i], status: "analyzing" });
      setClassified((prev) => prev.map((c) => (c.clip.name === updated.clip.name ? updated : c)));
    }
    setStep("final_review");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classified, maxFrames]);

  const retryOne = useCallback(async (i: number) => {
    const item = classified[i];
    if (!item) return;
    setClassified((prev) => prev.map((c, idx) => (idx === i ? { ...c, status: "analyzing" } : c)));
    const updated = await classifyOne({ ...item, status: "analyzing" });
    setClassified((prev) => prev.map((c, idx) => (idx === i ? updated : c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classified, maxFrames]);

  const overrideCategory = (i: number, category: VideoCategory) => {
    setClassified((prev) => prev.map((c, idx) => (idx === i ? { ...c, category, categoryKo: CATEGORY_LABELS[category] } : c)));
  };

  const retryFailedClip = useCallback(async (name: string) => {
    const entry = failedClips.find((f) => f.name === name);
    if (!entry) return;
    try {
      const file = await entry.handle.getFile();
      const creationTime = await readVideoCreationTime(file);
      const clip: VideoClipFile = { name: entry.name, basename: entry.name.replace(/\.[^.]+$/, ""), handle: entry.handle, mtime: creationTime ?? file.lastModified };
      setFailedClips((prev) => prev.filter((f) => f.name !== name));
      setScannedClips((prev) => [...prev, clip]);

      if (mode === "ai") {
        const newItem: ClassifiedVideo = { clip, category: null, categoryKo: null, confidence: null, sceneDescription: null, reason: null, previewThumbs: [], status: "pending" };
        if (step === "final_review" || step === "analyzing") {
          const analyzingItem = { ...newItem, status: "analyzing" as const };
          setClassified((prev) => [...prev, analyzingItem]);
          const updated = await classifyOne(analyzingItem);
          setClassified((prev) => prev.map((c) => (c.clip.name === updated.clip.name ? updated : c)));
        } else {
          setClassified((prev) => [...prev, newItem]);
        }
      } else {
        setTimeScenes(groupClipsByGap([...scannedClips, clip], gapMinutes * 60 * 1000));
      }
    } catch {
      setFailedClips((prev) => prev.map((f) => (f.name === name ? { ...f, reason: "재시도 실패" } : f)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failedClips, scannedClips, mode, step, gapMinutes]);

  const handleExportAi = useCallback(async () => {
    if (!rootDir) return;
    setStep("exporting");
    const outputRoot = await (rootDir as any).getDirectoryHandle("분류완료", { create: true }) as FileSystemDirectoryHandle;
    const total = classified.length;
    let done = 0;
    let moved = 0;
    let lastUpdate = Date.now();
    const categoryCounts: Record<string, number> = {};

    for (const item of classified) {
      const category: VideoCategory = item.category ?? "NEED_CHECK";
      const folderName = VIDEO_CATEGORY_FOLDER[category];
      categoryCounts[folderName] = (categoryCounts[folderName] ?? 0) + 1;
      if (Date.now() - lastUpdate > 300) {
        setProgress({ cur: done, total, msg: `${folderName}: ${item.clip.name}` });
        lastUpdate = Date.now();
      }
      try {
        const dir = await (outputRoot as any).getDirectoryHandle(folderName, { create: true }) as FileSystemDirectoryHandle;
        await copyFileHandle(item.clip.handle, dir, item.clip.name);
        if (fileMode === "move") await (rootDir as any).removeEntry(item.clip.name);
        moved++;
      } catch {}
      done++;
    }

    setStats({ totalClips: total, movedClips: moved, failedClips: failedClips.length, categoryCounts });
    setStep("done");
  }, [rootDir, classified, fileMode, failedClips]);

  const handleExportTime = useCallback(async () => {
    if (!rootDir) return;
    setStep("exporting");
    const outputRoot = await (rootDir as any).getDirectoryHandle("분류완료_시간차", { create: true }) as FileSystemDirectoryHandle;
    const total = timeScenes.reduce((s, sc) => s + sc.clips.length, 0);
    let done = 0;
    let moved = 0;
    let lastUpdate = Date.now();
    const categoryCounts: Record<string, number> = {};

    for (const scene of timeScenes) {
      categoryCounts[scene.folderName] = scene.clips.length;
      const dir = await (outputRoot as any).getDirectoryHandle(scene.folderName, { create: true }) as FileSystemDirectoryHandle;
      for (const clip of scene.clips) {
        if (Date.now() - lastUpdate > 300) {
          setProgress({ cur: done, total, msg: `${scene.folderName}: ${clip.name}` });
          lastUpdate = Date.now();
        }
        try {
          await copyFileHandle(clip.handle, dir, clip.name);
          if (fileMode === "move") await (rootDir as any).removeEntry(clip.name);
          moved++;
        } catch {}
        done++;
      }
    }

    setStats({ totalClips: total, movedClips: moved, failedClips: failedClips.length, categoryCounts });
    setStep("done");
  }, [rootDir, timeScenes, fileMode, failedClips]);

  const allAnalyzed = classified.every((c) => c.status === "done" || c.status === "error");

  /* ════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════ */
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px 80px", fontFamily: "'Noto Sans KR', sans-serif" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
        {stepLabels.map((label, i) => (
          <div key={label} style={{
            padding: "6px 12px", borderRadius: 99, fontSize: 12, fontWeight: 800,
            background: i === stepPos ? C.teal : C.light, color: i === stepPos ? C.white : C.muted,
          }}>
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {step === "setup" && (
        <Card>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: C.txt, marginBottom: 16 }}>🎥 영상 분류 설정</h2>

          {!hasFS && (
            <div style={{ padding: 14, background: "#FFF3CD", borderRadius: 10, fontSize: 12, color: "#856404", border: "1px solid #FFD980", marginBottom: 16 }}>
              ⚠️ Chrome 또는 Edge 브라우저에서만 파일 시스템 접근이 가능합니다.
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>1. 분류 방식</div>
            <div style={{ display: "flex", gap: 8 }}>
              <SegButton selected={mode === "ai"} onClick={() => setMode("ai")} title="AI 장면 분류" desc="대표 프레임 기준으로 4개 카테고리 + 확인필요로 판단합니다." />
              <SegButton selected={mode === "time"} onClick={() => setMode("time")} title="시간차 순 분류" desc="촬영 시간 간격으로 Scene 폴더를 나눕니다 (AI 미사용)." />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>2. 영상 폴더 선택</div>
            <Btn onClick={pickDir} disabled={!hasFS}>{rootDir ? "✅ 폴더 선택됨 — 다시 선택" : "📁 폴더 선택"}</Btn>
          </div>

          {mode === "ai" && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>3. AI 대표 프레임 수</div>
              <div style={{ display: "flex", gap: 8 }}>
                <SegButton selected={maxFrames === 3} onClick={() => setMaxFrames(3)} title="3장" desc="단일 장면 클립에 권장. 빠르고 비용이 낮습니다." />
                <SegButton selected={maxFrames === 5} onClick={() => setMaxFrames(5)} title="5장" desc="장면 전환이나 카메라 이동이 큰 영상에 권장." />
              </div>
            </div>
          )}

          {mode === "time" && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>3. Scene 구분 시간 간격</div>
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
          )}

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>4. 파일 처리 방식</div>
            <div style={{ display: "flex", gap: 8 }}>
              <SegButton selected={fileMode === "copy"} onClick={() => setFileMode("copy")} title="복사" desc="원본을 남기고 분류 폴더에 복사합니다." />
              <SegButton selected={fileMode === "move"} onClick={() => setFileMode("move")} title="이동" desc="원본을 분류 폴더로 이동합니다." />
            </div>
          </div>

          <Btn onClick={handleScan} disabled={!rootDir}>시작하기 →</Btn>
        </Card>
      )}

      {step === "scanning" && (
        <Card>
          <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg} />
        </Card>
      )}

      {step === "ai_ready" && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.txt, marginBottom: 4 }}>
            스캔 완료 — 영상 {classified.length}개{failedClips.length > 0 && ` · 실패 ${failedClips.length}개`}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
            각 영상을 개별적으로 분석해 4개 카테고리 + 확인필요로 분류합니다.
          </div>
          {failedClips.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {failedClips.map((f) => (
                <div key={f.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
                  <span style={{ fontSize: 13, color: C.txt }}>{f.name} — {f.reason}</span>
                  <button onClick={() => retryFailedClip(f.name)} style={{ fontSize: 12, fontWeight: 700, color: C.teal, background: "none", border: "none", cursor: "pointer" }}>재시도</button>
                </div>
              ))}
            </div>
          )}
          <Btn onClick={handleStartAiAnalysis} disabled={classified.length === 0}>AI 분류 시작 →</Btn>
        </Card>
      )}

      {step === "scan_review" && (
        <div>
          <Card>
            <h2 style={{ fontSize: 16, fontWeight: 900, color: C.txt, marginBottom: 4 }}>시간대별 그룹핑 결과</h2>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
              씬 {timeScenes.length}개 · 영상 {timeScenes.reduce((s, sc) => s + sc.clips.length, 0)}개
              {failedClips.length > 0 && ` · 실패 ${failedClips.length}개`}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
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
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="ghost" onClick={handleRegroupTime}>🔄 다시 그룹핑</Btn>
              <Btn onClick={handleExportTime} disabled={timeScenes.length === 0}>폴더 정리 실행 →</Btn>
            </div>
          </Card>

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

          <div style={{ display: "grid", gap: 10 }}>
            {timeScenes.map((scene) => (
              <Card key={scene.folderName}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: C.txt }}>{scene.folderName}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>영상 {scene.clips.length}개</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {step === "analyzing" && (
        <Card>
          <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg} />
        </Card>
      )}

      {step === "final_review" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>
              영상 {classified.length}개{failedClips.length > 0 && ` · 실패 ${failedClips.length}개`}
            </div>
            <Btn onClick={handleExportAi} disabled={!allAnalyzed || classified.length === 0}>폴더 정리 실행 →</Btn>
          </div>

          <Card>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {VIDEO_CATEGORY_ORDER.map((cat) => {
                const count = classified.filter((c) => (c.category ?? "NEED_CHECK") === cat).length;
                return (
                  <div key={cat} style={{ flex: "1 1 140px", padding: 10, borderRadius: 8, background: C.light, textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: C.teal }}>{count}</div>
                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{CATEGORY_LABELS[cat]}</div>
                  </div>
                );
              })}
            </div>
          </Card>

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

          <div style={{ display: "grid", gap: 14 }}>
            {classified.map((item, i) => (
              <Card key={item.clip.name}>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", width: 160 }}>
                    {item.previewThumbs.slice(0, 4).map((url, idx) => (
                      <img key={idx} src={url} alt="" style={{ width: 74, height: 42, objectFit: "cover", borderRadius: 6 }} />
                    ))}
                    {item.previewThumbs.length === 0 && (
                      <div style={{ width: "100%", fontSize: 12, color: C.hint }}>미리보기 없음</div>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    {item.status === "analyzing" ? (
                      <div style={{ fontSize: 13, color: C.muted }}>분석 중...</div>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: C.hint, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.clip.name}</span>
                          <select
                            value={item.category ?? "NEED_CHECK"}
                            onChange={(e) => overrideCategory(i, e.target.value as VideoCategory)}
                            style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}
                          >
                            {VIDEO_CATEGORY_ORDER.map((cat) => (
                              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                            ))}
                          </select>
                          {item.status === "error" && (
                            <span style={{ fontSize: 11, fontWeight: 800, color: C.orange, background: "#FFF3E8", padding: "2px 8px", borderRadius: 99 }}>확인 필요</span>
                          )}
                          <button onClick={() => retryOne(i)} style={{ fontSize: 12, fontWeight: 700, color: C.teal, background: "none", border: "none", cursor: "pointer" }}>재분석</button>
                        </div>
                        <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                          신뢰도 {item.confidence != null ? `${Math.round(item.confidence * 100)}%` : "-"}
                          {item.sceneDescription && ` · ${item.sceneDescription}`}
                        </div>
                        {item.reason && <div style={{ fontSize: 12, color: C.hint }}>{item.reason}</div>}
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {step === "exporting" && (
        <Card>
          <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg} />
        </Card>
      )}

      {step === "done" && stats && (
        <Card>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: C.green, marginBottom: 16 }}>✅ 완료</h2>
          <div style={{ fontSize: 14, color: C.txt, lineHeight: 1.8, marginBottom: 12 }}>
            총 영상 {stats.totalClips}개 · 처리 {stats.movedClips}개
            {stats.failedClips > 0 && ` · 실패 ${stats.failedClips}개`}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            {Object.entries(stats.categoryCounts).map(([label, count]) => (
              <div key={label} style={{ flex: "1 1 140px", padding: 10, borderRadius: 8, background: C.light, textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: C.teal }}>{count}</div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{label}</div>
              </div>
            ))}
          </div>
          <Link href="/photo-sorting" style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>사진작업실로 돌아가기 →</Link>
        </Card>
      )}
    </div>
  );
}
