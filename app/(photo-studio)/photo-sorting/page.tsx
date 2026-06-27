"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

/* ── Types ──────────────────────────────────────────────── */

type RejectReason = "ok" | "pending" | "blur" | "dark" | "overexposed";
type SelectCount = 3 | 5 | 7 | 10 | 0; // 0 = 전체 후보

interface ScannedFile {
  name: string;
  basename: string;
  handle: FileSystemFileHandle;
  mtime: number;
}

interface PhotoFile {
  name: string;
  basename: string;
  handle: FileSystemFileHandle;
  mtime: number;
  thumbUrl: string | null;
  blurScore: number | null;
  brightness: number | null;
  hash: string | null;
  rejectReason: RejectReason;
  selected: boolean;
  dupGroupId: string | null;
  isDupRep: boolean;
}

interface Scene {
  index: number;
  originalName: string;
  suggestedName: string;
  editedName: string;
  files: PhotoFile[];
  selectCount: SelectCount;
  nameLoading: boolean;
  nameConfidence?: number;
  nameReason?: string;
  sceneDir: FileSystemDirectoryHandle | null;
}

interface Stats {
  totalJpg: number;
  totalRaw: number;
  totalScenes: number;
  totalRejected: number;
  totalDupRemoved: number;
  totalSelected: number;
  totalRawCopied: number;
  totalRawMissing: number;
}

/* ── Constants ───────────────────────────────────────────── */

const RAW_EXTS = new Set(["arw","cr3","cr2","nef","raf","dng","orf","rw2"]);
const JPG_EXTS = new Set(["jpg","jpeg"]);

const STEP_LABELS = ["폴더 선택","파일 분류","씬 검토·승인","AI 분석","후보 선택","파일 정리","완료"];

const C = {
  teal:"#155855", orange:"#E85D2C", green:"#22876A",
  white:"#FFFFFF", border:"rgba(21,88,85,.12)", muted:"#5A7470",
  hint:"#9BB5B0", txt:"#1C2B28", light:"#EAF4F2", bg:"#EDF5F3",
  red:"#DC2626", yellow:"#D97706",
};

/* ── Image Helpers ───────────────────────────────────────── */

async function loadThumb(file: File, size = 120): Promise<string | null> {
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(size / img.width, size / img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

async function analyzeJpg(file: File): Promise<{
  blurScore: number; brightness: number; hash: string; thumbUrl: string;
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
      const gray = new Float32Array(w * h);
      let brightSum = 0;
      for (let i = 0; i < gray.length; i++) {
        const v = 0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2];
        gray[i] = v; brightSum += v;
      }
      const brightness = brightSum / gray.length;
      let lapSum = 0, lapCount = 0;
      for (let y = 1; y < h-1; y++) {
        for (let x = 1; x < w-1; x++) {
          const c = y*w+x;
          const lap = gray[c]*4 - gray[(y-1)*w+x] - gray[(y+1)*w+x] - gray[y*w+(x-1)] - gray[y*w+(x+1)];
          lapSum += lap*lap; lapCount++;
        }
      }
      const blurScore = lapCount > 0 ? Math.sqrt(lapSum / lapCount) : 0;
      const hc = document.createElement("canvas");
      hc.width = 8; hc.height = 8;
      const hCtx = hc.getContext("2d")!;
      hCtx.drawImage(img, 0, 0, 8, 8);
      const hd = hCtx.getImageData(0, 0, 8, 8).data;
      const hGray: number[] = [];
      for (let i = 0; i < 64; i++) hGray.push(0.299*hd[i*4] + 0.587*hd[i*4+1] + 0.114*hd[i*4+2]);
      const hMean = hGray.reduce((a,b)=>a+b,0)/64;
      const hash = hGray.map(v=>v>=hMean?"1":"0").join("");
      const tc = document.createElement("canvas");
      const ts = Math.min(160/img.width, 160/img.height, 1);
      tc.width = Math.round(img.width*ts); tc.height = Math.round(img.height*ts);
      tc.getContext("2d")!.drawImage(img, 0, 0, tc.width, tc.height);
      const thumbUrl = tc.toDataURL("image/jpeg", 0.72);
      URL.revokeObjectURL(url);
      resolve({ blurScore, brightness, hash, thumbUrl });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load fail")); };
    img.src = url;
  });
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
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(); };
    img.src = url;
  });
}

function hammingDist(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) d++;
  return d;
}

function applyDuplicates(files: PhotoFile[]): PhotoFile[] {
  const maxDist = Math.round(64 * 0.05);
  const result = files.map(f => ({ ...f, dupGroupId: null as string | null, isDupRep: false }));
  let gid = 0;
  for (let i = 0; i < result.length; i++) {
    if (!result[i].hash || result[i].dupGroupId !== null || result[i].rejectReason !== "ok") continue;
    const group: number[] = [i];
    for (let j = i+1; j < result.length; j++) {
      if (!result[j].hash || result[j].dupGroupId !== null || result[j].rejectReason !== "ok") continue;
      if (hammingDist(result[i].hash!, result[j].hash!) <= maxDist) group.push(j);
    }
    if (group.length > 1) {
      const gname = `g${++gid}`;
      let repIdx = group[0];
      for (const idx of group) { if ((result[idx].blurScore ?? 0) > (result[repIdx].blurScore ?? 0)) repIdx = idx; }
      for (const idx of group) { result[idx].dupGroupId = gname; result[idx].isDupRep = (idx === repIdx); }
    }
  }
  return result;
}

async function copyFileHandle(src: FileSystemFileHandle, destDir: FileSystemDirectoryHandle, fileName: string) {
  const file = await src.getFile();
  const buf = await file.arrayBuffer();
  const dest = await (destDir as any).getFileHandle(fileName, { create: true });
  const wr = await dest.createWritable();
  await wr.write(buf); await wr.close();
}

function makeCSV(headers: string[], rows: string[][]): string {
  const esc = (s: string) => `"${String(s).replace(/"/g,'""')}"`;
  return [headers.map(esc).join(","), ...rows.map(r=>r.map(esc).join(","))].join("\n");
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob(["﻿"+content], { type:"text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
  a.click(); URL.revokeObjectURL(a.href);
}

/* ── UI Components ───────────────────────────────────────── */

function Btn({ onClick, disabled, children, variant="primary", style: s }: {
  onClick?:()=>void; disabled?:boolean; children:React.ReactNode;
  variant?:"primary"|"secondary"|"danger"; style?:React.CSSProperties;
}) {
  const base: React.CSSProperties = { height:42, padding:"0 22px", border:"none", borderRadius:10, fontFamily:"inherit", fontSize:13, fontWeight:800, cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.5:1, transition:"opacity .15s" };
  const v = { primary:{background:C.teal,color:"#fff"}, secondary:{background:C.white,color:C.teal,border:`1.5px solid ${C.border}`}, danger:{background:C.red,color:"#fff"} };
  return <button onClick={onClick} disabled={disabled} style={{...base,...v[variant],...s}}>{children}</button>;
}

function Card({ children, style: s }: { children:React.ReactNode; style?:React.CSSProperties }) {
  return <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden",...s}}>{children}</div>;
}

function ProgressBar({ cur, total, msg }: { cur:number; total:number; msg:string }) {
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

/* ── Main Component ─────────────────────────────────────── */

export default function PhotoSortingPage() {
  const [step, setStep] = useState(0);
  const [rootDir, setRootDir] = useState<FileSystemDirectoryHandle|null>(null);
  const [gapMinutes, setGapMinutes] = useState(10);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [rawCount, setRawCount] = useState(0);
  const [progress, setProgress] = useState({ cur:0, total:0, msg:"" });
  const [activeScene, setActiveScene] = useState(0);
  const [copyLog, setCopyLog] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats|null>(null);
  const cancelRef = useRef(false);

  const hasFS = typeof window !== "undefined" && "showDirectoryPicker" in window;

  const pickDir = async () => {
    try {
      const h = await (window as any).showDirectoryPicker({ mode:"readwrite" });
      setRootDir(h);
    } catch (_) {}
  };

  /* ── Step 0 → 2: 스캔·분류·씬 네이밍 ──────────────── */
  const handleSort = useCallback(async () => {
    if (!rootDir) return;
    setStep(1);
    cancelRef.current = false;
    setCopyLog([]);

    // 1) 루트 폴더 스캔
    const rawFiles: ScannedFile[] = [];
    const jpgFiles: ScannedFile[] = [];
    setProgress({ cur:0, total:0, msg:"폴더 스캔 중..." });

    for await (const [name, handle] of (rootDir as any).entries()) {
      if (handle.kind !== "file") continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      const file = await (handle as FileSystemFileHandle).getFile();
      const entry: ScannedFile = { name, basename:name.replace(/\.[^.]+$/,""), handle, mtime:file.lastModified };
      if (RAW_EXTS.has(ext)) rawFiles.push(entry);
      else if (JPG_EXTS.has(ext)) jpgFiles.push(entry);
    }

    setRawCount(rawFiles.length);

    // 2) JPG를 시간 순 정렬 후 씬 그룹화
    jpgFiles.sort((a,b)=>a.mtime-b.mtime);
    const gapMs = gapMinutes * 60 * 1000;
    const groups: ScannedFile[][] = jpgFiles.length > 0 ? [[jpgFiles[0]]] : [];
    for (let i = 1; i < jpgFiles.length; i++) {
      if (jpgFiles[i].mtime - jpgFiles[i-1].mtime > gapMs) groups.push([jpgFiles[i]]);
      else groups[groups.length-1].push(jpgFiles[i]);
    }

    // 3) JPG_SCENE 폴더 생성 + 씬별 복사
    const jpgSceneDir = await (rootDir as any).getDirectoryHandle("JPG_SCENE", { create:true });
    const total = jpgFiles.length;
    let done = 0;
    const newScenes: Scene[] = [];

    for (let si = 0; si < groups.length; si++) {
      if (cancelRef.current) break;
      const sceneNum = String(si+1).padStart(2,"0");
      const originalName = `Scene${sceneNum}`;
      const sceneDir = await (jpgSceneDir as any).getDirectoryHandle(originalName, { create:true });

      const photoFiles: PhotoFile[] = [];
      for (const sf of groups[si]) {
        if (cancelRef.current) break;
        setProgress({ cur:done, total, msg:`${originalName} / ${sf.name}` });
        try {
          await copyFileHandle(sf.handle, sceneDir, sf.name);
          // 씬 네이밍용 썸네일은 처음 4장만
          const thumb = photoFiles.length < 4 ? await loadThumb(await sf.handle.getFile()) : null;
          photoFiles.push({
            name:sf.name, basename:sf.basename, handle:sf.handle, mtime:sf.mtime,
            thumbUrl:thumb, blurScore:null, brightness:null, hash:null,
            rejectReason:"pending", selected:false, dupGroupId:null, isDupRep:false,
          });
        } catch {
          photoFiles.push({
            name:sf.name, basename:sf.basename, handle:sf.handle, mtime:sf.mtime,
            thumbUrl:null, blurScore:null, brightness:null, hash:null,
            rejectReason:"pending", selected:false, dupGroupId:null, isDupRep:false,
          });
        }
        done++;
        setCopyLog(prev => [...prev.slice(-30), `✅ ${sf.name} → ${originalName}`]);
      }

      newScenes.push({
        index:si+1, originalName, suggestedName:originalName, editedName:originalName,
        files:photoFiles, selectCount:5, nameLoading:true, sceneDir,
      });
    }

    setScenes(newScenes);
    setProgress({ cur:total, total, msg:"씬 분류 완료 — AI 씬 이름 분석 중..." });
    setStep(2);

    // 4) AI 씬 네이밍
    const updated = newScenes.map(s=>({...s}));
    for (let i = 0; i < updated.length; i++) {
      try {
        const sampleFiles = updated[i].files.slice(0,4);
        const thumbs: string[] = [];
        for (const pf of sampleFiles) {
          const f = await pf.handle.getFile();
          thumbs.push(await getApiThumb(f));
        }
        const res = await fetch("/api/scene-naming", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ thumbnails:thumbs, originalName:updated[i].originalName }),
        });
        const data = await res.json();
        if (data.ok && data.name) {
          const num = String(updated[i].index).padStart(2,"0");
          const suggested = `${num}_${data.name}`;
          updated[i] = {...updated[i], suggestedName:suggested, editedName:suggested, nameLoading:false, nameConfidence:data.confidence, nameReason:data.reason};
        } else {
          updated[i] = {...updated[i], nameLoading:false};
        }
      } catch {
        updated[i] = {...updated[i], nameLoading:false};
      }
      setScenes([...updated]);
    }
  }, [rootDir, gapMinutes]);

  /* ── Step 3: AI 품질 분석 ───────────────────────────── */
  const runAnalysis = useCallback(async () => {
    setStep(3);
    cancelRef.current = false;
    const total = scenes.reduce((s,sc)=>s+sc.files.length,0);
    let done = 0;

    const updated = scenes.map(s=>({...s, files:s.files.map(f=>({...f}))}));

    for (let si = 0; si < updated.length; si++) {
      for (let fi = 0; fi < updated[si].files.length; fi++) {
        if (cancelRef.current) break;
        const pf = updated[si].files[fi];
        setProgress({ cur:done, total, msg:`${updated[si].editedName} / ${pf.name}` });
        try {
          const file = await pf.handle.getFile();
          const { blurScore, brightness, hash, thumbUrl } = await analyzeJpg(file);
          let rejectReason: RejectReason = "ok";
          if (blurScore < 18) rejectReason = "blur";
          else if (brightness < 38) rejectReason = "dark";
          else if (brightness > 230) rejectReason = "overexposed";
          updated[si].files[fi] = {...pf, blurScore, brightness, hash, thumbUrl, rejectReason};
        } catch {
          updated[si].files[fi] = {...pf, rejectReason:"ok"};
        }
        done++;
      }
      // 씬 내 중복 그룹화
      updated[si].files = applyDuplicates(updated[si].files);
      setScenes([...updated]);
    }

    setProgress({ cur:total, total, msg:"분석 완료" });

    // selectCount에 따라 자동 선택
    const withSel = updated.map(sc => {
      const candidates = sc.files.filter(f=>f.rejectReason==="ok"&&(f.dupGroupId===null||f.isDupRep));
      const n = sc.selectCount === 0 ? candidates.length : Math.min(sc.selectCount, candidates.length);
      const topNames = new Set(
        [...candidates].sort((a,b)=>(b.blurScore??0)-(a.blurScore??0)).slice(0,n).map(f=>f.name)
      );
      return {...sc, files:sc.files.map(f=>({...f, selected:topNames.has(f.name)}))};
    });
    setScenes(withSel);
    setStep(4);
  }, [scenes]);

  /* ── Step 5: 파일 정리 ──────────────────────────────── */
  const runOutput = useCallback(async () => {
    if (!rootDir) return;
    setStep(5);
    cancelRef.current = false;
    const log: string[] = [];
    const rawMatchRows: string[][] = [];

    const rootName = rootDir.name;
    const selectedJpgDir = await (rootDir as any).getDirectoryHandle(`selected_${rootName}`, { create:true });
    const selectedRawDir = await (rootDir as any).getDirectoryHandle("Selected_RAW", { create:true });

    // RAW 인덱스 (루트에서)
    const rawIndex = new Map<string, FileSystemFileHandle>();
    for await (const [name, handle] of (rootDir as any).entries()) {
      if (handle.kind !== "file") continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (RAW_EXTS.has(ext)) rawIndex.set(name.replace(/\.[^.]+$/,"").toLowerCase(), handle as FileSystemFileHandle);
    }

    const selectedTotal = scenes.reduce((s,sc)=>s+sc.files.filter(f=>f.selected).length,0);
    let processed = 0, rawCopied = 0, rawMissing = 0;
    const updated = scenes.map(s=>({...s, files:s.files.map(f=>({...f}))}));

    for (let si = 0; si < updated.length; si++) {
      const sc = updated[si];
      const sceneName = sc.editedName || sc.originalName;
      const sceneOutDir = await (selectedJpgDir as any).getDirectoryHandle(sceneName, { create:true });

      for (let fi = 0; fi < sc.files.length; fi++) {
        if (!sc.files[fi].selected) continue;
        if (cancelRef.current) break;
        const pf = sc.files[fi];
        setProgress({ cur:processed, total:selectedTotal, msg:`파일 정리: ${pf.name}` });

        // 선택 JPG 복사
        try {
          await copyFileHandle(pf.handle, sceneOutDir, pf.name);
          log.push(`✅ JPG: ${pf.name} → selected_${rootName}/${sceneName}/`);
        } catch { log.push(`❌ JPG: ${pf.name} 실패`); }

        // RAW 매칭
        const rawHandle = rawIndex.get(pf.basename.toLowerCase());
        if (rawHandle) {
          try {
            const rawFile = await rawHandle.getFile();
            await copyFileHandle(rawHandle, selectedRawDir, rawFile.name);
            log.push(`✅ RAW: ${rawFile.name} → Selected_RAW/`);
            rawMatchRows.push([sceneName, pf.name, rawFile.name, "복사 완료"]);
            rawCopied++;
          } catch {
            log.push(`❌ RAW: ${pf.basename} 복사 실패`);
            rawMatchRows.push([sceneName, pf.name, "", "실패"]);
          }
        } else {
          log.push(`⚠️ RAW: ${pf.basename} 없음`);
          rawMatchRows.push([sceneName, pf.name, "", "누락"]);
          rawMissing++;
        }
        processed++;
        setCopyLog([...log]);
      }
      setScenes([...updated]);
    }

    // 리포트
    const reportDir = await (rootDir as any).getDirectoryHandle("AI_SELECT_REPORT", { create:true });
    const writeReport = async (name: string, content: string) => {
      try {
        const fh = await (reportDir as any).getFileHandle(name, { create:true });
        const wr = await fh.createWritable();
        await wr.write("﻿"+content); await wr.close();
      } catch (_) {}
    };
    await writeReport("raw_match_report.csv", makeCSV(["씬","선택JPG","RAW","상태"], rawMatchRows));
    await writeReport("selected_list.csv", makeCSV(["씬","JPG","블러","밝기"],
      updated.flatMap(s=>s.files.filter(f=>f.selected).map(f=>[s.editedName,f.name,f.blurScore?.toFixed(1)??"",f.brightness?.toFixed(0)??""]))));

    setStats({
      totalJpg:scenes.reduce((s,sc)=>s+sc.files.length,0),
      totalRaw:rawCount,
      totalScenes:scenes.length,
      totalRejected:scenes.reduce((s,sc)=>s+sc.files.filter(f=>f.rejectReason!=="ok"&&f.rejectReason!=="pending").length,0),
      totalDupRemoved:scenes.reduce((s,sc)=>s+sc.files.filter(f=>f.dupGroupId!==null&&!f.isDupRep).length,0),
      totalSelected:scenes.reduce((s,sc)=>s+sc.files.filter(f=>f.selected).length,0),
      totalRawCopied:rawCopied, totalRawMissing:rawMissing,
    });
    setStep(6);
  }, [scenes, rootDir, rawCount]);

  /* ── Step Indicator ──────────────────────────────────── */
  const renderStepIndicator = () => (
    <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"10px 24px",overflowX:"auto"}}>
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        {STEP_LABELS.map((lbl,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
            <div style={{width:22,height:22,borderRadius:"50%",fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",background:i<step?C.green:i===step?C.teal:C.border,color:i<=step?"#fff":C.muted}}>{i<step?"✓":i+1}</div>
            <span style={{fontSize:11,fontWeight:i===step?800:500,color:i===step?C.teal:C.hint}}>{lbl}</span>
            {i<STEP_LABELS.length-1&&<span style={{color:C.border,fontSize:10}}>›</span>}
          </div>
        ))}
      </div>
    </div>
  );

  /* ── STEP 0 ─────────────────────────────────────────── */
  const Step0 = () => (
    <div style={{display:"flex",flexDirection:"column",gap:20,maxWidth:640}}>
      <div style={{padding:16,background:C.light,borderRadius:12,fontSize:12,color:C.teal,border:`1px solid rgba(21,88,85,.15)`,lineHeight:1.8}}>
        <strong>📦 통합 자동화 워크플로우</strong><br/>
        RAW+JPG가 함께 있는 백업 폴더 하나만 선택하세요.<br/>
        1) RAW/JPG 분리 → 2) Scene 분류 → 3) AI 씬 이름 추천 → 4) 품질 분석 → 5) 후보 선택 → 6) RAW 매칭
      </div>
      <Card>
        <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>📁 백업 폴더 선택</div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:16}}>
          <button
            onClick={pickDir}
            style={{height:54,border:`1.5px dashed ${C.border}`,borderRadius:10,background:C.white,cursor:"pointer",fontSize:13,fontWeight:700,color:rootDir?C.green:C.teal,display:"flex",alignItems:"center",gap:10,padding:"0 18px",fontFamily:"inherit"}}
          >
            {rootDir ? <><span>✅</span> {rootDir.name}</> : <><span>📂</span> 백업 폴더 선택 (RAW+JPG 혼합 폴더)</>}
          </button>

          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:8}}>
              씬 구분 기준 시간 간격: <span style={{color:C.teal}}>{gapMinutes}분</span>
            </div>
            <input
              type="range" min={3} max={60} value={gapMinutes}
              onChange={e=>setGapMinutes(Number(e.target.value))}
              style={{width:"100%"}}
            />
            <div style={{fontSize:10,color:C.hint,marginTop:4}}>연속 JPG 사이 {gapMinutes}분 이상 공백이면 다른 씬으로 분류합니다</div>
          </div>
        </div>
      </Card>

      {!hasFS && (
        <div style={{padding:14,background:"#FFF3CD",borderRadius:10,fontSize:12,color:"#856404",border:"1px solid #FFD980"}}>
          ⚠️ Chrome 또는 Edge 브라우저에서만 파일 시스템 접근이 가능합니다.
        </div>
      )}

      <Btn onClick={handleSort} disabled={!rootDir || !hasFS}>
        분류 시작 →
      </Btn>
    </div>
  );

  /* ── STEP 1 ─────────────────────────────────────────── */
  const Step1 = () => (
    <div style={{maxWidth:560,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.teal}}>📂 파일 분류 중...</div>
      <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg}/>
      <div style={{maxHeight:200,overflowY:"auto",fontSize:11,fontFamily:"monospace",background:"#F8FFFE",borderRadius:8,padding:12,border:`1px solid ${C.border}`}}>
        {copyLog.slice(-20).map((line,i)=><div key={i} style={{color:C.green,padding:"1px 0"}}>{line}</div>)}
      </div>
      <div style={{fontSize:11,color:C.hint}}>원본 파일은 삭제되지 않습니다. JPG만 JPG_SCENE 폴더로 복사됩니다.</div>
    </div>
  );

  /* ── STEP 2: 씬 검토 & 승인 ─────────────────────────── */
  const Step2 = () => {
    const allLoaded = scenes.every(s=>!s.nameLoading);
    return (
      <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:800}}>
        <div style={{padding:14,background:"#FEF3C7",borderRadius:10,fontSize:12,color:"#92400E",border:"1px solid #FCD34D"}}>
          ⚠️ AI가 씬 이름을 추천했습니다. 100% 정확하지 않을 수 있습니다. <strong>직접 수정 후 승인</strong>해주세요.
        </div>

        <Card>
          <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.teal}}>
            🏷️ 씬 폴더명 검토 — JPG {scenes.reduce((s,sc)=>s+sc.files.length,0)}장 / RAW {rawCount}개
          </div>
          <div style={{padding:"8px 0"}}>
            {scenes.map((sc,i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"100px 28px 1fr auto",gap:10,alignItems:"center",padding:"10px 20px",borderBottom:i<scenes.length-1?`1px solid ${C.border}`:"none"}}>
                {/* 썸네일들 */}
                <div style={{display:"flex",gap:3}}>
                  {sc.files.slice(0,3).map((f,fi)=>
                    f.thumbUrl
                      ? <img key={fi} src={f.thumbUrl} style={{width:28,height:20,objectFit:"cover",borderRadius:3}} alt=""/>
                      : <div key={fi} style={{width:28,height:20,background:C.border,borderRadius:3}}/>
                  )}
                </div>
                <div style={{fontSize:10,color:C.hint,fontFamily:"monospace",textAlign:"center"}}>{sc.files.length}장</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {sc.nameLoading
                    ? <span style={{fontSize:12,color:C.hint}}>AI 분석 중...</span>
                    : <input
                        value={sc.editedName}
                        onChange={e=>setScenes(prev=>prev.map((s,j)=>j===i?{...s,editedName:e.target.value}:s))}
                        style={{flex:1,height:34,border:`1.5px solid ${C.border}`,borderRadius:8,padding:"0 10px",fontSize:12,fontFamily:"inherit",outline:"none"}}
                      />
                  }
                  {sc.nameConfidence!=null && !sc.nameLoading &&
                    <span style={{fontSize:9,background:C.light,color:C.teal,padding:"2px 6px",borderRadius:4,whiteSpace:"nowrap"}}>
                      {Math.round(sc.nameConfidence*100)}%
                    </span>
                  }
                </div>
                <div style={{fontSize:10,color:C.hint,whiteSpace:"nowrap"}}>{sc.originalName}</div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{padding:14,background:C.light,borderRadius:10,fontSize:11,color:C.muted}}>
          📁 생성될 폴더 구조: <span style={{fontFamily:"monospace",color:C.teal}}>JPG_SCENE/ → selected_{rootDir?.name}/ → Selected_RAW/</span>
        </div>

        <div style={{display:"flex",gap:10}}>
          <Btn variant="secondary" onClick={()=>setStep(0)}>← 처음으로</Btn>
          <Btn onClick={runAnalysis} disabled={!allLoaded}>
            {allLoaded ? "✅ 승인 → AI 분석 시작" : "AI 씬 이름 분석 중..."}
          </Btn>
        </div>
      </div>
    );
  };

  /* ── STEP 3 ─────────────────────────────────────────── */
  const Step3 = () => (
    <div style={{maxWidth:560,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.teal}}>🔍 AI 품질 분석 중...</div>
      <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg}/>
      <div style={{fontSize:11,color:C.hint}}>각 사진의 선명도·밝기·중복 여부를 분석합니다.</div>
      <button onClick={()=>{cancelRef.current=true;}} style={{padding:"8px 16px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,cursor:"pointer",color:C.muted,fontFamily:"inherit",alignSelf:"flex-start"}}>
        중단
      </button>
    </div>
  );

  /* ── STEP 4: 후보 선택 ─────────────────────────────── */
  const Step4 = () => {
    const sc = scenes[activeScene];
    if (!sc) return null;

    const candidates = sc.files.filter(f=>f.rejectReason==="ok"&&(f.dupGroupId===null||f.isDupRep));
    const rejected = sc.files.filter(f=>f.rejectReason!=="ok"&&f.rejectReason!=="pending");
    const dups = sc.files.filter(f=>f.dupGroupId!==null&&!f.isDupRep);
    const selected = sc.files.filter(f=>f.selected).length;

    const COUNT_OPTIONS: {v:SelectCount;l:string}[] = [{v:3,l:"3장"},{v:5,l:"5장"},{v:7,l:"7장"},{v:10,l:"10장"},{v:0,l:"전체"}];

    const applyCount = (count: SelectCount) => {
      setScenes(prev=>prev.map((s,i)=>{
        if (i!==activeScene) return s;
        const cands = s.files.filter(f=>f.rejectReason==="ok"&&(f.dupGroupId===null||f.isDupRep));
        const n = count===0?cands.length:Math.min(count,cands.length);
        const topNames = new Set([...cands].sort((a,b)=>(b.blurScore??0)-(a.blurScore??0)).slice(0,n).map(f=>f.name));
        return {...s, selectCount:count, files:s.files.map(f=>({...f,selected:topNames.has(f.name)}))};
      }));
    };

    const rejectLabel: Record<RejectReason,string> = {ok:"",pending:"?",blur:"흔들림",dark:"어두움",overexposed:"노출과다"};

    return (
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {/* 씬 탭 */}
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
          {scenes.map((s,i)=>(
            <button key={i} onClick={()=>setActiveScene(i)} style={{
              padding:"7px 14px",borderRadius:8,border:`1.5px solid ${i===activeScene?C.teal:C.border}`,
              background:i===activeScene?C.light:C.white,fontSize:12,fontWeight:i===activeScene?800:600,
              color:i===activeScene?C.teal:C.muted,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",
            }}>
              {s.editedName||s.originalName}
              <span style={{marginLeft:6,fontSize:10,color:C.hint}}>{s.files.filter(f=>f.selected).length}선택</span>
            </button>
          ))}
        </div>

        {/* 씬 통계 */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[
            {label:"전체 JPG",value:sc.files.length},
            {label:"1차 제외",value:rejected.length,color:C.red},
            {label:"중복 제거",value:dups.length,color:C.yellow},
            {label:"선택됨",value:selected,color:C.green},
          ].map(({label,value,color})=>(
            <div key={label} style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 16px",textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:900,color:color??C.teal}}>{value}</div>
              <div style={{fontSize:10,color:C.hint,marginTop:2}}>{label}</div>
            </div>
          ))}
        </div>

        {/* 씬별 선택 장수 */}
        <div style={{background:C.white,borderRadius:10,border:`1px solid ${C.border}`,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:700,color:C.muted,whiteSpace:"nowrap"}}>이 씬 선택 장수:</span>
          {COUNT_OPTIONS.map(({v,l})=>(
            <button key={v} onClick={()=>applyCount(v)} style={{
              padding:"6px 14px",borderRadius:8,border:`1.5px solid ${sc.selectCount===v?C.teal:C.border}`,
              background:sc.selectCount===v?C.light:C.white,fontSize:12,fontWeight:sc.selectCount===v?800:600,
              color:sc.selectCount===v?C.teal:C.muted,cursor:"pointer",fontFamily:"inherit",
            }}>{l}</button>
          ))}
          <span style={{fontSize:10,color:C.hint}}>후보 {candidates.length}장 중 AI 추천 순으로 선택</span>
        </div>

        {/* 사진 그리드 */}
        {candidates.length === 0
          ? <div style={{padding:32,textAlign:"center",color:C.hint,fontSize:13}}>후보 없음</div>
          : (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
              {sc.files.filter(f=>f.rejectReason==="ok"&&(f.dupGroupId===null||f.isDupRep)).map((f,_)=>{
                const fi = sc.files.indexOf(f);
                return (
                  <div key={f.name} onClick={()=>setScenes(prev=>prev.map((s,i)=>i!==activeScene?s:{...s,files:s.files.map((pf,idx)=>idx===fi?{...pf,selected:!pf.selected}:pf)}))}
                    style={{borderRadius:10,overflow:"hidden",border:`2px solid ${f.selected?C.teal:C.border}`,cursor:"pointer",background:C.white,position:"relative"}}>
                    {f.thumbUrl
                      ? <img src={f.thumbUrl} alt={f.name} style={{width:"100%",aspectRatio:"3/2",objectFit:"cover",display:"block"}}/>
                      : <div style={{width:"100%",aspectRatio:"3/2",background:C.border,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:C.hint}}>로드 중</div>
                    }
                    <div style={{padding:"4px 8px"}}>
                      <div style={{fontSize:9,color:C.hint,fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                      <div style={{display:"flex",gap:3,marginTop:2,flexWrap:"wrap"}}>
                        {f.blurScore!=null&&<span style={{fontSize:8,background:C.light,color:C.teal,padding:"1px 4px",borderRadius:3}}>선명{f.blurScore.toFixed(0)}</span>}
                        {f.rejectReason!=="ok"&&f.rejectReason!=="pending"&&<span style={{fontSize:8,background:"#FEE2E2",color:C.red,padding:"1px 4px",borderRadius:3}}>{rejectLabel[f.rejectReason]}</span>}
                        {f.dupGroupId&&<span style={{fontSize:8,background:"#FEF3C7",color:C.yellow,padding:"1px 4px",borderRadius:3}}>{f.isDupRep?"대표":"중복"}</span>}
                      </div>
                    </div>
                    <div style={{position:"absolute",top:5,right:5,width:18,height:18,borderRadius:"50%",background:f.selected?C.teal:"rgba(255,255,255,.8)",border:`2px solid ${f.selected?C.teal:C.border}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {f.selected&&<span style={{color:"#fff",fontSize:10,fontWeight:900}}>✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }

        <div style={{display:"flex",gap:10,paddingTop:8}}>
          <Btn variant="secondary" onClick={()=>setStep(2)}>← 뒤로</Btn>
          <Btn onClick={runOutput} disabled={scenes.every(s=>s.files.filter(f=>f.selected).length===0)}>
            선택 완료 → 파일 정리 ({scenes.reduce((s,sc)=>s+sc.files.filter(f=>f.selected).length,0)}장) →
          </Btn>
        </div>
      </div>
    );
  };

  /* ── STEP 5 ─────────────────────────────────────────── */
  const Step5 = () => (
    <div style={{maxWidth:680,display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,fontWeight:800,color:C.teal}}>📦 파일 정리 중...</div>
      <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg}/>
      <div style={{maxHeight:260,overflowY:"auto",fontSize:11,fontFamily:"monospace",background:"#F8FFFE",borderRadius:8,padding:12,border:`1px solid ${C.border}`}}>
        {copyLog.slice(-40).map((line,i)=>(
          <div key={i} style={{color:line.startsWith("✅")?C.green:line.startsWith("❌")?C.red:C.yellow}}>{line}</div>
        ))}
      </div>
      <div style={{fontSize:11,color:C.hint}}>원본 파일은 삭제되지 않습니다.</div>
    </div>
  );

  /* ── STEP 6 ─────────────────────────────────────────── */
  const Step6 = () => {
    if (!stats) return null;
    const rows = [
      {label:"처리된 씬",value:stats.totalScenes},
      {label:"전체 JPG",value:stats.totalJpg},
      {label:"원본 RAW",value:stats.totalRaw,color:C.muted},
      {label:"1차 제외",value:stats.totalRejected,color:C.red},
      {label:"중복 제거",value:stats.totalDupRemoved,color:C.yellow},
      {label:"최종 선택",value:stats.totalSelected,color:C.teal},
      {label:"RAW 복사 완료",value:stats.totalRawCopied,color:C.green},
      {label:"RAW 누락",value:stats.totalRawMissing,color:stats.totalRawMissing>0?C.red:C.hint},
    ];
    return (
      <div style={{maxWidth:600}}>
        <Card>
          <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:900,color:C.green}}>✅ 작업 완료!</div>
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
              📁 <strong style={{color:C.teal}}>JPG_SCENE/</strong> — 씬별 분류된 JPG<br/>
              📁 <strong style={{color:C.teal}}>selected_{rootDir?.name}/</strong> — AI가 선택한 JPG (씬별 하위 폴더)<br/>
              📁 <strong style={{color:C.teal}}>Selected_RAW/</strong> — 선택된 JPG와 매칭된 RAW (씬 구분 없음)<br/>
              📊 <strong style={{color:C.teal}}>AI_SELECT_REPORT/</strong> — CSV 리포트
            </div>

            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <Btn variant="secondary" onClick={()=>downloadCSV(makeCSV(["씬","선택JPG","RAW","상태"],scenes.flatMap(s=>s.files.filter(f=>f.selected).map(f=>[s.editedName,f.name,"",""]))),"selected_list.csv")}>
                ↓ 선택 목록 CSV
              </Btn>
              <Btn onClick={()=>{setStep(0);setScenes([]);setRootDir(null);setRawCount(0);setCopyLog([]);setStats(null);}}>
                처음으로
              </Btn>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  /* ── Layout ──────────────────────────────────────────── */
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

      {/* 메인 */}
      <div style={{background:C.bg,minHeight:"100vh",color:C.txt}}>
        {renderStepIndicator()}
        <div style={{maxWidth:960,margin:"0 auto",padding:"28px 20px 80px"}}>
          {step===0&&<Step0/>}
          {step===1&&<Step1/>}
          {step===2&&<Step2/>}
          {step===3&&<Step3/>}
          {step===4&&<Step4/>}
          {step===5&&<Step5/>}
          {step===6&&<Step6/>}
        </div>
      </div>
    </div>
  );
}
