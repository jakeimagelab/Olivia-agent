"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

/* ════════════════════════════════════════════════
   SHARED TYPES
═══════════════════════════════════════════════ */
type PhotoMode = "field" | "studio";

interface ScannedFile {
  name: string; basename: string;
  handle: FileSystemFileHandle; mtime: number;
  visualVec: number[]; // 16×16 grayscale thumbnail vector for scene-change detection
}

/* ── Field-mode types ── */
type RejectReason = "ok" | "pending" | "blur" | "dark" | "overexposed" | "eyes_closed";
type SelectCount  = 3 | 5 | 7 | 10 | 0;
type ExpressionType = "smile" | "focused" | "neutral" | "bad" | null;

interface PhotoFile {
  name: string; basename: string;
  handle: FileSystemFileHandle; mtime: number;
  thumbUrl: string | null;
  blurScore: number | null; brightness: number | null; hash: string | null;
  rejectReason: RejectReason; selected: boolean;
  dupGroupId: string | null; isDupRep: boolean;
  isPortraitLike: boolean;
  expressionScore: number | null;   // AI 표정 점수 0~1
  expressionType: ExpressionType;   // AI 표정 유형
}

interface Scene {
  index: number; originalName: string; suggestedName: string; editedName: string;
  files: PhotoFile[]; selectCount: SelectCount; nameLoading: boolean;
  nameConfidence?: number; nameReason?: string;
  sceneDir: FileSystemDirectoryHandle | null;
}

interface FieldStats {
  totalJpg: number; totalRaw: number; totalScenes: number;
  totalRejected: number; totalDupRemoved: number; totalSelected: number;
  totalRawCopied: number; totalRawMissing: number;
}

/* ── Studio-mode types ── */
type StudioLightingStatus = "normal" | "etc_dark" | "etc_black" | "etc_test";
type StudioPoseType       = "Standing" | "Sitting" | "Unknown";
type StudioInnerWear      = "셔츠" | "넥타이셔츠" | "스크럽" | "블라우스" | "탑" | "기타";
type LightingSensitivity  = "loose" | "medium" | "strict";

interface StudioOptions {
  lightingSensitivity: LightingSensitivity;
}

interface StudioPhotoFile {
  name: string; basename: string;
  handle: FileSystemFileHandle; mtime: number;
  thumbUrl: string | null; brightness: number | null;
  lightingStatus: StudioLightingStatus;
  hasGown: boolean; innerWear: StudioInnerWear;
  clothingLabel: string; // computed display string
  poseType: StudioPoseType;
  isFamilyProfile: boolean; confidence: number;
  analyzed: boolean; groupKey: string;
}

interface StudioGroup {
  key: string; clothingLabel: string; poseType: StudioPoseType;
  isFamilyProfile: boolean; files: StudioPhotoFile[];
  suggestedFolderName: string; editedFolderName: string;
  index: number; isEtc: boolean;
}

interface StudioStats {
  totalJpg: number; totalRaw: number; totalGroups: number;
  totalEtc: number; totalNormal: number;
  totalRawMatched: number; totalRawMissing: number;
}

/* ════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
const RAW_EXTS = new Set(["arw","cr3","cr2","nef","raf","dng","orf","rw2"]);
const JPG_EXTS = new Set(["jpg","jpeg"]);

const FIELD_STEPS  = ["폴더 선택","파일 분류","씬 검토·승인","AI 분석","후보 선택","파일 정리","완료"];
const STUDIO_STEPS = ["폴더 선택","파일 분류","AI 분석","그룹 검토·승인","그룹 확인","파일 정리","완료"];

const C = {
  teal:"#155855", orange:"#E85D2C", green:"#22876A",
  white:"#FFFFFF", border:"rgba(21,88,85,.12)", muted:"#5A7470",
  hint:"#9BB5B0", txt:"#1C2B28", light:"#EAF4F2", bg:"#EDF5F3",
  red:"#DC2626", yellow:"#D97706", purple:"#7C3AED",
};

const STUDIO_LIGHTING_SENSITIVITY: Record<LightingSensitivity, string> = {
  loose:  "느슨함 — 거의 시꺼먼 컷만 ETC",
  medium: "보통 — 얼굴이 명확히 어두운 컷 ETC (권장)",
  strict: "강함 — 얼굴 밝기가 조금만 낮아도 ETC",
};

/* ════════════════════════════════════════════════
   SHARED HELPERS
═══════════════════════════════════════════════ */
async function loadThumb(file: File, size = 120): Promise<string | null> {
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(size / img.width, size / img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

async function copyFileHandle(src: FileSystemFileHandle, dest: FileSystemDirectoryHandle, name: string) {
  const file = await src.getFile();
  const buf  = await file.arrayBuffer();
  const fh   = await (dest as any).getFileHandle(name, { create: true });
  const wr   = await fh.createWritable();
  await wr.write(buf); await wr.close();
}

// 폴더 이름 변경: 파일을 새 폴더로 이동 후 기존 폴더 삭제
async function renameDirHandle(parentDir: any, oldName: string, newName: string, srcDir: any): Promise<FileSystemDirectoryHandle> {
  if (oldName === newName) return srcDir as FileSystemDirectoryHandle;
  const newDir = await parentDir.getDirectoryHandle(newName, { create: true });
  const entries: [string, FileSystemFileHandle][] = [];
  for await (const [fname, fhandle] of srcDir.entries()) {
    if (fhandle.kind === "file") entries.push([fname, fhandle as FileSystemFileHandle]);
  }
  for (const [fname, fhandle] of entries) {
    await copyFileHandle(fhandle, newDir as FileSystemDirectoryHandle, fname);
    await srcDir.removeEntry(fname);
  }
  try { await parentDir.removeEntry(oldName); } catch {}
  return newDir as FileSystemDirectoryHandle;
}

function makeCSV(headers: string[], rows: string[][]): string {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  return [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

/* ════════════════════════════════════════════════
   FIELD-MODE HELPERS
═══════════════════════════════════════════════ */
async function analyzeJpg(file: File): Promise<{ blurScore: number; brightness: number; hash: string; thumbUrl: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const MAX = 280;
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d")!; ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const gray = new Float32Array(w * h); let brightSum = 0;
      for (let i = 0; i < gray.length; i++) {
        const v = 0.299*data[i*4]+0.587*data[i*4+1]+0.114*data[i*4+2];
        gray[i] = v; brightSum += v;
      }
      const brightness = brightSum / gray.length;
      let lapSum = 0, lapCount = 0;
      for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++) {
        const c = y*w+x;
        const lap = gray[c]*4-gray[(y-1)*w+x]-gray[(y+1)*w+x]-gray[y*w+(x-1)]-gray[y*w+(x+1)];
        lapSum += lap*lap; lapCount++;
      }
      const blurScore = lapCount > 0 ? Math.sqrt(lapSum/lapCount) : 0;
      const hc = document.createElement("canvas"); hc.width = 8; hc.height = 8;
      hc.getContext("2d")!.drawImage(img, 0, 0, 8, 8);
      const hd = hc.getContext("2d")!.getImageData(0, 0, 8, 8).data;
      const hGray = Array.from({length:64}, (_,i) => 0.299*hd[i*4]+0.587*hd[i*4+1]+0.114*hd[i*4+2]);
      const hMean = hGray.reduce((a,b)=>a+b,0)/64;
      const hash = hGray.map(v => v>=hMean?"1":"0").join("");
      const tc = document.createElement("canvas");
      const ts = Math.min(160/img.width, 160/img.height, 1);
      tc.width = Math.round(img.width*ts); tc.height = Math.round(img.height*ts);
      tc.getContext("2d")!.drawImage(img, 0, 0, tc.width, tc.height);
      URL.revokeObjectURL(url);
      resolve({ blurScore, brightness, hash, thumbUrl: tc.toDataURL("image/jpeg", 0.72) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load fail")); };
    img.src = url;
  });
}

function hammingDist(a: string, b: string) {
  let d = 0; for (let i = 0; i < Math.min(a.length,b.length); i++) if (a[i]!==b[i]) d++; return d;
}

function applyDuplicates(files: PhotoFile[]): PhotoFile[] {
  const maxDist = Math.round(64*0.05);
  const result = files.map(f => ({...f, dupGroupId: null as string|null, isDupRep: false}));
  let gid = 0;
  for (let i = 0; i < result.length; i++) {
    if (!result[i].hash||result[i].dupGroupId!==null||result[i].rejectReason!=="ok") continue;
    const group = [i];
    for (let j = i+1; j < result.length; j++) {
      if (!result[j].hash||result[j].dupGroupId!==null||result[j].rejectReason!=="ok") continue;
      if (hammingDist(result[i].hash!, result[j].hash!) <= maxDist) group.push(j);
    }
    if (group.length > 1) {
      const gname = `g${++gid}`;
      let rep = group[0];
      for (const idx of group) if ((result[idx].blurScore??0)>(result[rep].blurScore??0)) rep=idx;
      for (const idx of group) { result[idx].dupGroupId=gname; result[idx].isDupRep=(idx===rep); }
    }
  }
  return result;
}

async function getApiThumb(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(480/img.width, 480/img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width*scale); c.height = Math.round(img.height*scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(); };
    img.src = url;
  });
}

/* ════════════════════════════════════════════════
   STUDIO-MODE HELPERS
═══════════════════════════════════════════════ */
async function getStudioThumb(file: File, maxSize = 480): Promise<string> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(maxSize/img.width, maxSize/img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width*s); c.height = Math.round(img.height*s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("load")); };
    img.src = url;
  });
}

async function quickVisualVector(file: File): Promise<number[]> {
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = 16; c.height = 16;
      c.getContext("2d")!.drawImage(img, 0, 0, 16, 16);
      const d = c.getContext("2d")!.getImageData(0, 0, 16, 16).data;
      const v: number[] = [];
      for (let i = 0; i < d.length; i += 4)
        v.push((0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]) / 255);
      URL.revokeObjectURL(url); res(v);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res([]); };
    img.src = url;
  });
}

function visualDist(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length; // 0~1, 클수록 장면 차이 큼
}

async function computePortraitScore(file: File): Promise<number> {
  // Returns 0-1. ≥0.58 → 카메라 정면 응시 프로필 컷으로 판단
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const W = 32, H = 32;
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      c.getContext("2d")!.drawImage(img, 0, 0, W, H);
      const d = c.getContext("2d")!.getImageData(0, 0, W, H).data;
      const lum = Array.from({length: W*H}, (_,i) =>
        (0.299*d[i*4] + 0.587*d[i*4+1] + 0.114*d[i*4+2]) / 255
      );
      // 1. 좌우 대칭도 (상단 절반 — 얼굴 영역)
      let symDiff = 0;
      for (let y = 2; y < 16; y++) for (let x = 0; x < 16; x++)
        symDiff += Math.abs(lum[y*W+x] - lum[y*W+(W-1-x)]);
      const symmetry = 1 - Math.min(symDiff / (14 * 16 * 0.5), 1);
      // 2. 가로 무게중심 (중앙일수록 프로필)
      let wx = 0, wt = 0;
      for (let y = 2; y < 18; y++) for (let x = 0; x < W; x++) {
        wx += x * lum[y*W+x]; wt += lum[y*W+x];
      }
      const cx = wt > 0 ? wx / wt / W : 0.5;
      const centeredness = Math.max(0, 1 - Math.abs(cx - 0.5) * 4);
      // 3. 장면 단순도 (분산 낮을수록 깔끔한 배경 — 프로필)
      const mean = lum.reduce((s,v)=>s+v,0)/lum.length;
      const variance = lum.reduce((s,v)=>s+(v-mean)**2,0)/lum.length;
      const simplicity = 1 - Math.min(variance * 5, 1);
      URL.revokeObjectURL(url);
      res(symmetry*0.40 + centeredness*0.35 + simplicity*0.25);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(0); };
    img.src = url;
  });
}

async function quickBrightness(file: File): Promise<number> {
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = 64; c.height = 64;
      c.getContext("2d")!.drawImage(img, 0, 0, 64, 64);
      const d = c.getContext("2d")!.getImageData(0, 0, 64, 64).data;
      let sum = 0;
      for (let i = 0; i < d.length; i+=4) sum += 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
      URL.revokeObjectURL(url); res(sum/(64*64));
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(128); };
    img.src = url;
  });
}

function computeClothingLabel(hasGown: boolean, innerWear: StudioInnerWear, isFamilyProfile: boolean): string {
  if (isFamilyProfile) return "가족프로필";
  return hasGown ? `가운+${innerWear}` : innerWear;
}

function computeGroupKey(hasGown: boolean, innerWear: StudioInnerWear, poseType: StudioPoseType, isFamilyProfile: boolean): string {
  if (isFamilyProfile) return `가족프로필_${poseType}`;
  return `${hasGown ? "가운" : "노가운"}_${innerWear}_${poseType}`;
}

function createStudioFolderName(index: number, clothingLabel: string, poseType: StudioPoseType, isFamilyProfile: boolean): string {
  const prefix = String(index).padStart(2, "0");
  const type = isFamilyProfile ? "가족프로필" : "프로필";
  const clean = clothingLabel.replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, "");
  return poseType === "Unknown" ? `${prefix}_${type}_${clean}` : `${prefix}_${type}_${clean}_${poseType}`;
}

function buildStudioGroups(files: StudioPhotoFile[]): StudioGroup[] {
  const etcFiles    = files.filter(f => f.groupKey === "__ETC__");
  const normalFiles = files.filter(f => f.groupKey !== "__ETC__");

  // 같은 groupKey는 촬영 순서 무관하게 하나로 합산
  const groupMap = new Map<string, StudioPhotoFile[]>();
  const keyOrder: string[] = [];
  for (const f of normalFiles) {
    if (!groupMap.has(f.groupKey)) { groupMap.set(f.groupKey, []); keyOrder.push(f.groupKey); }
    groupMap.get(f.groupKey)!.push(f);
  }

  const groups: StudioGroup[] = [];
  let idx = 1;
  for (const key of keyOrder) {
    const groupFiles = groupMap.get(key)!;
    const first = groupFiles[0];
    const isFamily = groupFiles.some(f => f.isFamilyProfile);
    const folderName = createStudioFolderName(idx, first.clothingLabel, first.poseType, isFamily);
    groups.push({
      key, clothingLabel: first.clothingLabel, poseType: first.poseType,
      isFamilyProfile: isFamily, files: groupFiles,
      suggestedFolderName: folderName, editedFolderName: folderName,
      index: idx, isEtc: false,
    });
    idx++;
  }

  if (etcFiles.length > 0) {
    groups.unshift({
      key: "__ETC__", clothingLabel: "조명불량", poseType: "Unknown",
      isFamilyProfile: false, files: etcFiles,
      suggestedFolderName: "00_ETC_조명불량", editedFolderName: "00_ETC_조명불량",
      index: 0, isEtc: true,
    });
  }

  return groups;
}

/* ════════════════════════════════════════════════
   SHARED UI COMPONENTS
═══════════════════════════════════════════════ */
function Btn({ onClick, disabled, children, variant="primary", style: s }: {
  onClick?: () => void; disabled?: boolean; children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger"; style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = { height:42, padding:"0 22px", border:"none", borderRadius:10, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.5:1, transition:"opacity .15s" };
  const v = { primary:{background:C.teal,color:"#fff"}, secondary:{background:C.white,color:C.teal,border:`1.5px solid ${C.border}`}, danger:{background:C.red,color:"#fff"} };
  return <button onClick={onClick} disabled={disabled} style={{...base,...v[variant],...s}}>{children}</button>;
}

function Card({ children, style: s }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden",...s}}>{children}</div>;
}

function ProgressBar({ cur, total, msg }: { cur: number; total: number; msg: string }) {
  const pct = total > 0 ? Math.round((cur/total)*100) : 0;
  return (
    <Card>
      <div style={{padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontSize:13,fontWeight:700}}>{cur} / {total}</span>
          <span style={{fontSize:13,fontWeight:900,color:C.teal}}>{pct}%</span>
        </div>
        <div style={{height:8,background:C.border,borderRadius:4,overflow:"hidden",marginBottom:12}}>
          <div style={{height:"100%",width:`${pct}%`,background:C.teal,borderRadius:4,transition:"width .2s"}}/>
        </div>
        <div style={{fontSize:11,color:C.hint,wordBreak:"break-all"}}>{msg}</div>
      </div>
    </Card>
  );
}

function SectionPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",background:color+"18",borderRadius:20,border:`1px solid ${color}30`}}>
      <span style={{fontSize:11,fontWeight:800,color}}>{label}</span>
      <span style={{fontSize:11,fontWeight:700,color:C.muted}}>{count}장</span>
    </div>
  );
}

/* ════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
export default function PhotoSortingPage() {
  /* ── shared state ── */
  const [photoMode,  setPhotoMode]  = useState<PhotoMode>("field");
  const [step,       setStep]       = useState(0);
  const [rootDir,    setRootDir]    = useState<FileSystemDirectoryHandle | null>(null);
  const [progress,   setProgress]   = useState({ cur:0, total:0, msg:"" });
  const cancelRef = useRef(false);
  const hasFS = typeof window !== "undefined" && "showDirectoryPicker" in window;

  /* ── field state ── */
  const [gapMinutes,  setGapMinutes]  = useState(10);
  const [scenes,      setScenes]      = useState<Scene[]>([]);
  const [rawCount,    setRawCount]    = useState(0);
  const [activeScene, setActiveScene] = useState(0);
  const [copyLog,     setCopyLog]     = useState<string[]>([]);
  const [fieldStats,  setFieldStats]  = useState<FieldStats | null>(null);
  const [jpgBaseDir,  setJpgBaseDir]  = useState<FileSystemDirectoryHandle | null>(null);
  const [rawBaseDir,  setRawBaseDir]  = useState<FileSystemDirectoryHandle | null>(null);

  /* ── studio state ── */
  const [studioOpts, setStudioOpts] = useState<StudioOptions>({ lightingSensitivity:"medium" });
  const [studioFiles,  setStudioFiles]  = useState<StudioPhotoFile[]>([]);
  const [studioGroups, setStudioGroups] = useState<StudioGroup[]>([]);
  const [studioRawCount, setStudioRawCount] = useState(0);
  const [studioCopyLog,  setStudioCopyLog]  = useState<string[]>([]);
  const [studioStats,    setStudioStats]    = useState<StudioStats | null>(null);
  const [activeGroup,    setActiveGroup]    = useState(0);

  const pickDir = async () => {
    try { const h = await (window as any).showDirectoryPicker({ mode:"readwrite" }); setRootDir(h); }
    catch (_) {}
  };

  const stepLabels = photoMode === "studio" ? STUDIO_STEPS : FIELD_STEPS;

  /* ════════════════════════════════════════════
     FIELD-MODE HANDLERS
  ═══════════════════════════════════════════ */
  const handleFieldSort = useCallback(async () => {
    if (!rootDir) return;
    setStep(1); cancelRef.current = false; setCopyLog([]);
    const rawFiles: ScannedFile[] = [], jpgFiles: ScannedFile[] = [];
    setProgress({ cur:0, total:0, msg:"폴더 스캔 중..." });
    for await (const [name, handle] of (rootDir as any).entries()) {
      if (handle.kind !== "file") continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      const file = await (handle as FileSystemFileHandle).getFile();
      if (RAW_EXTS.has(ext)) {
        rawFiles.push({ name, basename:name.replace(/\.[^.]+$/,""), handle, mtime:file.lastModified, visualVec:[] });
      } else if (JPG_EXTS.has(ext)) {
        setProgress({ cur:0, total:0, msg:`스캔: ${name}` });
        const visualVec = await quickVisualVector(file);
        jpgFiles.push({ name, basename:name.replace(/\.[^.]+$/,""), handle, mtime:file.lastModified, visualVec });
      }
    }
    setRawCount(rawFiles.length);

    // ① RAW 전체 → RAW(원본)/ 이동
    const rawBase = await (rootDir as any).getDirectoryHandle("RAW(원본)", { create:true }) as FileSystemDirectoryHandle;
    setRawBaseDir(rawBase);
    for (let i = 0; i < rawFiles.length; i++) {
      const rf = rawFiles[i];
      setProgress({ cur:i, total:rawFiles.length, msg:`RAW 이동: ${rf.name}` });
      try {
        await copyFileHandle(rf.handle, rawBase, rf.name);
        try { await (rootDir as any).removeEntry(rf.name); } catch {}
        setCopyLog(prev => [...prev.slice(-30), `📁 ${rf.name} → RAW(원본)/`]);
      } catch { setCopyLog(prev => [...prev.slice(-30), `❌ RAW 이동 실패: ${rf.name}`]); }
    }

    // ② JPG → 씬 분리 후 JPG(분류)/ 하위로 이동
    jpgFiles.sort((a,b)=>a.mtime-b.mtime);
    const gapMs = gapMinutes*60*1000;
    const VIS_THRESHOLD = 0.18;
    const groups: ScannedFile[][] = jpgFiles.length > 0 ? [[jpgFiles[0]]] : [];
    for (let i = 1; i < jpgFiles.length; i++) {
      const timeBreak = jpgFiles[i].mtime - jpgFiles[i-1].mtime > gapMs;
      const visBreak  = visualDist(jpgFiles[i-1].visualVec, jpgFiles[i].visualVec) > VIS_THRESHOLD;
      if (timeBreak || visBreak) groups.push([jpgFiles[i]]);
      else groups[groups.length-1].push(jpgFiles[i]);
    }
    const jpgBase = await (rootDir as any).getDirectoryHandle("JPG(분류)", { create:true }) as FileSystemDirectoryHandle;
    setJpgBaseDir(jpgBase);
    const total = jpgFiles.length; let done = 0;
    const newScenes: Scene[] = [];
    for (let si = 0; si < groups.length; si++) {
      if (cancelRef.current) break;
      const sceneNum = String(si+1).padStart(2,"0");
      const originalName = sceneNum; // 초기 폴더명: "01", "02", ...
      const sceneDir = await (jpgBase as any).getDirectoryHandle(originalName, { create:true }) as FileSystemDirectoryHandle;
      const photoFiles: PhotoFile[] = [];
      for (const sf of groups[si]) {
        if (cancelRef.current) break;
        setProgress({ cur:done, total, msg:`씬${sceneNum} / ${sf.name}` });
        try {
          await copyFileHandle(sf.handle, sceneDir, sf.name);
          const destHandle = await (sceneDir as any).getFileHandle(sf.name) as FileSystemFileHandle;
          try { await (rootDir as any).removeEntry(sf.name); } catch {}
          const thumb = photoFiles.length < 4 ? await loadThumb(await destHandle.getFile()) : null;
          photoFiles.push({ name:sf.name, basename:sf.basename, handle:destHandle, mtime:sf.mtime, thumbUrl:thumb, blurScore:null, brightness:null, hash:null, rejectReason:"pending", selected:false, dupGroupId:null, isDupRep:false, isPortraitLike:false, expressionScore:null, expressionType:null });
        } catch {
          photoFiles.push({ name:sf.name, basename:sf.basename, handle:sf.handle, mtime:sf.mtime, thumbUrl:null, blurScore:null, brightness:null, hash:null, rejectReason:"pending", selected:false, dupGroupId:null, isDupRep:false, isPortraitLike:false, expressionScore:null, expressionType:null });
        }
        done++; setCopyLog(prev => [...prev.slice(-30), `✅ ${sf.name} → JPG(분류)/씬${sceneNum}`]);
      }
      newScenes.push({ index:si+1, originalName, suggestedName:originalName, editedName:originalName, files:photoFiles, selectCount:5, nameLoading:true, sceneDir });
    }
    setScenes(newScenes);
    setProgress({ cur:total, total, msg:"씬 분류 완료 — AI 씬 이름 분석 중..." });
    setStep(2);

    // ③ AI 씬 이름 지정 + 폴더 이름 변경: "01" → "01. 씬이름"
    const updated = newScenes.map(s=>({...s}));
    for (let i = 0; i < updated.length; i++) {
      try {
        const sampleFiles = updated[i].files.slice(0,4);
        const thumbs: string[] = [];
        for (const pf of sampleFiles) thumbs.push(await getApiThumb(await pf.handle.getFile()));
        const res = await fetch("/api/scene-naming", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ thumbnails:thumbs, originalName:updated[i].originalName }) });
        const data = await res.json();
        if (data.ok && data.name) {
          const num = String(updated[i].index).padStart(2,"0");
          const suggested = `${num}. ${data.name}`;
          const newSceneDir = await renameDirHandle(jpgBase, updated[i].originalName, suggested, updated[i].sceneDir as any);
          const newFiles = updated[i].files.map(f => ({...f}));
          for (const pf of newFiles) {
            try { pf.handle = await (newSceneDir as any).getFileHandle(pf.name) as FileSystemFileHandle; } catch {}
          }
          updated[i] = {...updated[i], suggestedName:suggested, editedName:suggested, nameLoading:false, nameConfidence:data.confidence, nameReason:data.reason, sceneDir:newSceneDir, files:newFiles};
        } else { updated[i] = {...updated[i], nameLoading:false}; }
      } catch { updated[i] = {...updated[i], nameLoading:false}; }
      setScenes([...updated]);
    }
  }, [rootDir, gapMinutes]);

  const runFieldAnalysis = useCallback(async () => {
    setStep(3); cancelRef.current = false;
    const total = scenes.reduce((s,sc)=>s+sc.files.length,0); let done = 0;
    const updated = scenes.map(s=>({...s, files:s.files.map(f=>({...f}))}));

    // ① 1차: Canvas 분석 (선명도·밝기·해시) — 순차
    for (let si = 0; si < updated.length; si++) {
      for (let fi = 0; fi < updated[si].files.length; fi++) {
        if (cancelRef.current) break;
        const pf = updated[si].files[fi];
        setProgress({ cur:done, total, msg:`선명도 분석: ${pf.name}` });
        try {
          const file = await pf.handle.getFile();
          const { blurScore, brightness, hash, thumbUrl } = await analyzeJpg(file);
          let rejectReason: RejectReason = "ok";
          if (blurScore < 18)   rejectReason = "blur";
          else if (brightness < 38)  rejectReason = "dark";
          else if (brightness > 230) rejectReason = "overexposed";
          const portraitScore = await computePortraitScore(file);
          const isPortraitLike = portraitScore >= 0.58;
          updated[si].files[fi] = {...pf, blurScore, brightness, hash, thumbUrl, rejectReason, isPortraitLike};
        } catch { updated[si].files[fi] = {...pf, rejectReason:"ok"}; }
        done++;
      }
      updated[si].files = applyDuplicates(updated[si].files);
      setScenes([...updated]);
    }

    // ② 2차: AI 표정·눈감힘 분석 — 8개 병렬 (기술 필터 통과한 사진만)
    setProgress({ cur:0, total, msg:"AI 표정 분석 중..." });
    const CONC = 8;
    for (let si = 0; si < updated.length; si++) {
      const okIndices = updated[si].files
        .map((f, i) => ({ f, i }))
        .filter(({ f }) => f.rejectReason === "ok");

      for (let bi = 0; bi < okIndices.length; bi += CONC) {
        if (cancelRef.current) break;
        const batch = okIndices.slice(bi, bi + CONC);
        setProgress({ cur:bi, total:okIndices.length, msg:`${updated[si].editedName || updated[si].originalName} 표정 분석 (${bi+1}/${okIndices.length})` });
        await Promise.all(batch.map(async ({ f, i }) => {
          try {
            const file = await f.handle.getFile();
            const thumb = await getApiThumb(file);
            const res = await fetch("/api/photo-quality", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ thumbnail: thumb }),
            });
            const data = await res.json();
            if (data.ok) {
              const rejectReason: RejectReason = data.eyesClosed ? "eyes_closed" : f.rejectReason;
              updated[si].files[i] = {
                ...updated[si].files[i],
                rejectReason,
                expressionScore: data.expressionScore ?? null,
                expressionType: data.expressionType ?? null,
              };
            }
          } catch {}
        }));
      }
      setScenes([...updated]);
    }

    setProgress({ cur:total, total, msg:"분석 완료" });

    // ③ 자동 선택: 눈감힘 제외 후 표정 점수 → 선명도 순
    const withSel = updated.map(sc => {
      const cands = sc.files.filter(f =>
        f.rejectReason === "ok" && (f.dupGroupId === null || f.isDupRep)
      );
      const n = sc.selectCount === 0 ? cands.length : Math.min(sc.selectCount, cands.length);
      const topNames = new Set(
        [...cands].sort((a, b) => {
          const eDiff = (b.expressionScore ?? 0) - (a.expressionScore ?? 0);
          if (Math.abs(eDiff) > 0.1) return eDiff;
          return (b.blurScore ?? 0) - (a.blurScore ?? 0);
        }).slice(0, n).map(f => f.name)
      );
      return { ...sc, files: sc.files.map(f => ({ ...f, selected: topNames.has(f.name) })) };
    });
    setScenes(withSel); setStep(4);
  }, [scenes]);

  const runFieldOutput = useCallback(async () => {
    if (!rootDir || !jpgBaseDir || !rawBaseDir) return;
    setStep(5); cancelRef.current = false;
    const log: string[] = [], rawMatchRows: string[][] = [];

    // RAW 인덱스: RAW(원본)/ 에서 스캔
    const rawIndex = new Map<string, FileSystemFileHandle>();
    for await (const [name, handle] of (rawBaseDir as any).entries()) {
      if (handle.kind !== "file") continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (RAW_EXTS.has(ext)) rawIndex.set(name.replace(/\.[^.]+$/,"").toLowerCase(), handle as FileSystemFileHandle);
    }
    const selectedRawDir = await (rawBaseDir as any).getDirectoryHandle("SelectedRAW", { create:true }) as FileSystemDirectoryHandle;

    const selectedTotal = scenes.reduce((s,sc)=>s+sc.files.filter(f=>f.selected).length,0);
    let processed = 0, rawCopied = 0, rawMissing = 0;
    const updated = scenes.map(s=>({...s, files:s.files.map(f=>({...f}))}));
    let portraitOutDir: FileSystemDirectoryHandle | null = null;

    for (let si = 0; si < updated.length; si++) {
      const sc = updated[si];
      const sceneNum = String(sc.index).padStart(2,"0");
      const sceneName = sc.editedName || sc.originalName;
      // 선택 파일 폴더: 씬 폴더 내부에 Selected[XX]/ 생성
      const selectedSubDir = await (sc.sceneDir as any).getDirectoryHandle(`Selected${sceneNum}`, { create:true }) as FileSystemDirectoryHandle;

      for (let fi = 0; fi < sc.files.length; fi++) {
        if (!sc.files[fi].selected) continue;
        if (cancelRef.current) break;
        const pf = sc.files[fi];
        setProgress({ cur:processed, total:selectedTotal, msg:`파일 정리: ${pf.name}` });

        // 프로필 컷 → JPG(분류)/프로필/
        let destJpgDir: FileSystemDirectoryHandle = selectedSubDir;
        if (pf.isPortraitLike) {
          if (!portraitOutDir) portraitOutDir = await (jpgBaseDir as any).getDirectoryHandle("프로필", { create:true }) as FileSystemDirectoryHandle;
          destJpgDir = portraitOutDir;
        }
        try {
          await copyFileHandle(pf.handle, destJpgDir, pf.name);
          try { await (sc.sceneDir as any).removeEntry(pf.name); } catch {}
          log.push(`✅ JPG${pf.isPortraitLike?" [프로필]":""}: ${pf.name}`);
        } catch { log.push(`❌ JPG: ${pf.name} 실패`); }

        // 매칭 RAW: RAW(원본)/에서 찾아 SelectedRAW/로 이동
        const rawHandle = rawIndex.get(pf.basename.toLowerCase());
        if (rawHandle) {
          try {
            const rawFile = await rawHandle.getFile();
            await copyFileHandle(rawHandle, selectedRawDir, rawFile.name);
            try { await (rawBaseDir as any).removeEntry(rawFile.name); } catch {}
            log.push(`✅ RAW: ${rawFile.name}`);
            rawMatchRows.push([pf.isPortraitLike?"프로필":sceneName, pf.name, rawFile.name, "이동 완료"]); rawCopied++;
          } catch { log.push(`❌ RAW: ${pf.basename} 이동 실패`); rawMatchRows.push([sceneName, pf.name, "", "실패"]); }
        } else { log.push(`⚠️ RAW: ${pf.basename} 없음`); rawMatchRows.push([sceneName, pf.name, "", "누락"]); rawMissing++; }
        processed++; setCopyLog([...log]);
      }
      setScenes([...updated]);
    }
    // 리포트: JPG(분류)/_AI_REPORT/ 에 저장
    const reportDir = await (jpgBaseDir as any).getDirectoryHandle("_AI_REPORT", { create:true });
    const wr = async (name: string, content: string) => {
      try { const fh = await (reportDir as any).getFileHandle(name,{create:true}); const w = await fh.createWritable(); await w.write("﻿"+content); await w.close(); } catch {}
    };
    await wr("raw_match_report.csv", makeCSV(["씬","선택JPG","RAW","상태"], rawMatchRows));
    setFieldStats({ totalJpg:scenes.reduce((s,sc)=>s+sc.files.length,0), totalRaw:rawCount, totalScenes:scenes.length, totalRejected:scenes.reduce((s,sc)=>s+sc.files.filter(f=>f.rejectReason!=="ok"&&f.rejectReason!=="pending").length,0), totalDupRemoved:scenes.reduce((s,sc)=>s+sc.files.filter(f=>f.dupGroupId!==null&&!f.isDupRep).length,0), totalSelected:scenes.reduce((s,sc)=>s+sc.files.filter(f=>f.selected).length,0), totalRawCopied:rawCopied, totalRawMissing:rawMissing });
    setStep(6);
  }, [scenes, rootDir, jpgBaseDir, rawBaseDir, rawCount]);

  /* ════════════════════════════════════════════
     STUDIO-MODE HANDLERS
  ═══════════════════════════════════════════ */
  const handleStudioSort = useCallback(async () => {
    if (!rootDir) return;
    setStep(1); cancelRef.current = false;
    setProgress({ cur:0, total:0, msg:"폴더 스캔 중..." });
    const rawFiles: ScannedFile[] = [], jpgFiles: ScannedFile[] = [];
    for await (const [name, handle] of (rootDir as any).entries()) {
      if (handle.kind !== "file") continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      const file = await (handle as FileSystemFileHandle).getFile();
      const entry: ScannedFile = { name, basename:name.replace(/\.[^.]+$/,""), handle, mtime:file.lastModified, visualVec:[] };
      if (RAW_EXTS.has(ext)) rawFiles.push(entry);
      else if (JPG_EXTS.has(ext)) jpgFiles.push(entry);
    }
    setStudioRawCount(rawFiles.length);
    jpgFiles.sort((a,b)=>a.mtime-b.mtime);
    const total = jpgFiles.length; let done = 0;
    const files: StudioPhotoFile[] = [];
    for (const sf of jpgFiles) {
      setProgress({ cur:done, total, msg:`스캔: ${sf.name}` });
      const file = await sf.handle.getFile();
      const thumb = await loadThumb(file, 100);
      const brightness = await quickBrightness(file);
      files.push({ name:sf.name, basename:sf.basename, handle:sf.handle, mtime:sf.mtime, thumbUrl:thumb, brightness, lightingStatus:"normal", hasGown:false, innerWear:"기타", clothingLabel:"미분류", poseType:"Unknown", isFamilyProfile:false, confidence:0, analyzed:false, groupKey:"__PENDING__" });
      done++;
    }
    setStudioFiles(files);
    setProgress({ cur:total, total, msg:`파일 분류 완료 — JPG ${jpgFiles.length}장 / RAW ${rawFiles.length}개` });
    setStep(2);
    // AI Vision analysis
    await runStudioAnalysis(files);
  }, [rootDir, studioOpts]);

  const runStudioAnalysis = async (files: StudioPhotoFile[]) => {
    const total = files.length; let done = 0;
    const CONCURRENCY = 8;
    const result = files.map(f => ({...f}));
    const indices = Array.from({length: total}, (_, i) => i);
    let qi = 0;

    const worker = async () => {
      while (qi < indices.length) {
        const idx = indices[qi++];
        const file = result[idx];
        setProgress({ cur:done, total, msg:`AI 분석: ${file.name}` });
        try {
          const f = await file.handle.getFile();
          const thumb = await getStudioThumb(f);
          const res = await fetch("/api/studio-analysis", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ thumbnail:thumb, lightingSensitivity:studioOpts.lightingSensitivity }),
          });
          const data = await res.json();
          if (data.ok) {
            const isEtc = data.lightingStatus !== "normal";
            const hasGown: boolean = data.hasGown ?? false;
            const innerWear: StudioInnerWear = (["셔츠","넥타이셔츠","스크럽","블라우스","탑","기타"] as StudioInnerWear[]).includes(data.innerWear) ? data.innerWear : "기타";
            const poseType: StudioPoseType = (["Standing","Sitting","Unknown"] as StudioPoseType[]).includes(data.poseType) ? data.poseType : "Unknown";
            const isFamilyProfile: boolean = data.isFamilyProfile ?? false;
            const clothingLabel = computeClothingLabel(hasGown, innerWear, isFamilyProfile);
            const groupKey = isEtc ? "__ETC__" : computeGroupKey(hasGown, innerWear, poseType, isFamilyProfile);
            result[idx] = { ...file, lightingStatus:data.lightingStatus||"normal", hasGown, innerWear, clothingLabel, poseType, isFamilyProfile, confidence:data.confidence||0.5, analyzed:true, groupKey };
          } else {
            result[idx] = { ...file, analyzed:true, lightingStatus:"etc_test", groupKey:"__ETC__" };
          }
        } catch {
          result[idx] = { ...file, analyzed:true, lightingStatus:"etc_test", groupKey:"__ETC__" };
        }
        done++;
        setStudioFiles([...result]);
      }
    };

    await Promise.all(Array.from({length: CONCURRENCY}, () => worker()));
    const groups = buildStudioGroups(result);
    setStudioGroups(groups);
    setStep(3);
  };

  const runStudioOutput = useCallback(async () => {
    if (!rootDir || studioGroups.length === 0) return;
    setStep(5); cancelRef.current = false;
    const log: string[] = [];
    const rootName = rootDir.name;
    const selectedJpgDir = await (rootDir as any).getDirectoryHandle(`selected_${rootName}`, { create:true });
    const selectedRawDir = await (rootDir as any).getDirectoryHandle("Selected_RAW", { create:true });
    const reportDir      = await (rootDir as any).getDirectoryHandle("AI_SELECT_REPORT", { create:true });

    const rawIndex = new Map<string, FileSystemFileHandle>();
    for await (const [name, handle] of (rootDir as any).entries()) {
      if (handle.kind !== "file") continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (RAW_EXTS.has(ext)) rawIndex.set(name.replace(/\.[^.]+$/,"").toLowerCase(), handle as FileSystemFileHandle);
    }

    const totalFiles = studioGroups.reduce((s,g)=>s+g.files.length,0);
    let processed = 0, rawCopied = 0, rawMissing = 0;
    const classRows: string[][] = [], groupRows: string[][] = [], etcRows: string[][] = [], rawRows: string[][] = [];

    for (const group of studioGroups) {
      const folderName = group.editedFolderName || group.suggestedFolderName;
      const groupDir = await (selectedJpgDir as any).getDirectoryHandle(folderName, { create:true });

      for (const file of group.files) {
        if (cancelRef.current) break;
        setProgress({ cur:processed, total:totalFiles, msg:`${folderName}: ${file.name}` });
        try { await copyFileHandle(file.handle, groupDir, file.name); log.push(`✅ ${file.name} → ${folderName}/`); }
        catch { log.push(`❌ ${file.name} 실패`); }

        if (!group.isEtc) {
          const rawHandle = rawIndex.get(file.basename.toLowerCase());
          if (rawHandle) {
            try {
              const rawFile = await rawHandle.getFile();
              await copyFileHandle(rawHandle, selectedRawDir, rawFile.name);
              rawCopied++;
              rawRows.push([file.name, rawFile.name, folderName, "복사완료", `Selected_RAW/${rawFile.name}`]);
              log.push(`✅ RAW: ${rawFile.name}`);
            } catch { rawRows.push([file.name, "", folderName, "실패", ""]); }
          } else {
            rawMissing++;
            rawRows.push([file.name, "", folderName, "누락", ""]);
            log.push(`⚠️ RAW 누락: ${file.basename}`);
          }
        }

        if (group.isEtc) {
          etcRows.push([file.name, file.lightingStatus, String(Math.round(file.brightness??0)), "", "", ""]);
        }
        classRows.push([file.name, "", folderName, file.clothingLabel, file.poseType, file.lightingStatus, String(Math.round(file.confidence*100)/100), ""]);
        processed++;
        setStudioCopyLog([...log]);
      }

      if (!group.isEtc) {
        const f = group.files[0], l = group.files[group.files.length-1];
        const avgConf = group.files.reduce((s,x)=>s+x.confidence,0)/group.files.length;
        groupRows.push([String(group.index), folderName, group.clothingLabel, group.poseType, String(group.files.length), f.name, l.name, String(Math.round(avgConf*100)/100)]);
      }
    }

    const wr = async (name: string, content: string) => {
      try { const fh = await (reportDir as any).getFileHandle(name,{create:true}); const w = await fh.createWritable(); await w.write("﻿"+content); await w.close(); } catch {}
    };
    await wr("studio_classification_report.csv", makeCSV(["file_name","original_path","assigned_folder","clothing_label","pose_type","lighting_status","confidence","note"], classRows));
    await wr("studio_group_report.csv",           makeCSV(["group_id","folder_name","clothing_label","pose_type","file_count","first_file","last_file","confidence"], groupRows));
    await wr("studio_etc_report.csv",             makeCSV(["file_name","reason","brightness_score","face_brightness_score","previous_frame_delta","ai_comment"], etcRows));
    await wr("raw_match_report.csv",              makeCSV(["jpg_file","raw_file","assigned_folder","status","destination_path"], rawRows));

    const etcGroup = studioGroups.find(g=>g.isEtc);
    const summary = { mode:"studio", total_jpg:studioFiles.length, total_raw:studioRawCount, total_groups:studioGroups.filter(g=>!g.isEtc).length, total_etc:etcGroup?.files.length??0, total_normal:studioGroups.filter(g=>!g.isEtc).reduce((s,g)=>s+g.files.length,0), total_raw_matched:rawCopied, total_raw_missing:rawMissing, output_path:`selected_${rootName}/`, created_at:new Date().toISOString() };
    await wr("summary.json", JSON.stringify(summary, null, 2));

    setStudioStats({ totalJpg:studioFiles.length, totalRaw:studioRawCount, totalGroups:studioGroups.filter(g=>!g.isEtc).length, totalEtc:etcGroup?.files.length??0, totalNormal:studioGroups.filter(g=>!g.isEtc).reduce((s,g)=>s+g.files.length,0), totalRawMatched:rawCopied, totalRawMissing:rawMissing });
    setStep(6);
  }, [studioGroups, rootDir, studioFiles, studioRawCount]);

  /* ════════════════════════════════════════════
     STEP INDICATOR
  ═══════════════════════════════════════════ */
  const renderStepIndicator = () => (
    <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"10px 24px",overflowX:"auto"}}>
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        {stepLabels.map((lbl,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
            <div style={{width:22,height:22,borderRadius:"50%",fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",background:i<step?(photoMode==="studio"?C.purple:C.green):i===step?C.teal:C.border,color:i<=step?"#fff":C.muted}}>{i<step?"✓":i+1}</div>
            <span style={{fontSize:11,fontWeight:i===step?800:500,color:i===step?C.teal:C.hint}}>{lbl}</span>
            {i<stepLabels.length-1&&<span style={{color:C.border,fontSize:10}}>›</span>}
          </div>
        ))}
      </div>
    </div>
  );

  /* ════════════════════════════════════════════
     STEP 0 — 폴더 선택 (SHARED)
  ═══════════════════════════════════════════ */
  const Step0 = () => (
    <div style={{display:"flex",flexDirection:"column",gap:20,maxWidth:660}}>
      {/* Mode selector */}
      <Card>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>📷 촬영 모드 선택</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
          {([["field","🏥 병원 현장촬영","시간 간격과 장소 변화 기준으로 Scene을 분류합니다."],["studio","🎞 스튜디오 프로필촬영","의상 변화·포즈·조명 불량 여부를 기준으로 분류합니다."]] as const).map(([m,title,desc])=>(
            <button key={m} onClick={()=>setPhotoMode(m)} style={{padding:"16px 20px",textAlign:"left",border:"none",borderRight:m==="field"?`1px solid ${C.border}`:"none",background:photoMode===m?C.light:"transparent",cursor:"pointer",fontFamily:"inherit"}}>
              <div style={{fontSize:13,fontWeight:900,color:photoMode===m?C.teal:C.muted,marginBottom:4}}>{title}{photoMode===m&&" ✓"}</div>
              <div style={{fontSize:11,color:C.hint,lineHeight:1.6}}>{desc}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Studio info banner */}
      {photoMode==="studio" && (
        <div style={{padding:14,background:"#F5F0FF",borderRadius:12,fontSize:11,color:"#4C1D95",border:"1px solid #DDD6FE",lineHeight:1.8}}>
          <strong>스튜디오 프로필촬영 모드</strong>는 시간 간격보다 <strong>의상 변화와 포즈 변화</strong>를 우선으로 분류합니다.<br/>
          포즈는 Standing / Sitting 두 가지로만 나눕니다. 조명이 불발된 컷은 <strong>00_ETC_조명불량</strong> 폴더로 분리합니다.<br/>
          중복컷 분류는 이 모드에서 사용하지 않습니다.
        </div>
      )}

      {/* Folder picker */}
      <Card>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>📁 백업 폴더 선택</div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          <button onClick={pickDir} style={{height:52,border:`1.5px dashed ${C.border}`,borderRadius:10,background:C.white,cursor:"pointer",fontSize:13,fontWeight:700,color:rootDir?C.green:C.teal,display:"flex",alignItems:"center",gap:10,padding:"0 18px",fontFamily:"inherit"}}>
            {rootDir ? <><span>✅</span>{rootDir.name}</> : <><span>📂</span>RAW+JPG 혼합 백업 폴더 선택</>}
          </button>

          {photoMode==="field" && (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8}}>씬 구분 시간 간격: <span style={{color:C.teal}}>{gapMinutes}분</span></div>
                <input type="range" min={3} max={60} value={gapMinutes} onChange={e=>setGapMinutes(Number(e.target.value))} style={{width:"100%"}}/>
                <div style={{fontSize:10,color:C.hint,marginTop:4}}>시간 초과 OR 장면 구성 변화 감지 → 다른 씬으로 분리</div>
              </div>
              <div style={{padding:"10px 14px",background:"#F0FDF4",borderRadius:8,fontSize:11,color:"#166534",border:"1px solid #BBF7D0",lineHeight:1.7}}>
                📂 RAW → <strong>RAW(원본)/</strong> 이동<br/>
                🖼 JPG → <strong>JPG(분류)/씬폴더/</strong> 이동<br/>
                ✅ 선택본 → <strong>Selected[XX]/</strong> (씬 폴더 내부)
              </div>
            </div>
          )}

          {photoMode==="studio" && (
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:6}}>조명 불량 ETC 기준</div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {(["loose","medium","strict"] as LightingSensitivity[]).map(v=>(
                  <label key={v} style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:11,cursor:"pointer"}}>
                    <input type="radio" name="lighting" value={v} checked={studioOpts.lightingSensitivity===v} onChange={()=>setStudioOpts(o=>({...o,lightingSensitivity:v}))} style={{marginTop:1}}/>
                    <span style={{color:studioOpts.lightingSensitivity===v?C.teal:C.muted,fontWeight:studioOpts.lightingSensitivity===v?800:500}}>{STUDIO_LIGHTING_SENSITIVITY[v]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {!hasFS && <div style={{padding:14,background:"#FFF3CD",borderRadius:10,fontSize:12,color:"#856404",border:"1px solid #FFD980"}}>⚠️ Chrome 또는 Edge 브라우저에서만 파일 시스템 접근이 가능합니다.</div>}

      <Btn onClick={photoMode==="field"?handleFieldSort:handleStudioSort} disabled={!rootDir||!hasFS}>
        {photoMode==="field" ? "현장촬영 분류 시작 →" : "스튜디오 분류 시작 →"}
      </Btn>
    </div>
  );

  /* ════════════════════════════════════════════
     FIELD STEPS 1–6
  ═══════════════════════════════════════════ */
  const FieldStep1 = () => (
    <div style={{maxWidth:560,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.teal}}>📂 파일 분류 중...</div>
      <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg}/>
      <div style={{maxHeight:200,overflowY:"auto",fontSize:11,fontFamily:"monospace",background:"#F8FFFE",borderRadius:8,padding:12,border:`1px solid ${C.border}`}}>
        {copyLog.slice(-20).map((l,i)=><div key={i} style={{color:C.green}}>{l}</div>)}
      </div>
    </div>
  );

  const FieldStep2 = () => {
    const allLoaded = scenes.every(s=>!s.nameLoading);
    return (
      <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:800}}>
        <div style={{padding:14,background:"#FEF3C7",borderRadius:10,fontSize:12,color:"#92400E",border:"1px solid #FCD34D"}}>
          ⚠️ AI가 씬 이름을 추천했습니다. 직접 수정 후 <strong>승인</strong>해주세요.
        </div>
        <Card>
          <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>
            🏷️ 씬 폴더명 검토 — JPG {scenes.reduce((s,sc)=>s+sc.files.length,0)}장 / RAW {rawCount}개
          </div>
          <div style={{padding:"8px 0"}}>
            {scenes.map((sc,i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"90px 28px 1fr auto",gap:10,alignItems:"center",padding:"10px 20px",borderBottom:i<scenes.length-1?`1px solid ${C.border}`:"none"}}>
                <div style={{display:"flex",gap:3}}>
                  {sc.files.slice(0,3).map((f,fi)=>f.thumbUrl?<img key={fi} src={f.thumbUrl} style={{width:28,height:20,objectFit:"cover",borderRadius:3}} alt=""/>:<div key={fi} style={{width:28,height:20,background:C.border,borderRadius:3}}/>)}
                </div>
                <div style={{fontSize:10,color:C.hint,fontFamily:"monospace",textAlign:"center"}}>{sc.files.length}장</div>
                {sc.nameLoading
                  ? <span style={{fontSize:12,color:C.hint}}>AI 분석 중...</span>
                  : <input value={sc.editedName} onChange={e=>setScenes(prev=>prev.map((s,j)=>j===i?{...s,editedName:e.target.value}:s))} style={{flex:1,height:34,border:`1.5px solid ${C.border}`,borderRadius:8,padding:"0 10px",fontSize:12,fontFamily:"inherit",outline:"none"}}/>
                }
                {sc.nameConfidence!=null&&!sc.nameLoading&&<span style={{fontSize:9,background:C.light,color:C.teal,padding:"2px 6px",borderRadius:4,whiteSpace:"nowrap"}}>{Math.round(sc.nameConfidence*100)}%</span>}
              </div>
            ))}
          </div>
        </Card>
        <div style={{display:"flex",gap:10}}>
          <Btn variant="secondary" onClick={()=>setStep(0)}>← 처음으로</Btn>
          <Btn onClick={runFieldAnalysis} disabled={!allLoaded}>{allLoaded?"✅ 승인 → AI 분석 시작":"AI 씬 이름 분석 중..."}</Btn>
        </div>
      </div>
    );
  };

  const FieldStep3 = () => (
    <div style={{maxWidth:560,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.teal}}>🔍 AI 품질 분석 중...</div>
      <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg}/>
      <div style={{fontSize:11,color:C.hint}}>선명도·밝기·중복 여부를 분석합니다.</div>
      <button onClick={()=>{cancelRef.current=true;}} style={{padding:"8px 16px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,cursor:"pointer",color:C.muted,fontFamily:"inherit",alignSelf:"flex-start"}}>중단</button>
    </div>
  );

  const FieldStep4 = () => {
    const sc = scenes[activeScene];
    if (!sc) return null;
    const candidates = sc.files.filter(f=>f.rejectReason==="ok"&&(f.dupGroupId===null||f.isDupRep));
    const rejected   = sc.files.filter(f=>f.rejectReason!=="ok"&&f.rejectReason!=="pending");
    const dups       = sc.files.filter(f=>f.dupGroupId!==null&&!f.isDupRep);
    const selected   = sc.files.filter(f=>f.selected).length;
    const COUNT_OPTS: {v:SelectCount;l:string}[] = [{v:3,l:"3장"},{v:5,l:"5장"},{v:7,l:"7장"},{v:10,l:"10장"},{v:0,l:"전체"}];
    const applyCount = (count:SelectCount) => setScenes(prev=>prev.map((s,i)=>{
      if(i!==activeScene)return s;
      const cands=s.files.filter(f=>f.rejectReason==="ok"&&(f.dupGroupId===null||f.isDupRep));
      const n=count===0?cands.length:Math.min(count,cands.length);
      const topNames=new Set([...cands].sort((a,b)=>(b.blurScore??0)-(a.blurScore??0)).slice(0,n).map(f=>f.name));
      return {...s,selectCount:count,files:s.files.map(f=>({...f,selected:topNames.has(f.name)}))};
    }));
    const rejectLabel: Record<RejectReason,string>={ok:"",pending:"?",blur:"흔들림",dark:"어두움",overexposed:"노출과다",eyes_closed:"눈감힘"};
    const exprBadge: Record<string,{label:string;bg:string;color:string}> = {
      smile:   {label:"😊 미소",   bg:"#D1FAE5", color:"#065F46"},
      focused: {label:"🎯 집중",   bg:"#DBEAFE", color:"#1E40AF"},
      neutral: {label:"😐 자연",   bg:"#F3F4F6", color:"#6B7280"},
      bad:     {label:"⚠ 어색",   bg:"#FEE2E2", color:"#B91C1C"},
    };
    return (
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
          {scenes.map((s,i)=>(
            <button key={i} onClick={()=>setActiveScene(i)} style={{padding:"7px 14px",borderRadius:8,border:`1.5px solid ${i===activeScene?C.teal:C.border}`,background:i===activeScene?C.light:C.white,fontSize:12,fontWeight:i===activeScene?800:600,color:i===activeScene?C.teal:C.muted,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              {s.editedName||s.originalName}<span style={{marginLeft:6,fontSize:10,color:C.hint}}>{s.files.filter(f=>f.selected).length}선택</span>
            </button>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[{label:"전체 JPG",value:sc.files.length},{label:"1차 제외",value:rejected.length,color:C.red},{label:"중복 제거",value:dups.length,color:C.yellow},{label:"선택됨",value:selected,color:C.green}].map(({label,value,color})=>(
            <div key={label} style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 16px",textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:900,color:color??C.teal}}>{value}</div>
              <div style={{fontSize:10,color:C.hint,marginTop:2}}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:700,color:C.muted}}>선택 장수:</span>
          {COUNT_OPTS.map(({v,l})=>(
            <button key={v} onClick={()=>applyCount(v)} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${sc.selectCount===v?C.teal:C.border}`,background:sc.selectCount===v?C.light:C.white,fontSize:12,fontWeight:sc.selectCount===v?800:600,color:sc.selectCount===v?C.teal:C.muted,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
          ))}
        </div>
        {candidates.length > 0 ? (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8}}>
            {sc.files.filter(f=>f.rejectReason==="ok"&&(f.dupGroupId===null||f.isDupRep)).map(f=>{
              const fi=sc.files.indexOf(f);
              return (
                <div key={f.name} onClick={()=>setScenes(prev=>prev.map((s,i)=>i!==activeScene?s:{...s,files:s.files.map((pf,idx)=>idx===fi?{...pf,selected:!pf.selected}:pf)}))} style={{borderRadius:10,overflow:"hidden",border:`2px solid ${f.selected?C.teal:C.border}`,cursor:"pointer",background:C.white,position:"relative"}}>
                  {f.thumbUrl?<img src={f.thumbUrl} alt={f.name} style={{width:"100%",aspectRatio:"3/2",objectFit:"cover",display:"block"}}/>:<div style={{width:"100%",aspectRatio:"3/2",background:C.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:C.hint}}>로드 중</div>}
                  {f.isPortraitLike&&<div style={{position:"absolute",top:5,left:5,background:"#7C3AED",color:"#fff",fontSize:8,fontWeight:800,padding:"2px 6px",borderRadius:4,letterSpacing:0.5}}>📸 프로필</div>}
                  <div style={{padding:"4px 8px"}}>
                    <div style={{fontSize:9,color:C.hint,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                    {f.blurScore!=null&&<span style={{fontSize:8,background:C.light,color:C.teal,padding:"1px 4px",borderRadius:3}}>선명{f.blurScore.toFixed(0)}</span>}
                    {f.rejectReason!=="ok"&&f.rejectReason!=="pending"&&<span style={{fontSize:8,background:"#FEE2E2",color:C.red,padding:"1px 4px",borderRadius:3,marginLeft:2}}>{rejectLabel[f.rejectReason]}</span>}
                  </div>
                  <div style={{position:"absolute",top:5,right:5,width:18,height:18,borderRadius:"50%",background:f.selected?C.teal:"rgba(255,255,255,.8)",border:`2px solid ${f.selected?C.teal:C.border}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {f.selected&&<span style={{color:"#fff",fontSize:10,fontWeight:900}}>✓</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <div style={{padding:32,textAlign:"center",color:C.hint,fontSize:13}}>후보 없음</div>}
        <div style={{display:"flex",gap:10,paddingTop:8}}>
          <Btn variant="secondary" onClick={()=>setStep(2)}>← 뒤로</Btn>
          <Btn onClick={runFieldOutput} disabled={scenes.every(s=>s.files.filter(f=>f.selected).length===0)}>
            선택 완료 → 파일 정리 ({scenes.reduce((s,sc)=>s+sc.files.filter(f=>f.selected).length,0)}장) →
          </Btn>
        </div>
      </div>
    );
  };

  const FieldStep5 = () => (
    <div style={{maxWidth:680,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.teal}}>📦 파일 정리 중...</div>
      <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg}/>
      <div style={{maxHeight:260,overflowY:"auto",fontSize:11,fontFamily:"monospace",background:"#F8FFFE",borderRadius:8,padding:12,border:`1px solid ${C.border}`}}>
        {copyLog.slice(-40).map((l,i)=><div key={i} style={{color:l.startsWith("✅")?C.green:l.startsWith("❌")?C.red:C.yellow}}>{l}</div>)}
      </div>
    </div>
  );

  const FieldStep6 = () => {
    if (!fieldStats) return null;
    const rows = [{label:"처리된 씬",value:fieldStats.totalScenes},{label:"전체 JPG",value:fieldStats.totalJpg},{label:"원본 RAW",value:fieldStats.totalRaw,color:C.muted},{label:"1차 제외",value:fieldStats.totalRejected,color:C.red},{label:"중복 제거",value:fieldStats.totalDupRemoved,color:C.yellow},{label:"최종 선택",value:fieldStats.totalSelected,color:C.teal},{label:"RAW 복사 완료",value:fieldStats.totalRawCopied,color:C.green},{label:"RAW 누락",value:fieldStats.totalRawMissing,color:fieldStats.totalRawMissing>0?C.red:C.hint}];
    return (
      <Card style={{maxWidth:560}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.green}}>✅ 현장촬영 분류 완료!</div>
        <div style={{padding:20}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
            {rows.map(({label,value,color})=>(
              <div key={label} style={{background:C.bg,borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:20,fontWeight:900,color:color??C.txt}}>{value}</div>
                <div style={{fontSize:10,color:C.hint,marginTop:2}}>{label}</div>
              </div>
            ))}
          </div>
          <Btn onClick={()=>{setStep(0);setScenes([]);setRootDir(null);setRawCount(0);setCopyLog([]);setFieldStats(null);}}>처음으로</Btn>
        </div>
      </Card>
    );
  };

  /* ════════════════════════════════════════════
     STUDIO STEPS 1–6
  ═══════════════════════════════════════════ */
  const StudioStep1 = () => (
    <div style={{maxWidth:560,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.purple}}>📂 파일 분류 중...</div>
      <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg}/>
      <div style={{fontSize:11,color:C.hint}}>RAW/JPG 분리 후 AI 분석 단계로 진행합니다.</div>
    </div>
  );

  const StudioStep2 = () => {
    const analyzed = studioFiles.filter(f=>f.analyzed).length;
    const total    = studioFiles.length;
    return (
      <div style={{maxWidth:560,display:"flex",flexDirection:"column",gap:16}}>
        <div style={{fontSize:14,fontWeight:800,color:C.purple}}>🤖 AI 의상·포즈·조명 분석 중...</div>
        <ProgressBar cur={analyzed} total={total} msg={progress.msg}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[["전체 JPG",total,C.teal],["분석 완료",analyzed,C.green],["ETC 후보",studioFiles.filter(f=>f.groupKey==="__ETC__").length,C.red]].map(([l,v,c])=>(
            <div key={l as string} style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"10px 14px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:900,color:c as string}}>{v}</div>
              <div style={{fontSize:10,color:C.hint}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{fontSize:11,color:C.hint}}>4장씩 병렬 분석 중입니다. 잠시 기다려주세요. (JPG 100장 기준 약 30~60초)</div>
      </div>
    );
  };

  const StudioStep3 = () => {
    const etcGroup    = studioGroups.find(g=>g.isEtc);
    const normalGroups = studioGroups.filter(g=>!g.isEtc);
    return (
      <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:820}}>
        <div style={{padding:14,background:"#F5F0FF",borderRadius:10,fontSize:12,color:C.purple,border:"1px solid #DDD6FE"}}>
          ⚠️ AI가 의상·포즈 기준으로 그룹을 분류했습니다. 폴더명을 수정한 후 <strong>승인</strong>해주세요.
        </div>

        {etcGroup && (
          <Card>
            <div style={{padding:"12px 18px",background:"#FEF2F2",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:12,fontWeight:900,color:C.red}}>⚡ 00_ETC_조명불량</span>
              <span style={{fontSize:11,color:C.red,background:"#FEE2E2",padding:"2px 8px",borderRadius:20}}>{etcGroup.files.length}장</span>
              <span style={{fontSize:10,color:C.hint,marginLeft:"auto"}}>자동 분리됨 — 원본은 삭제되지 않음</span>
            </div>
            <div style={{display:"flex",gap:4,padding:"10px 18px",overflowX:"auto"}}>
              {etcGroup.files.slice(0,8).map(f=>f.thumbUrl?<img key={f.name} src={f.thumbUrl} style={{width:52,height:38,objectFit:"cover",borderRadius:4,flexShrink:0,border:`1.5px solid ${C.red}40`}} alt=""/>:<div key={f.name} style={{width:52,height:38,background:C.border,borderRadius:4,flexShrink:0}}/>)}
              {etcGroup.files.length>8&&<div style={{width:52,height:38,background:"#FEE2E2",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:C.red,flexShrink:0}}>+{etcGroup.files.length-8}</div>}
            </div>
          </Card>
        )}

        <Card>
          <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>
            🎞 의상·포즈 그룹 — {normalGroups.length}개 그룹 / JPG {normalGroups.reduce((s,g)=>s+g.files.length,0)}장
          </div>
          <div style={{padding:"8px 0"}}>
            {normalGroups.map((g,i)=>(
              <div key={g.key} style={{borderBottom:i<normalGroups.length-1?`1px solid ${C.border}`:"none",padding:"12px 20px"}}>
                <div style={{display:"grid",gridTemplateColumns:"100px 60px 1fr auto",gap:12,alignItems:"center"}}>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {g.files.slice(0,4).map(f=>f.thumbUrl?<img key={f.name} src={f.thumbUrl} style={{width:22,height:16,objectFit:"cover",borderRadius:2}} alt=""/>:<div key={f.name} style={{width:22,height:16,background:C.border,borderRadius:2}}/>)}
                  </div>
                  <div style={{textAlign:"center"}}>
                    <SectionPill label={g.poseType} count={g.files.length} color={g.poseType==="Standing"?C.teal:C.orange}/>
                  </div>
                  <input
                    value={g.editedFolderName}
                    onChange={e=>setStudioGroups(prev=>prev.map((p,j)=>p.key===g.key?{...p,editedFolderName:e.target.value}:p))}
                    style={{height:34,border:`1.5px solid ${C.border}`,borderRadius:8,padding:"0 10px",fontSize:12,fontFamily:"inherit",outline:"none"}}
                  />
                  <span style={{fontSize:9,background:C.light,color:C.teal,padding:"2px 6px",borderRadius:4,whiteSpace:"nowrap"}}>신뢰도 {Math.round(g.files.reduce((s,f)=>s+f.confidence,0)/g.files.length*100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{display:"flex",gap:10}}>
          <Btn variant="secondary" onClick={()=>setStep(0)}>← 처음으로</Btn>
          <Btn style={{background:C.purple}} onClick={()=>setStep(4)}>✅ 승인 → 그룹 확인</Btn>
        </div>
      </div>
    );
  };

  const StudioStep4 = () => {
    const etcGroup     = studioGroups.find(g=>g.isEtc);
    const normalGroups = studioGroups.filter(g=>!g.isEtc);
    const g = studioGroups[activeGroup] ?? normalGroups[0];
    return (
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {/* Group tabs */}
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
          {studioGroups.map((grp,i)=>(
            <button key={grp.key} onClick={()=>setActiveGroup(i)} style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${i===activeGroup?C.purple:C.border}`,background:i===activeGroup?"#F5F0FF":C.white,fontSize:11,fontWeight:i===activeGroup?800:600,color:i===activeGroup?C.purple:C.muted,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              {grp.isEtc?"⚡ ETC":grp.editedFolderName.split("_").slice(1).join("_")}<span style={{marginLeft:4,fontSize:9,color:C.hint}}>{grp.files.length}장</span>
            </button>
          ))}
        </div>

        {/* Summary stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[
            {label:"전체 그룹",value:normalGroups.length,color:C.purple},
            {label:"전체 JPG",value:normalGroups.reduce((s,g)=>s+g.files.length,0)},
            {label:"ETC",value:etcGroup?.files.length??0,color:C.red},
            {label:"RAW 파일",value:studioRawCount,color:C.muted},
          ].map(({label,value,color})=>(
            <div key={label} style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 16px",textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:900,color:color??C.teal}}>{value}</div>
              <div style={{fontSize:10,color:C.hint,marginTop:2}}>{label}</div>
            </div>
          ))}
        </div>

        {/* Active group photos */}
        {g && (
          <Card>
            <div style={{padding:"12px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:12,fontWeight:900,color:g.isEtc?C.red:C.purple}}>{g.editedFolderName}</span>
              <span style={{fontSize:11,color:C.hint}}>{g.files.length}장</span>
              {!g.isEtc&&<>
                <span style={{fontSize:10,background:C.light,color:C.teal,padding:"2px 8px",borderRadius:20}}>{g.clothingLabel}</span>
                <span style={{fontSize:10,background:"#FFF0EB",color:C.orange,padding:"2px 8px",borderRadius:20}}>{g.poseType}</span>
              </>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:6,padding:12}}>
              {g.files.map(f=>(
                <div key={f.name} style={{borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
                  {f.thumbUrl?<img src={f.thumbUrl} alt={f.name} style={{width:"100%",aspectRatio:"3/2",objectFit:"cover",display:"block"}}/>:<div style={{width:"100%",aspectRatio:"3/2",background:C.border}}/>}
                  <div style={{padding:"3px 6px",fontSize:8,color:C.hint,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div style={{padding:12,background:C.light,borderRadius:10,fontSize:11,color:C.muted}}>
          📁 출력 구조: <span style={{fontFamily:"monospace",color:C.teal}}>selected_{rootDir?.name}/[그룹폴더명]/ + Selected_RAW/ (씬 구분 없음)</span>
        </div>

        <div style={{display:"flex",gap:10}}>
          <Btn variant="secondary" onClick={()=>setStep(3)}>← 그룹 수정</Btn>
          <Btn style={{background:C.purple}} onClick={runStudioOutput}>파일 정리 시작 →</Btn>
        </div>
      </div>
    );
  };

  const StudioStep5 = () => (
    <div style={{maxWidth:680,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.purple}}>📦 스튜디오 파일 정리 중...</div>
      <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg}/>
      <div style={{maxHeight:260,overflowY:"auto",fontSize:11,fontFamily:"monospace",background:"#F8FFFE",borderRadius:8,padding:12,border:`1px solid ${C.border}`}}>
        {studioCopyLog.slice(-40).map((l,i)=><div key={i} style={{color:l.startsWith("✅")?C.green:l.startsWith("❌")?C.red:C.yellow}}>{l}</div>)}
      </div>
      <div style={{fontSize:11,color:C.hint}}>원본 파일은 삭제되지 않습니다.</div>
    </div>
  );

  const StudioStep6 = () => {
    if (!studioStats) return null;
    const rows = [
      {label:"의상·포즈 그룹",value:studioStats.totalGroups,color:C.purple},
      {label:"정상 JPG",value:studioStats.totalNormal,color:C.teal},
      {label:"ETC 분리",value:studioStats.totalEtc,color:C.red},
      {label:"원본 RAW",value:studioStats.totalRaw,color:C.muted},
      {label:"RAW 복사 완료",value:studioStats.totalRawMatched,color:C.green},
      {label:"RAW 누락",value:studioStats.totalRawMissing,color:studioStats.totalRawMissing>0?C.red:C.hint},
    ];
    return (
      <Card style={{maxWidth:600}}>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.purple}}>✅ 스튜디오 분류 완료!</div>
        <div style={{padding:20}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
            {rows.map(({label,value,color})=>(
              <div key={label} style={{background:C.bg,borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:20,fontWeight:900,color:color??C.txt}}>{value}</div>
                <div style={{fontSize:10,color:C.hint,marginTop:2}}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{background:C.light,borderRadius:10,padding:14,fontSize:11,color:C.muted,marginBottom:16,lineHeight:1.9}}>
            📁 <strong style={{color:C.teal}}>selected_{rootDir?.name}/</strong> — 의상·포즈별 하위 폴더에 JPG 정리<br/>
            📁 <strong style={{color:C.teal}}>Selected_RAW/</strong> — 매칭 RAW (씬 구분 없음)<br/>
            📁 <strong style={{color:C.red}}>00_ETC_조명불량/</strong> — 조명 불량 컷 별도 보관<br/>
            📊 <strong style={{color:C.teal}}>AI_SELECT_REPORT/</strong> — 4종 CSV + summary.json
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <Btn variant="secondary" onClick={()=>downloadCSV(makeCSV(["그룹","폴더명","의상","포즈","장수"], studioGroups.filter(g=>!g.isEtc).map(g=>[String(g.index),g.editedFolderName,g.clothingLabel,g.poseType,String(g.files.length)])),"studio_group_summary.csv")}>
              ↓ 그룹 요약 CSV
            </Btn>
            <Btn onClick={()=>{setStep(0);setStudioFiles([]);setStudioGroups([]);setRootDir(null);setStudioRawCount(0);setStudioCopyLog([]);setStudioStats(null);}}>
              처음으로
            </Btn>
          </div>
        </div>
      </Card>
    );
  };

  /* ════════════════════════════════════════════
     LAYOUT
  ═══════════════════════════════════════════ */
  return (
    <div>
      {/* 서브탭 */}
      <div style={{background:"#FFFFFF",borderBottom:"1px solid rgba(21,88,85,.12)",display:"flex",padding:"0 8px"}}>
        <span style={{padding:"11px 20px",fontSize:13,fontWeight:800,color:"#155855",borderBottom:"2.5px solid #155855",cursor:"default",whiteSpace:"nowrap"}}>
          📁 사진 분류
        </span>
        <Link href="/raw-select" style={{padding:"11px 20px",fontSize:13,fontWeight:600,color:"#9BB5B0",textDecoration:"none",whiteSpace:"nowrap",display:"inline-block",borderBottom:"2.5px solid transparent"}}>
          🎯 AI 컷 정리 & RAW 셀렉 (독립 실행)
        </Link>
      </div>

      {/* Mode badge */}
      {step > 0 && (
        <div style={{background:photoMode==="studio"?"#F5F0FF":C.light,padding:"6px 24px",fontSize:11,fontWeight:800,color:photoMode==="studio"?C.purple:C.teal,borderBottom:`1px solid ${photoMode==="studio"?"#DDD6FE":C.border}`}}>
          {photoMode==="studio"?"🎞 스튜디오 프로필촬영 모드":"🏥 병원 현장촬영 모드"}
        </div>
      )}

      <div style={{background:C.bg,minHeight:"100vh",color:C.txt}}>
        {renderStepIndicator()}
        <div style={{maxWidth:960,margin:"0 auto",padding:"28px 20px 80px"}}>
          {/* Shared step 0 */}
          {step===0 && <Step0/>}

          {/* Field mode */}
          {photoMode==="field" && step===1 && <FieldStep1/>}
          {photoMode==="field" && step===2 && <FieldStep2/>}
          {photoMode==="field" && step===3 && <FieldStep3/>}
          {photoMode==="field" && step===4 && <FieldStep4/>}
          {photoMode==="field" && step===5 && <FieldStep5/>}
          {photoMode==="field" && step===6 && <FieldStep6/>}

          {/* Studio mode */}
          {photoMode==="studio" && step===1 && <StudioStep1/>}
          {photoMode==="studio" && step===2 && <StudioStep2/>}
          {photoMode==="studio" && step===3 && <StudioStep3/>}
          {photoMode==="studio" && step===4 && <StudioStep4/>}
          {photoMode==="studio" && step===5 && <StudioStep5/>}
          {photoMode==="studio" && step===6 && <StudioStep6/>}
        </div>
      </div>
    </div>
  );
}
