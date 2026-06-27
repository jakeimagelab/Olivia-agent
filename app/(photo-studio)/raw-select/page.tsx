"use client";

import { useCallback, useRef, useState } from "react";

/* ── Types ──────────────────────────────────────────────── */

type RejectReason = "ok" | "pending" | "blur" | "dark" | "overexposed";

interface PhotoFile {
  name: string;
  basename: string;
  handle: FileSystemFileHandle;
  thumbUrl: string | null;
  blurScore: number | null;
  brightness: number | null;
  rejectReason: RejectReason;
  hash: string | null;
  dupGroupId: string | null;
  isDupRep: boolean;
  selected: boolean;
  rawFile: string | null;
  rawStatus: "matched" | "missing" | "copied" | "failed" | null;
}

interface Scene {
  originalName: string;
  suggestedName: string;
  editedName: string;
  dirHandle: FileSystemDirectoryHandle;
  files: PhotoFile[];
  nameLoading: boolean;
  nameConfidence?: number;
  nameReason?: string;
}

interface Options {
  sceneNaming: boolean;
  qualityFilter: boolean;
  blurThreshold: number;
  darkThreshold: number;
  overexpThreshold: number;
  dupRemoval: boolean;
  dupThreshold: number;
  rawOperation: "copy" | "move";
}

interface SummaryStats {
  totalScenes: number;
  totalJpg: number;
  totalRejected: number;
  totalDuplicateRemoved: number;
  totalSelected: number;
  totalRawCopied: number;
  totalRawMissing: number;
}

/* ── Constants ───────────────────────────────────────────── */

const C = {
  teal: "#155855", orange: "#E85D2C", green: "#22876A",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2", bg: "#EDF5F3",
  red: "#DC2626", yellow: "#D97706", purple: "#7C3AED",
};

const RAW_EXTS = new Set(["arw", "cr3", "cr2", "nef", "raf", "dng", "orf", "rw2"]);
const JPG_EXTS = new Set(["jpg", "jpeg"]);

const DEFAULT_OPTIONS: Options = {
  sceneNaming: true,
  qualityFilter: true,
  blurThreshold: 18,
  darkThreshold: 38,
  overexpThreshold: 230,
  dupRemoval: true,
  dupThreshold: 95,
  rawOperation: "copy",
};

const STEP_LABELS = ["폴더 설정", "옵션", "씬 네이밍", "분석", "검토", "RAW 복사", "완료"];

/* ── Image Analysis Helpers ─────────────────────────────── */

async function analyzeJpg(file: File): Promise<{
  blurScore: number;
  brightness: number;
  hash: string;
  thumbUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const MAX = 280;
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);

      // Grayscale + brightness
      const gray = new Float32Array(w * h);
      let brightSum = 0;
      for (let i = 0; i < gray.length; i++) {
        const v = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        gray[i] = v; brightSum += v;
      }
      const brightness = brightSum / gray.length;

      // Laplacian blur score (variance)
      let lapSum = 0, lapCount = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const c = y * w + x;
          const lap = gray[c] * 4 - gray[(y - 1) * w + x] - gray[(y + 1) * w + x] - gray[y * w + (x - 1)] - gray[y * w + (x + 1)];
          lapSum += lap * lap; lapCount++;
        }
      }
      const blurScore = lapCount > 0 ? Math.sqrt(lapSum / lapCount) : 0;

      // Average hash 8x8
      const hc = document.createElement("canvas");
      hc.width = 8; hc.height = 8;
      const hCtx = hc.getContext("2d")!;
      hCtx.drawImage(img, 0, 0, 8, 8);
      const hd = hCtx.getImageData(0, 0, 8, 8).data;
      const hGray: number[] = [];
      for (let i = 0; i < 64; i++) hGray.push(0.299 * hd[i * 4] + 0.587 * hd[i * 4 + 1] + 0.114 * hd[i * 4 + 2]);
      const hMean = hGray.reduce((a, b) => a + b, 0) / 64;
      const hash = hGray.map(v => v >= hMean ? "1" : "0").join("");

      // Thumbnail
      const tc = document.createElement("canvas");
      const ts = Math.min(160 / img.width, 160 / img.height, 1);
      tc.width = Math.round(img.width * ts); tc.height = Math.round(img.height * ts);
      tc.getContext("2d")!.drawImage(img, 0, 0, tc.width, tc.height);
      const thumbUrl = tc.toDataURL("image/jpeg", 0.72);

      URL.revokeObjectURL(url);
      resolve({ blurScore, brightness, hash, thumbUrl });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("로드 실패")); };
    img.src = url;
  });
}

function hammingDist(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d++;
  return d;
}

function applyDuplicates(files: PhotoFile[], thresholdPct: number): PhotoFile[] {
  const maxDist = Math.round(64 * (1 - thresholdPct / 100));
  const result = files.map(f => ({ ...f, dupGroupId: null as string | null, isDupRep: false }));
  let gid = 0;

  for (let i = 0; i < result.length; i++) {
    if (!result[i].hash || result[i].dupGroupId !== null || result[i].rejectReason !== "ok") continue;
    const group: number[] = [i];
    for (let j = i + 1; j < result.length; j++) {
      if (!result[j].hash || result[j].dupGroupId !== null || result[j].rejectReason !== "ok") continue;
      if (hammingDist(result[i].hash!, result[j].hash!) <= maxDist) group.push(j);
    }
    if (group.length > 1) {
      const gname = `g${++gid}`;
      // Rep = sharpest
      let repIdx = group[0];
      for (const idx of group) {
        if ((result[idx].blurScore ?? 0) > (result[repIdx].blurScore ?? 0)) repIdx = idx;
      }
      for (const idx of group) {
        result[idx].dupGroupId = gname;
        result[idx].isDupRep = (idx === repIdx);
      }
    }
  }
  return result;
}

async function getApiThumb(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(480 / img.width, 480 / img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("로드 실패")); };
    img.src = url;
  });
}

async function listJpgFiles(dirHandle: FileSystemDirectoryHandle): Promise<[string, FileSystemFileHandle][]> {
  const result: [string, FileSystemFileHandle][] = [];
  for await (const [name, handle] of (dirHandle as any).entries()) {
    if (handle.kind === "file") {
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (JPG_EXTS.has(ext)) result.push([name, handle]);
    }
  }
  return result.sort((a, b) => a[0].localeCompare(b[0]));
}

async function buildRawIndex(rawDir: FileSystemDirectoryHandle): Promise<Map<string, FileSystemFileHandle>> {
  const map = new Map<string, FileSystemFileHandle>();
  async function traverse(dir: FileSystemDirectoryHandle) {
    for await (const [name, handle] of (dir as any).entries()) {
      if (handle.kind === "file") {
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        if (RAW_EXTS.has(ext)) {
          const base = name.replace(/\.[^.]+$/, "").toLowerCase();
          map.set(base, handle);
        }
      } else if (handle.kind === "directory") {
        await traverse(handle);
      }
    }
  }
  await traverse(rawDir);
  return map;
}

async function copyFileHandle(srcHandle: FileSystemFileHandle, destDir: FileSystemDirectoryHandle, fileName: string) {
  const file = await srcHandle.getFile();
  const buf = await file.arrayBuffer();
  const dest = await (destDir as any).getFileHandle(fileName, { create: true });
  const writable = await dest.createWritable();
  await writable.write(buf);
  await writable.close();
}

function makeCSV(headers: string[], rows: string[][]): string {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  return [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── UI Helpers ─────────────────────────────────────────── */

function Btn({ onClick, disabled, children, variant = "primary", style: s }: {
  onClick?: () => void; disabled?: boolean; children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger"; style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    height: 42, padding: "0 22px", border: "none", borderRadius: 10,
    fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1, transition: "opacity .15s",
  };
  const variants = {
    primary: { background: C.teal, color: "#fff" },
    secondary: { background: C.white, color: C.teal, border: `1.5px solid ${C.border}` },
    danger: { background: C.red, color: "#fff" },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...s }}>{children}</button>;
}

function Card({ children, style: s }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", ...s }}>{children}</div>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <div onClick={() => onChange(!checked)} style={{
        width: 40, height: 22, borderRadius: 11, background: checked ? C.teal : C.border,
        position: "relative", transition: "background .18s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 3, left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          transition: "left .18s", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.txt }}>{label}</span>
    </label>
  );
}

/* ── Main Component ─────────────────────────────────────── */

export default function RawSelectPage() {
  const [step, setStep] = useState(0);
  const [jpgDir, setJpgDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [rawDir, setRawDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [outputDir, setOutputDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS);
  const [progress, setProgress] = useState({ cur: 0, total: 0, msg: "" });
  const [activeScene, setActiveScene] = useState(0);
  const [viewMode, setViewMode] = useState<"candidates" | "rejected" | "duplicates">("candidates");
  const [copyLog, setCopyLog] = useState<string[]>([]);
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const cancelRef = useRef(false);

  // Browser support check (render-time safe)
  const hasFileSystem = typeof window !== "undefined" && "showDirectoryPicker" in window;

  const pickDir = async (setter: (h: FileSystemDirectoryHandle) => void) => {
    try {
      const h = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      setter(h);
    } catch (_) {}
  };

  /* ── Step 0 → 1: discover scenes ──────────────────────── */
  const handleStep0 = async () => {
    if (!jpgDir || !rawDir || !outputDir) return;
    const discovered: Scene[] = [];
    for await (const [name, handle] of (jpgDir as any).entries()) {
      if (handle.kind === "directory") {
        const files = await listJpgFiles(handle);
        discovered.push({
          originalName: name, suggestedName: name, editedName: name,
          dirHandle: handle, nameLoading: false,
          files: files.map(([fname, fh]) => ({
            name: fname,
            basename: fname.replace(/\.[^.]+$/, ""),
            handle: fh,
            thumbUrl: null, blurScore: null, brightness: null,
            rejectReason: "pending", hash: null,
            dupGroupId: null, isDupRep: false,
            selected: false, rawFile: null, rawStatus: null,
          })),
        });
      }
    }
    discovered.sort((a, b) => a.originalName.localeCompare(b.originalName));
    setScenes(discovered);
    setStep(1);
  };

  /* ── Step 2: AI scene naming ────────────────────────────── */
  const handleSceneNaming = useCallback(async () => {
    setStep(2);
    if (!options.sceneNaming) { setStep(3); return; }

    const updated = scenes.map(s => ({ ...s }));
    for (let i = 0; i < updated.length; i++) {
      updated[i] = { ...updated[i], nameLoading: true };
      setScenes([...updated]);

      try {
        const sampleFiles = updated[i].files.slice(0, 4);
        const thumbs: string[] = [];
        for (const pf of sampleFiles) {
          const file = await pf.handle.getFile();
          thumbs.push(await getApiThumb(file));
        }
        const res = await fetch("/api/scene-naming", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thumbnails: thumbs, originalName: updated[i].originalName }),
        });
        const data = await res.json();
        if (data.ok && data.name) {
          const num = updated[i].originalName.replace(/\D/g, "").padStart(2, "0") || String(i + 1).padStart(2, "0");
          const suggested = `${num}_${data.name}`;
          updated[i] = { ...updated[i], suggestedName: suggested, editedName: suggested, nameLoading: false };
        } else {
          updated[i] = { ...updated[i], nameLoading: false };
        }
      } catch (_) {
        updated[i] = { ...updated[i], nameLoading: false };
      }
      setScenes([...updated]);
    }
  }, [scenes, options.sceneNaming]);

  /* ── Step 3: Analysis ───────────────────────────────────── */
  const runAnalysis = useCallback(async () => {
    setStep(3);
    cancelRef.current = false;
    const total = scenes.reduce((s, sc) => s + sc.files.length, 0);
    let done = 0;

    const updated = scenes.map(s => ({ ...s, files: s.files.map(f => ({ ...f })) }));

    for (let si = 0; si < updated.length; si++) {
      for (let fi = 0; fi < updated[si].files.length; fi++) {
        if (cancelRef.current) break;
        const pf = updated[si].files[fi];
        setProgress({ cur: done, total, msg: `${updated[si].editedName} / ${pf.name}` });

        try {
          const file = await pf.handle.getFile();
          const { blurScore, brightness, hash, thumbUrl } = await analyzeJpg(file);
          let rejectReason: RejectReason = "ok";
          if (options.qualityFilter) {
            if (blurScore < options.blurThreshold) rejectReason = "blur";
            else if (brightness < options.darkThreshold) rejectReason = "dark";
            else if (brightness > options.overexpThreshold) rejectReason = "overexposed";
          }
          updated[si].files[fi] = { ...pf, blurScore, brightness, hash, thumbUrl, rejectReason, selected: rejectReason === "ok" };
        } catch (_) {
          updated[si].files[fi] = { ...pf, rejectReason: "ok", selected: true };
        }
        done++;
      }

      // Duplicate grouping within scene
      if (options.dupRemoval) {
        const grouped = applyDuplicates(updated[si].files, options.dupThreshold);
        updated[si].files = grouped.map(f => ({
          ...f,
          selected: f.rejectReason === "ok" && (f.dupGroupId === null || f.isDupRep),
        }));
      }

      setScenes([...updated]);
    }
    setProgress({ cur: total, total, msg: "분석 완료" });
    setStep(4);
  }, [scenes, options]);

  /* ── Step 5: RAW copy ───────────────────────────────────── */
  const runRawCopy = useCallback(async () => {
    if (!rawDir || !outputDir) return;
    setStep(5);
    cancelRef.current = false;

    const rawIndex = await buildRawIndex(rawDir);
    const rawSelectDir = await (outputDir as any).getDirectoryHandle("RAW_SELECT", { create: true });
    const reportsDir = await (outputDir as any).getDirectoryHandle("AI_SELECT_REPORT", { create: true });

    const log: string[] = [];
    const reportRows: string[][] = [];
    let copied = 0, missing = 0;
    const selectedTotal = scenes.reduce((s, sc) => s + sc.files.filter(f => f.selected).length, 0);
    let processed = 0;

    const updated = scenes.map(s => ({ ...s, files: s.files.map(f => ({ ...f })) }));

    for (let si = 0; si < updated.length; si++) {
      const sc = updated[si];
      const sceneName = sc.editedName || sc.originalName;
      const sceneDir = await (rawSelectDir as any).getDirectoryHandle(sceneName, { create: true });

      for (let fi = 0; fi < sc.files.length; fi++) {
        if (!sc.files[fi].selected) continue;
        if (cancelRef.current) break;
        const pf = sc.files[fi];
        setProgress({ cur: processed, total: selectedTotal, msg: `복사 중: ${pf.name}` });

        const rawHandle = rawIndex.get(pf.basename.toLowerCase());
        if (rawHandle) {
          try {
            const rawFile = await rawHandle.getFile();
            await copyFileHandle(rawHandle, sceneDir, rawFile.name);
            updated[si].files[fi] = { ...pf, rawFile: rawFile.name, rawStatus: "copied" };
            log.push(`✅ ${pf.name} → ${sceneName}/${rawFile.name}`);
            reportRows.push([sceneName, pf.name, rawFile.name, "copied", `RAW_SELECT/${sceneName}/${rawFile.name}`]);
            copied++;
          } catch (e: any) {
            updated[si].files[fi] = { ...pf, rawStatus: "failed" };
            log.push(`❌ ${pf.name}: 복사 실패`);
            reportRows.push([sceneName, pf.name, "", "failed", ""]);
          }
        } else {
          updated[si].files[fi] = { ...pf, rawStatus: "missing" };
          log.push(`⚠️ ${pf.name}: RAW 없음`);
          reportRows.push([sceneName, pf.name, "", "missing", ""]);
          missing++;
        }
        processed++;
        setCopyLog([...log]);
      }
      setScenes([...updated]);
    }

    // Write reports
    const writeReport = async (name: string, csv: string) => {
      try {
        const fh = await (reportsDir as any).getFileHandle(name, { create: true });
        const wr = await fh.createWritable();
        await wr.write("﻿" + csv); await wr.close();
      } catch (_) {}
    };
    await writeReport("raw_match_report.csv", makeCSV(
      ["씬", "JPG", "RAW", "상태", "저장 경로"], reportRows
    ));
    await writeReport("selected_jpg_list.csv", makeCSV(
      ["씬", "JPG", "블러", "밝기", "중복그룹", "대표컷", "RAW 상태"],
      updated.flatMap(s => s.files.filter(f => f.selected).map(f => [
        s.editedName, f.name, f.blurScore?.toFixed(1) ?? "", f.brightness?.toFixed(0) ?? "",
        f.dupGroupId ?? "", f.isDupRep ? "Y" : "", f.rawStatus ?? "",
      ]))
    ));
    await writeReport("rejected_photos.csv", makeCSV(
      ["씬", "JPG", "제외 사유", "블러", "밝기"],
      updated.flatMap(s => s.files.filter(f => f.rejectReason !== "ok" && f.rejectReason !== "pending").map(f => [
        s.editedName, f.name,
        f.rejectReason === "blur" ? "흔들림" : f.rejectReason === "dark" ? "어두움" : "노출과다",
        f.blurScore?.toFixed(1) ?? "", f.brightness?.toFixed(0) ?? "",
      ]))
    ));

    setStats({
      totalScenes: updated.length,
      totalJpg: updated.reduce((s, sc) => s + sc.files.length, 0),
      totalRejected: updated.reduce((s, sc) => s + sc.files.filter(f => f.rejectReason !== "ok" && f.rejectReason !== "pending").length, 0),
      totalDuplicateRemoved: updated.reduce((s, sc) => s + sc.files.filter(f => f.dupGroupId !== null && !f.isDupRep).length, 0),
      totalSelected: updated.reduce((s, sc) => s + sc.files.filter(f => f.selected).length, 0),
      totalRawCopied: copied,
      totalRawMissing: missing,
    });
    setStep(6);
  }, [scenes, rawDir, outputDir]);

  /* ── Render helpers ─────────────────────────────────────── */

  const sBtn: React.CSSProperties = {
    height: 48, padding: "0 18px", borderRadius: 10, border: `1.5px dashed ${C.border}`,
    background: C.white, cursor: "pointer", fontSize: 13, fontWeight: 700,
    color: C.teal, display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit",
  };

  const renderStepIndicator = () => (
    <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "10px 24px", overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {STEP_LABELS.map((lbl, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%", fontSize: 9, fontWeight: 900,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: i < step ? C.green : i === step ? C.teal : C.border,
              color: i <= step ? "#fff" : C.muted,
            }}>{i < step ? "✓" : i + 1}</div>
            <span style={{ fontSize: 11, fontWeight: i === step ? 800 : 500, color: i === step ? C.teal : C.hint }}>{lbl}</span>
            {i < STEP_LABELS.length - 1 && <span style={{ color: C.border, fontSize: 10 }}>›</span>}
          </div>
        ))}
      </div>
    </div>
  );

  /* ── STEP 0 ─────────────────────────────────────────────── */
  const Step0 = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
      <Card>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 900, color: C.teal }}>
          📂 작업 폴더 선택
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { label: "JPG Scene 폴더", sub: "Scene01, Scene02 등 폴더가 들어있는 상위 폴더", state: jpgDir, set: (h: FileSystemDirectoryHandle) => setJpgDir(h) },
            { label: "RAW Original 폴더", sub: "DSC00001.ARW 등 원본 RAW 파일들이 있는 폴더", state: rawDir, set: (h: FileSystemDirectoryHandle) => setRawDir(h) },
            { label: "결과 저장 폴더", sub: "RAW_SELECT, AI_SELECT_REPORT 폴더가 생성될 위치", state: outputDir, set: (h: FileSystemDirectoryHandle) => setOutputDir(h) },
          ].map(({ label, sub, state, set }) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>{label}</div>
              <button style={{ ...sBtn, width: "100%", justifyContent: "flex-start" }} onClick={() => pickDir(set)}>
                {state ? <><span style={{ color: C.green }}>✓</span> {state.name}</> : <><span>📁</span> 폴더 선택...</>}
              </button>
              <div style={{ fontSize: 10, color: C.hint, marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>
      </Card>

      {!hasFileSystem && (
        <div style={{ padding: 16, background: "#FFF3CD", borderRadius: 10, fontSize: 12, color: "#856404", border: "1px solid #FFD980" }}>
          ⚠️ Chrome 또는 Edge 브라우저에서만 파일 시스템 접근이 가능합니다.
        </div>
      )}

      <Btn onClick={handleStep0} disabled={!jpgDir || !rawDir || !outputDir || !hasFileSystem}>
        씬 탐색 시작 →
      </Btn>
    </div>
  );

  /* ── STEP 1 ─────────────────────────────────────────────── */
  const Step1 = () => {
    const opt = options;
    const set = <K extends keyof Options>(k: K, v: Options[K]) => setOptions(prev => ({ ...prev, [k]: v }));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
        <div style={{ padding: 16, background: C.light, borderRadius: 10, fontSize: 12, color: C.teal, border: `1px solid rgba(21,88,85,.15)` }}>
          씬 {scenes.length}개 / 총 {scenes.reduce((s, sc) => s + sc.files.length, 0)}장 JPG 발견
        </div>
        <Card>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 900, color: C.teal }}>⚙️ 분석 옵션</div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
            <Toggle checked={opt.sceneNaming} onChange={v => set("sceneNaming", v)} label="AI 씬 폴더명 자동 추천" />
            <Toggle checked={opt.qualityFilter} onChange={v => set("qualityFilter", v)} label="품질 1차 필터 (흔들림·어두움·노출과다)" />
            {opt.qualityFilter && (
              <div style={{ marginLeft: 50, display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "흔들림 임계값", key: "blurThreshold" as const, min: 5, max: 60, unit: "(낮을수록 엄격)" },
                  { label: "어두움 임계값", key: "darkThreshold" as const, min: 10, max: 80, unit: "(밝기 0-255)" },
                  { label: "노출과다 임계값", key: "overexpThreshold" as const, min: 180, max: 250, unit: "(밝기 0-255)" },
                ].map(({ label, key, min, max, unit }) => (
                  <div key={key}>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label} <span style={{ color: C.hint }}>({opt[key]}) {unit}</span></div>
                    <input type="range" min={min} max={max} value={opt[key]} onChange={e => set(key, Number(e.target.value))} style={{ width: "100%" }} />
                  </div>
                ))}
              </div>
            )}
            <Toggle checked={opt.dupRemoval} onChange={v => set("dupRemoval", v)} label="중복컷 그룹화 (유사도 기준)" />
            {opt.dupRemoval && (
              <div style={{ marginLeft: 50 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>유사도 임계값 <span style={{ color: C.hint }}>({opt.dupThreshold}%) — 높을수록 더 유사한 것만 중복 처리</span></div>
                <input type="range" min={80} max={99} value={opt.dupThreshold} onChange={e => set("dupThreshold", Number(e.target.value))} style={{ width: "100%" }} />
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8 }}>RAW 처리 방식</div>
              <div style={{ display: "flex", gap: 10 }}>
                {(["copy", "move"] as const).map(v => (
                  <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                    <input type="radio" checked={opt.rawOperation === v} onChange={() => set("rawOperation", v)} />
                    {v === "copy" ? "복사 (원본 유지)" : "이동 (원본 삭제)"}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="secondary" onClick={() => setStep(0)}>← 뒤로</Btn>
          <Btn onClick={handleSceneNaming}>{opt.sceneNaming ? "씬 이름 분석 →" : "분석 시작 →"}</Btn>
        </div>
      </div>
    );
  };

  /* ── STEP 2 ─────────────────────────────────────────────── */
  const Step2 = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <Card>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 900, color: C.teal }}>🏷️ 씬 폴더명 추천</div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 0 }}>
          {scenes.map((sc, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "180px 24px 1fr", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: i < scenes.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: "monospace" }}>{sc.originalName}</div>
              <div style={{ color: C.hint, textAlign: "center" }}>→</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {sc.nameLoading ? (
                  <div style={{ fontSize: 12, color: C.hint }}>분석 중...</div>
                ) : (
                  <input
                    value={sc.editedName}
                    onChange={e => setScenes(prev => prev.map((s, j) => j === i ? { ...s, editedName: e.target.value } : s))}
                    style={{ flex: 1, height: 36, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "0 10px", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="secondary" onClick={() => setStep(1)}>← 뒤로</Btn>
        <Btn onClick={runAnalysis} disabled={scenes.some(s => s.nameLoading)}>분석 시작 →</Btn>
      </div>
    </div>
  );

  /* ── STEP 3 ─────────────────────────────────────────────── */
  const Step3 = () => {
    const pct = progress.total > 0 ? Math.round((progress.cur / progress.total) * 100) : 0;
    return (
      <div style={{ maxWidth: 560 }}>
        <Card>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 900, color: C.teal }}>🔍 사진 분석 중...</div>
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{progress.cur} / {progress.total}장</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: C.teal, borderRadius: 4, transition: "width .2s" }} />
            </div>
            <div style={{ fontSize: 11, color: C.hint, wordBreak: "break-all" }}>{progress.msg}</div>
            <button
              onClick={() => { cancelRef.current = true; }}
              style={{ marginTop: 20, padding: "8px 16px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: "pointer", color: C.muted, fontFamily: "inherit" }}
            >
              중단
            </button>
          </div>
        </Card>
      </div>
    );
  };

  /* ── STEP 4 ─────────────────────────────────────────────── */
  const Step4 = () => {
    const sc = scenes[activeScene];
    if (!sc) return null;

    const candidates = sc.files.filter(f => f.rejectReason === "ok" && (f.dupGroupId === null || f.isDupRep));
    const rejected = sc.files.filter(f => f.rejectReason !== "ok" && f.rejectReason !== "pending");
    const dups = sc.files.filter(f => f.dupGroupId !== null && !f.isDupRep);
    const selected = sc.files.filter(f => f.selected).length;
    const total = sc.files.length;

    const toggleFile = (fi: number) => {
      setScenes(prev => prev.map((s, si) => si !== activeScene ? s : {
        ...s, files: s.files.map((f, idx) => idx === fi ? { ...f, selected: !f.selected } : f)
      }));
    };

    const rejectLabel: Record<RejectReason, string> = {
      ok: "", pending: "?", blur: "흔들림", dark: "어두움", overexposed: "노출과다",
    };

    const displayFiles = viewMode === "candidates"
      ? sc.files.map((f, i) => ({ f, i })).filter(({ f }) => f.rejectReason === "ok" && (f.dupGroupId === null || f.isDupRep))
      : viewMode === "rejected"
      ? sc.files.map((f, i) => ({ f, i })).filter(({ f }) => f.rejectReason !== "ok" && f.rejectReason !== "pending")
      : sc.files.map((f, i) => ({ f, i })).filter(({ f }) => f.dupGroupId !== null && !f.isDupRep);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Scene tabs */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {scenes.map((s, i) => (
            <button key={i} onClick={() => { setActiveScene(i); setViewMode("candidates"); }} style={{
              padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${i === activeScene ? C.teal : C.border}`,
              background: i === activeScene ? C.light : C.white, fontSize: 12, fontWeight: i === activeScene ? 800 : 600,
              color: i === activeScene ? C.teal : C.muted, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}>
              {s.editedName || s.originalName}
            </button>
          ))}
        </div>

        {/* Scene stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {[
            { label: "전체 JPG", value: total },
            { label: "1차 제외", value: rejected.length, color: C.red },
            { label: "중복 제거", value: dups.length, color: C.yellow },
            { label: "선택됨", value: selected, color: C.green },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: C.white, borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: color ?? C.teal }}>{value}</div>
              <div style={{ fontSize: 10, color: C.hint, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* View mode selector */}
        <div style={{ display: "flex", gap: 6 }}>
          {([
            ["candidates", `후보 (${candidates.length})`],
            ["rejected", `제외 (${rejected.length})`],
            ["duplicates", `중복 (${dups.length})`],
          ] as const).map(([mode, lbl]) => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{
              padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${viewMode === mode ? C.teal : C.border}`,
              background: viewMode === mode ? C.light : C.white, fontSize: 12, fontWeight: viewMode === mode ? 800 : 600,
              color: viewMode === mode ? C.teal : C.muted, cursor: "pointer", fontFamily: "inherit",
            }}>{lbl}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => setScenes(prev => prev.map((s, i) => i !== activeScene ? s : { ...s, files: s.files.map(f => ({ ...f, selected: f.rejectReason === "ok" && (f.dupGroupId === null || f.isDupRep) })) }))}
            style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.white, fontSize: 11, cursor: "pointer", color: C.muted, fontFamily: "inherit" }}>
            기본 선택으로
          </button>
        </div>

        {/* Photo grid */}
        {displayFiles.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: C.hint, fontSize: 13 }}>해당 항목 없음</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
            {displayFiles.map(({ f, i }) => (
              <div
                key={f.name}
                onClick={() => viewMode === "candidates" && toggleFile(i)}
                style={{
                  borderRadius: 10, overflow: "hidden", border: `2px solid ${f.selected && viewMode === "candidates" ? C.teal : C.border}`,
                  cursor: viewMode === "candidates" ? "pointer" : "default",
                  background: C.white, position: "relative",
                }}
              >
                {f.thumbUrl ? (
                  <img src={f.thumbUrl} alt={f.name} style={{ width: "100%", aspectRatio: "3/2", objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", aspectRatio: "3/2", background: C.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: C.hint }}>로드 중</div>
                )}
                <div style={{ padding: "5px 8px" }}>
                  <div style={{ fontSize: 9, color: C.hint, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                    {f.blurScore !== null && <span style={{ fontSize: 8, background: C.light, color: C.teal, padding: "1px 4px", borderRadius: 4 }}>선명 {f.blurScore.toFixed(0)}</span>}
                    {f.rejectReason !== "ok" && f.rejectReason !== "pending" && <span style={{ fontSize: 8, background: "#FEE2E2", color: C.red, padding: "1px 4px", borderRadius: 4 }}>{rejectLabel[f.rejectReason]}</span>}
                    {f.dupGroupId && <span style={{ fontSize: 8, background: "#FEF3C7", color: C.yellow, padding: "1px 4px", borderRadius: 4 }}>{f.isDupRep ? "대표" : "중복"}</span>}
                  </div>
                </div>
                {viewMode === "candidates" && (
                  <div style={{ position: "absolute", top: 6, right: 6, width: 18, height: 18, borderRadius: "50%", background: f.selected ? C.teal : "rgba(255,255,255,.8)", border: `2px solid ${f.selected ? C.teal : C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {f.selected && <span style={{ color: "#fff", fontSize: 10, fontWeight: 900 }}>✓</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
          <Btn variant="secondary" onClick={() => setStep(2)}>← 뒤로</Btn>
          <Btn onClick={runRawCopy} disabled={scenes.every(s => s.files.filter(f => f.selected).length === 0)}>
            RAW_SELECT 생성 ({scenes.reduce((s, sc) => s + sc.files.filter(f => f.selected).length, 0)}장) →
          </Btn>
        </div>
      </div>
    );
  };

  /* ── STEP 5 ─────────────────────────────────────────────── */
  const Step5 = () => {
    const pct = progress.total > 0 ? Math.round((progress.cur / progress.total) * 100) : 0;
    return (
      <div style={{ maxWidth: 680 }}>
        <Card>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 900, color: C.teal }}>📦 RAW 파일 복사 중...</div>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{progress.cur} / {progress.total}개</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: C.teal, borderRadius: 4, transition: "width .2s" }} />
            </div>
            <div style={{ fontSize: 11, color: C.hint, marginBottom: 12 }}>{progress.msg}</div>
            <div style={{ maxHeight: 260, overflowY: "auto", fontSize: 11, fontFamily: "monospace", background: "#F8FFFE", borderRadius: 8, padding: 12, border: `1px solid ${C.border}` }}>
              {copyLog.slice(-40).map((line, i) => <div key={i} style={{ color: line.startsWith("✅") ? C.green : line.startsWith("❌") ? C.red : C.yellow }}>{line}</div>)}
            </div>
          </div>
        </Card>
      </div>
    );
  };

  /* ── STEP 6 ─────────────────────────────────────────────── */
  const Step6 = () => {
    if (!stats) return null;
    const rows = [
      { label: "처리된 씬", value: stats.totalScenes },
      { label: "전체 JPG", value: stats.totalJpg },
      { label: "1차 제외", value: stats.totalRejected, color: C.red },
      { label: "중복 제거", value: stats.totalDuplicateRemoved, color: C.yellow },
      { label: "최종 선택", value: stats.totalSelected, color: C.teal },
      { label: "RAW 복사 완료", value: stats.totalRawCopied, color: C.green },
      { label: "RAW 누락", value: stats.totalRawMissing, color: stats.totalRawMissing > 0 ? C.red : C.hint },
    ];
    return (
      <div style={{ maxWidth: 560 }}>
        <Card>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 900, color: C.green }}>✅ 작업 완료!</div>
          <div style={{ padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {rows.map(({ label, value, color }) => (
                <div key={label} style={{ background: C.bg, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: color ?? C.txt }}>{value}</div>
                  <div style={{ fontSize: 10, color: C.hint, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>📁 결과 폴더: <span style={{ fontFamily: "monospace", color: C.teal }}>{outputDir?.name}/RAW_SELECT</span></div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>📊 리포트: <span style={{ fontFamily: "monospace", color: C.teal }}>{outputDir?.name}/AI_SELECT_REPORT</span></div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { label: "RAW 매칭 리포트", file: "raw_match_report" },
                { label: "선택 JPG 목록", file: "selected_jpg_list" },
                { label: "제외 사진 목록", file: "rejected_photos" },
              ].map(({ label, file }) => (
                <Btn key={file} variant="secondary" onClick={() => {
                  const rows2 = file === "raw_match_report"
                    ? scenes.flatMap(s => s.files.filter(f => f.selected).map(f => [s.editedName, f.name, f.rawFile ?? "", f.rawStatus ?? "", f.rawFile ? `RAW_SELECT/${s.editedName}/${f.rawFile}` : ""]))
                    : file === "selected_jpg_list"
                    ? scenes.flatMap(s => s.files.filter(f => f.selected).map(f => [s.editedName, f.name, f.blurScore?.toFixed(1) ?? "", f.brightness?.toFixed(0) ?? "", f.dupGroupId ?? "", f.isDupRep ? "Y" : "", f.rawStatus ?? ""]))
                    : scenes.flatMap(s => s.files.filter(f => f.rejectReason !== "ok" && f.rejectReason !== "pending").map(f => [s.editedName, f.name, f.rejectReason, f.blurScore?.toFixed(1) ?? "", f.brightness?.toFixed(0) ?? ""]));
                  const headers2 = file === "raw_match_report" ? ["씬", "JPG", "RAW", "상태", "경로"]
                    : file === "selected_jpg_list" ? ["씬", "JPG", "블러", "밝기", "중복그룹", "대표컷", "RAW 상태"]
                    : ["씬", "JPG", "제외 사유", "블러", "밝기"];
                  downloadCSV(makeCSV(headers2, rows2), `${file}.csv`);
                }}>
                  ↓ {label}
                </Btn>
              ))}
              <Btn onClick={() => { setStep(0); setScenes([]); setJpgDir(null); setRawDir(null); setOutputDir(null); setCopyLog([]); setStats(null); }}>
                처음으로
              </Btn>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  /* ── Layout ─────────────────────────────────────────────── */
  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.txt }}>
      {/* Banner */}
      <div style={{ background: "linear-gradient(135deg, #1A4F4C 0%, #155855 100%)", color: "#fff", padding: "18px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 900 }}>🎯 AI 컷 정리 & RAW 셀렉</h1>
          <p style={{ margin: "6px 0 0", fontSize: 11, lineHeight: 1.7, opacity: 0.8, maxWidth: 660 }}>
            AI가 최종 사진을 대신 고르는 기능이 아닙니다. 눈 감은 컷·흔들린 컷·조명 문제 컷·중복컷을 먼저 정리하고, 남은 JPG와 같은 파일명의 RAW를 자동으로 SELECT 폴더에 모아주는 셀렉 보조 기능입니다.
          </p>
        </div>
      </div>

      {renderStepIndicator()}

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px 80px" }}>
        {step === 0 && <Step0 />}
        {step === 1 && <Step1 />}
        {step === 2 && <Step2 />}
        {step === 3 && <Step3 />}
        {step === 4 && <Step4 />}
        {step === 5 && <Step5 />}
        {step === 6 && <Step6 />}
      </div>
    </div>
  );
}
