"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ── 색상 ── */
const C = {
  teal: "#155855", green: "#22876A", white: "#FFFFFF",
  border: "rgba(21,88,85,.12)", muted: "#5A7470", hint: "#9BB5B0",
  txt: "#1C2B28", light: "#EAF4F2", bg: "#EDF5F3", red: "#DC2626",
};

const RAW_EXTS = new Set(["arw","cr2","cr3","nef","orf","raf","rw2","dng","pef","srw","x3f","3fr","mef","mrw"]);
const JPG_EXTS = new Set(["jpg","jpeg","heic","heif","tif","tiff","webp","png"]);
const MOBILE_CONVERT_DOWNLOAD = "/assets/tools/mobile-convert/PhotoClinicMobile1500_fixed.zip";
const PROGRAM_ARCHIVE_ITEMS = [
  {
    title: "PhotoClinic Mobile 1500px",
    meta: "Mac 전용 · 사진 변환",
    desc: "원본 사진 폴더를 선택하면 긴 변 1500px JPG로 변환하고 같은 위치의 Mobile_폴더명 폴더에 저장합니다.",
    href: MOBILE_CONVERT_DOWNLOAD,
  },
];

/* ── Types ── */
interface ScenePhoto {
  name: string;
  basename: string;
  handle: FileSystemFileHandle;
  thumbUrl: string | null;
  rating: number | null;   // Bridge XMP 별점 (1-5, null=없음)
}
interface SceneFolder {
  name: string;
  dirHandle: FileSystemDirectoryHandle;
  photos: ScenePhoto[];
}

type Step = "idle" | "loading" | "ready" | "preflight" | "matching" | "done" | "client_input" | "raw_pick";

interface Preflight {
  rawFound: number;
  willMatch: number;
  willMiss: number;
  rawSamples: string[];
  jpgSamples: string[];
}

/* ── Helpers ── */
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

/* ── XMP 별점 읽기 ──
   우선순위: 1) .xmp 사이드카  2) JPG 내 XMP 세그먼트
   xmp:Rating 값 1-5 반환, 없으면 null
── */
async function readRatingFromXmpText(text: string): Promise<number | null> {
  // <xmp:Rating>5</xmp:Rating>  또는  xmp:Rating="5"
  const m = text.match(/xmp:Rating[^>]*>(\d)/i) ?? text.match(/xmp:Rating="(\d)"/i);
  if (!m) return null;
  const r = parseInt(m[1]);
  return (r >= 1 && r <= 5) ? r : null;
}

async function readRatingSidecar(
  dirHandle: FileSystemDirectoryHandle, basename: string
): Promise<number | null> {
  try {
    const xmpHandle = await (dirHandle as any).getFileHandle(basename + ".xmp");
    const file = await xmpHandle.getFile();
    return readRatingFromXmpText(await file.text());
  } catch { return null; }
}

async function readRatingEmbedded(file: File): Promise<number | null> {
  try {
    // JPG XMP 세그먼트는 보통 처음 128KB 안에 있음
    const slice = file.slice(0, 131072);
    const buf = await slice.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const start = text.indexOf("<x:xmpmeta");
    if (start === -1) return null;
    const end = text.indexOf("</x:xmpmeta>", start);
    return readRatingFromXmpText(text.slice(start, end === -1 ? start + 4096 : end + 12));
  } catch { return null; }
}

async function readPhotoRating(
  dirHandle: FileSystemDirectoryHandle, photo: { basename: string; handle: FileSystemFileHandle }
): Promise<number | null> {
  // 사이드카 우선
  const sc = await readRatingSidecar(dirHandle, photo.basename);
  if (sc !== null) return sc;
  // 내장 XMP
  try {
    const file = await photo.handle.getFile();
    return readRatingEmbedded(file);
  } catch { return null; }
}

async function copyFileHandle(src: FileSystemFileHandle, dest: FileSystemDirectoryHandle, name: string) {
  const file = await src.getFile();
  const buf = await file.arrayBuffer();
  const fh = await (dest as any).getFileHandle(name, { create: true });
  const wr = await fh.createWritable();
  await wr.write(buf); await wr.close();
}

// 영상 파일처럼 큰 파일도 다룰 수 있도록 스트리밍으로 복사 (파일명으로 찾아 이동 기능 전용)
async function copyFileStreamed(src: FileSystemFileHandle, dest: FileSystemDirectoryHandle, name: string) {
  const file = await src.getFile();
  const fh = await (dest as any).getFileHandle(name, { create: true });
  const wr = await fh.createWritable();
  await file.stream().pipeTo(wr);
}

/* ── 파일명 목록 파싱: 확장자가 있으면 정확히, 없으면 베이스네임만 일치 ── */
interface NameQuery { raw: string; basenameLower: string; extLower: string | null }
function parseFileNameQueries(text: string): NameQuery[] {
  const tokens = text.split(/[\r\n,]+/).map(t => t.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: NameQuery[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const m = token.match(/^(.+)\.([A-Za-z0-9]{2,5})$/);
    if (m) out.push({ raw: token, basenameLower: m[1].toLowerCase(), extLower: m[2].toLowerCase() });
    else out.push({ raw: token, basenameLower: token.toLowerCase(), extLower: null });
  }
  return out;
}

async function prepareScreenshotForOcr(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 선택할 수 있습니다.");
  const bitmap = await createImageBitmap(file);
  const maxSide = 2400;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("이미지를 처리하지 못했습니다.");
  }
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.92);
}

/* ── 파일 순서 검토: 파일명 끝자리 숫자로 넘버링 누락 검사 ── */
interface SequenceCheckResult {
  totalFiles: number;
  recognizedNumbers: number[];      // 중복 제거 + 정렬됨
  unrecognizedFiles: string[];      // 번호를 못 찾은 파일명
  missingRanges: { start: number; end: number }[];
  min: number | null;
  max: number | null;
  rangeTooLarge: boolean;           // 인식 오류로 비정상적으로 큰 숫자가 섞였을 가능성
}

// 파일명 끝자리에 우연히 타임스탬프 같은 거대한 숫자가 붙어 있으면 min~max 범위가
// 수백만 단위로 벌어질 수 있다 — 그 구간을 전부 순회하면 브라우저가 멈추므로 상한을 둔다.
const SEQUENCE_RANGE_LIMIT = 200_000;

function checkFileSequence(fileNames: string[]): SequenceCheckResult {
  const numberSet = new Set<number>();
  const unrecognizedFiles: string[] = [];

  for (const name of fileNames) {
    const basename = name.replace(/\.[^.]+$/, "");
    const m = basename.match(/(\d+)$/);
    if (!m) { unrecognizedFiles.push(name); continue; }
    numberSet.add(Number(m[1]));
  }

  const recognizedNumbers = Array.from(numberSet).sort((a, b) => a - b);
  const min = recognizedNumbers.length > 0 ? recognizedNumbers[0] : null;
  const max = recognizedNumbers.length > 0 ? recognizedNumbers[recognizedNumbers.length - 1] : null;

  const missingRanges: { start: number; end: number }[] = [];
  const rangeTooLarge = min !== null && max !== null && (max - min) > SEQUENCE_RANGE_LIMIT;

  if (min !== null && max !== null && !rangeTooLarge) {
    let gapStart: number | null = null;
    for (let n = min; n <= max; n++) {
      if (numberSet.has(n)) {
        if (gapStart !== null) { missingRanges.push({ start: gapStart, end: n - 1 }); gapStart = null; }
      } else if (gapStart === null) {
        gapStart = n;
      }
    }
    if (gapStart !== null) missingRanges.push({ start: gapStart, end: max });
  }

  return { totalFiles: fileNames.length, recognizedNumbers, unrecognizedFiles, missingRanges, min, max, rangeTooLarge };
}

/* ── Component ── */
function Btn({ children, onClick, disabled, variant, style: s }: {
  children: React.ReactNode; onClick?: () => void;
  disabled?: boolean; variant?: "secondary"; style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        padding: "9px 20px", fontSize: 13, fontWeight: 700, borderRadius: 10,
        border: variant === "secondary" ? `1px solid ${C.border}` : "none",
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
        background: disabled ? C.border : variant === "secondary" ? C.white : C.teal,
        color: disabled ? C.hint : variant === "secondary" ? C.teal : C.white,
        opacity: disabled ? 0.6 : 1, transition: "opacity .15s", ...s,
      } as React.CSSProperties}
    >{children}</button>
  );
}

export default function SelectMatchPage() {
  const [step,       setStep]       = useState<Step>("idle");
  const [rootDir,    setRootDir]    = useState<FileSystemDirectoryHandle | null>(null);
  const [scenes,     setScenes]     = useState<SceneFolder[]>([]);
  const [expanded,   setExpanded]   = useState<Set<number>>(new Set());
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [ratingLoaded,  setRatingLoaded]  = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [rawRootDir,    setRawRootDir]    = useState<FileSystemDirectoryHandle | null>(null);
  const [preflight,  setPreflight]  = useState<Preflight | null>(null);
  const [rawIndexRef] = useState<{ map: Map<string, FileSystemFileHandle> }>(() => ({ map: new Map() }));
  const [log,        setLog]        = useState<string[]>([]);
  const [progress,   setProgress]   = useState({ cur: 0, total: 0, msg: "" });
  const [result,     setResult]     = useState({ matched: 0, missing: 0, selected: 0 });
  const cancelRef = useRef(false);

  // 마운트 전엔 false — 서버 렌더와 클라이언트 첫 렌더를 동일하게 유지해 hydration mismatch를 피한다
  const [hasFS, setHasFS] = useState(false);
  useEffect(() => { setHasFS("showDirectoryPicker" in window); }, []);

  /* ── 클라이언트 입력 모드 상태 ── */
  const [inputMode,     setInputMode]     = useState<"folder" | "text" | "upload">("folder");
  const [clientText,    setClientText]    = useState("");
  const [clientDragging,setClientDragging]= useState(false);
  const clientFileRef = useRef<HTMLInputElement>(null);

  /* ── 기능 선택: RAW 매칭 vs 파일명 이동 vs 순서 검토 vs 프로그램 아카이브 ── */
  const [feature, setFeature] = useState<"raw_match" | "find_move" | "seq_check" | "program_archive">("raw_match");

  /* ── 파일 순서 검토 — 상태 ── */
  const [scRootDir, setScRootDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [scStep,    setScStep]    = useState<"idle" | "scanning" | "result">("idle");
  const [scResult,  setScResult]  = useState<SequenceCheckResult | null>(null);

  /* ── 파일명으로 찾아 이동 — 상태 ── */
  const [fmRootDir,   setFmRootDir]   = useState<FileSystemDirectoryHandle | null>(null);
  const [fmText,      setFmText]      = useState("");
  const [fmFolderName, setFmFolderName] = useState("선택");
  const [fmStep,      setFmStep]      = useState<"idle" | "scanning" | "result" | "moving" | "done">("idle");
  const [fmMatches,   setFmMatches]   = useState<{ query: string; name: string; handle: FileSystemFileHandle; parentDir: FileSystemDirectoryHandle }[]>([]);
  const [fmMissing,   setFmMissing]   = useState<string[]>([]);
  const [fmProgress,  setFmProgress]  = useState({ cur: 0, total: 0 });
  const [fmMovedCount, setFmMovedCount] = useState(0);
  const [fmOcrLoading, setFmOcrLoading] = useState(false);
  const [fmOcrMessage, setFmOcrMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const fmOcrFileRef = useRef<HTMLInputElement>(null);

  /* ── 텍스트에서 파일명 파싱 ── */
  const parseNamesFromText = (text: string): Set<string> => {
    const re = /[\w\-가-힣]+\.(jpg|jpeg|heic|heif|tif|tiff|png|arw|cr2|cr3|nef|orf|raf|rw2|dng)/gi;
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) found.add(m[0].replace(/\.[^.]+$/, "").toLowerCase());
    return found;
  };

  /* ── 파일 업로드에서 파일명 추출 ── */
  const parseNamesFromFiles = (files: FileList | File[]): Set<string> => {
    const found = new Set<string>();
    Array.from(files).forEach(f => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (JPG_EXTS.has(ext) || RAW_EXTS.has(ext)) {
        found.add(f.name.replace(/\.[^.]+$/, "").toLowerCase());
      }
    });
    return found;
  };

  /* ── 클라이언트 선택 확정 → raw_pick 단계로 ── */
  const confirmClientInput = (names: Set<string>) => {
    if (names.size === 0) { alert("파일명을 찾지 못했습니다. 파일명(DSC_0142.jpg 형태)이 포함된 텍스트를 붙여넣어 주세요."); return; }
    setSelected(names);
    setStep("raw_pick");
  };

  /* ── RAW 폴더 별도 선택 ── */
  const pickRawFolder = useCallback(async () => {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      setRawRootDir(dir);
    } catch (e: any) {
      if (e?.name !== "AbortError") alert("폴더 선택 실패");
    }
  }, []);

  /* ── 폴더 로드: JPG/SceneXX/ 구조 스캔 ── */
  const loadFolder = useCallback(async () => {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      setRootDir(dir);
      setStep("loading");
      setProgress({ cur: 0, total: 0, msg: "JPG 폴더 스캔 중..." });

      // JPG/ 폴더 탐색
      let jpgBase: FileSystemDirectoryHandle | null = null;
      try { jpgBase = await (dir as any).getDirectoryHandle("JPG"); } catch {}

      // JPG/ 없으면 루트 직접 사용
      const scanDir = jpgBase ?? dir;
      const sceneList: SceneFolder[] = [];

      for await (const [name, handle] of (scanDir as any).entries()) {
        if (handle.kind !== "directory") continue;
        if (!name.toLowerCase().startsWith("scene") && !name.toLowerCase().startsWith("씬")) continue;
        const sceneDir = handle as FileSystemDirectoryHandle;
        const photos: ScenePhoto[] = [];

        for await (const [fname, fhandle] of (sceneDir as any).entries()) {
          if (fhandle.kind !== "file") continue;
          const ext = fname.split(".").pop()?.toLowerCase() ?? "";
          if (!JPG_EXTS.has(ext)) continue;
          photos.push({
            name: fname,
            basename: fname.replace(/\.[^.]+$/, ""),
            handle: fhandle as FileSystemFileHandle,
            thumbUrl: null,
            rating: null,
          });
        }
        photos.sort((a, b) => a.name.localeCompare(b.name));
        if (photos.length > 0) sceneList.push({ name, dirHandle: sceneDir, photos });
      }

      sceneList.sort((a, b) => a.name.localeCompare(b.name));
      setScenes(sceneList);
      setSelected(new Set());
      setExpanded(new Set());
      setRatingLoaded(false);

      // XMP 사이드카 빠른 스캔 → 이후 JPG 내장 XMP 자동 딥스캔
      setStep("ready");
      setRatingLoading(true);

      // 1단계: .xmp 사이드카
      const afterSidecar = await Promise.all(sceneList.map(async (scene) => ({
        ...scene,
        photos: await Promise.all(scene.photos.map(async (p) => ({
          ...p,
          rating: await readRatingSidecar(scene.dirHandle, p.basename),
        }))),
      })));
      setScenes(afterSidecar);

      // 2단계: 사이드카 없는 JPG는 내장 XMP 스캔
      const afterEmbedded = await Promise.all(afterSidecar.map(async (scene) => ({
        ...scene,
        photos: await Promise.all(scene.photos.map(async (p) => {
          if (p.rating !== null) return p;
          try {
            const file = await p.handle.getFile();
            return { ...p, rating: await readRatingEmbedded(file) };
          } catch { return p; }
        })),
      })));
      setScenes(afterEmbedded);

      // 별점 있는 사진 자동 선택
      const autoKeys = new Set<string>();
      for (const scene of afterEmbedded) {
        for (const p of scene.photos) {
          if (p.rating !== null && p.rating >= 1) autoKeys.add(p.basename.toLowerCase());
        }
      }
      if (autoKeys.size > 0) setSelected(autoKeys);

      setRatingLoaded(true);
      setRatingLoading(false);
    } catch (e: any) {
      if (e?.name !== "AbortError") alert("폴더를 읽는 중 오류가 발생했습니다.");
      setStep("idle");
    }
  }, []);

  /* ── JPG 내장 XMP 딥스캔 (사이드카 없을 때) ── */
  const loadEmbeddedRatings = useCallback(async () => {
    setRatingLoading(true);
    const updated = await Promise.all(scenes.map(async (scene) => ({
      ...scene,
      photos: await Promise.all(scene.photos.map(async (p) => {
        if (p.rating !== null) return p;
        try {
          const file = await p.handle.getFile();
          return { ...p, rating: await readRatingEmbedded(file) };
        } catch { return p; }
      })),
    })));
    setScenes(updated);
    setRatingLoaded(true);
    setRatingLoading(false);
  }, [scenes]);

  /* ── 별점 기준 자동 선택 ── */
  const autoSelectByRating = useCallback((minRating: number) => {
    const keys = new Set<string>();
    for (const scene of scenes) {
      for (const p of scene.photos) {
        if (p.rating !== null && p.rating >= minRating) {
          keys.add(p.basename.toLowerCase());
        }
      }
    }
    setSelected(keys);
  }, [scenes]);

  /* ── 씬 썸네일 로드 ── */
  const loadSceneThumbs = useCallback(async (sceneIdx: number) => {
    const scene = scenes[sceneIdx];
    if (!scene) return;
    const updated = await Promise.all(
      scene.photos.map(async (p) => {
        if (p.thumbUrl) return p;
        try {
          const file = await p.handle.getFile();
          const url = await loadThumb(file, 130);
          return { ...p, thumbUrl: url };
        } catch { return p; }
      })
    );
    setScenes(prev => prev.map((s, i) => i === sceneIdx ? { ...s, photos: updated } : s));
  }, [scenes]);

  /* ── 재귀 RAW 스캔 공통 함수 ── */
  const buildRawIndex = useCallback(async (overrideRawDir?: FileSystemDirectoryHandle): Promise<Map<string, FileSystemFileHandle>> => {
    const effectiveRawDir = overrideRawDir ?? rawRootDir;
    const rawIndex = new Map<string, FileSystemFileHandle>();
    const scanDir = async (dir: FileSystemDirectoryHandle, depth = 0) => {
      if (depth > 5) return;
      for await (const [name, handle] of (dir as any).entries()) {
        if (name === "Selected_RAW") continue; // 출력 폴더는 스킵
        if ((handle as FileSystemHandle).kind === "directory") {
          await scanDir(handle as FileSystemDirectoryHandle, depth + 1);
        } else {
          const ext = name.split(".").pop()?.toLowerCase() ?? "";
          if (RAW_EXTS.has(ext)) rawIndex.set(name.replace(/\.[^.]+$/, "").toLowerCase(), handle as FileSystemFileHandle);
        }
      }
    };
    if (effectiveRawDir) {
      await scanDir(effectiveRawDir);
    } else if (rootDir) {
      try { await scanDir(await (rootDir as any).getDirectoryHandle("RAW")); } catch {}
      if (rawIndex.size === 0) await scanDir(rootDir!);
    }
    return rawIndex;
  }, [rootDir, rawRootDir]);

  /* ── 사전 확인 (preflight) ── */
  const runPreflight = useCallback(async (overrideRawDir?: FileSystemDirectoryHandle) => {
    if (selected.size === 0) return;
    if (!rootDir && !rawRootDir && !overrideRawDir) return;
    if (overrideRawDir) setRawRootDir(overrideRawDir);
    setStep("preflight");
    setPreflight(null);
    const rawIndex = await buildRawIndex(overrideRawDir);
    rawIndexRef.map.clear();
    for (const [k, v] of rawIndex) rawIndexRef.map.set(k, v);

    const selArr = Array.from(selected);
    const willMatch = selArr.filter(b => rawIndex.has(b)).length;
    const pf: Preflight = {
      rawFound: rawIndex.size,
      willMatch,
      willMiss: selArr.length - willMatch,
      rawSamples: Array.from(rawIndex.keys()).slice(0, 4),
      jpgSamples: selArr.slice(0, 4),
    };
    setPreflight(pf);
  }, [rootDir, selected, buildRawIndex, rawIndexRef]);

  /* ── 실제 복사 실행 ── */
  const runMatch = useCallback(async () => {
    if (!rootDir || selected.size === 0) return;
    setStep("matching");
    cancelRef.current = false;
    const logLines: string[] = [];
    const addLog = (l: string) => { logLines.push(l); setLog([...logLines]); };

    // preflight에서 캐시된 인덱스 사용 (없으면 재스캔)
    let rawIndex = rawIndexRef.map;
    if (rawIndex.size === 0) {
      addLog("📂 RAW 탐색 중...");
      rawIndex = await buildRawIndex();
      rawIndexRef.map.clear();
      for (const [k, v] of rawIndex) rawIndexRef.map.set(k, v);
    }
    addLog(`✅ RAW ${rawIndex.size}개 / JPG 선택 ${selected.size}개`);

    if (rawIndex.size === 0) {
      addLog("❌ RAW 파일을 찾을 수 없습니다.");
      setStep("ready"); return;
    }

    const outputBase = rawRootDir ?? rootDir!;
    const rawSelectDir = await (outputBase as any).getDirectoryHandle("Selected_RAW", { create: true }) as FileSystemDirectoryHandle;
    addLog("📁 Selected_RAW/ 생성 완료");

    let matched = 0, missing = 0, done = 0;
    for (const basename of selected) {
      if (cancelRef.current) break;
      setProgress({ cur: done, total: selected.size, msg: `매칭: ${basename}` });
      const handle = rawIndex.get(basename);
      if (handle) {
        const rawFile = await handle.getFile();
        try { await copyFileHandle(handle, rawSelectDir, rawFile.name); addLog(`✅ ${rawFile.name}`); matched++; }
        catch { addLog(`❌ 실패: ${rawFile.name}`); }
      } else {
        addLog(`⚠️ RAW 없음: ${basename}`);
        missing++;
      }
      done++;
    }
    setResult({ matched, missing, selected: selected.size });
    setStep("done");
  }, [rootDir, rawRootDir, selected, buildRawIndex, rawIndexRef]);

  const totalPhotos = scenes.reduce((a, s) => a + s.photos.length, 0);

  /* ── 파일명으로 찾아 이동: 폴더 선택 ── */
  const pickFmFolder = useCallback(async () => {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      setFmRootDir(dir);
    } catch (e: any) {
      if (e?.name !== "AbortError") alert("폴더 선택 실패");
    }
  }, []);

  const extractFmNamesFromScreenshot = useCallback(async (file: File | null) => {
    if (!file || fmOcrLoading) return;
    setFmOcrLoading(true);
    setFmOcrMessage(null);
    try {
      const imageBase64 = await prepareScreenshotForOcr(file);
      const response = await fetch("/api/select-match/ocr-filenames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error || "파일명 추출에 실패했습니다.");
      setFmText(data.oneLine);
      setFmOcrMessage({ text: `파일명 ${data.filenames.length}개를 한 줄로 정리했습니다.`, ok: true });
    } catch (error) {
      setFmOcrMessage({ text: error instanceof Error ? error.message : "파일명 추출에 실패했습니다.", ok: false });
    } finally {
      setFmOcrLoading(false);
      if (fmOcrFileRef.current) fmOcrFileRef.current.value = "";
    }
  }, [fmOcrLoading]);

  /* ── 파일명으로 찾아 이동: 폴더 재귀 검색 + 매칭 ── */
  const runFindByName = useCallback(async () => {
    if (!fmRootDir) return;
    const queries = parseFileNameQueries(fmText);
    if (queries.length === 0) { alert("파일명을 입력해주세요."); return; }
    setFmStep("scanning");

    const index = new Map<string, { name: string; handle: FileSystemFileHandle; extLower: string; parentDir: FileSystemDirectoryHandle }[]>();
    const scanDir = async (dir: FileSystemDirectoryHandle, depth = 0) => {
      if (depth > 5) return;
      for await (const [name, handle] of (dir as any).entries()) {
        if (name === fmFolderName) continue; // 출력 폴더는 스킵
        if ((handle as FileSystemHandle).kind === "directory") {
          await scanDir(handle as FileSystemDirectoryHandle, depth + 1);
        } else {
          const m = (name as string).match(/^(.+)\.([A-Za-z0-9]{2,5})$/);
          if (!m) continue;
          const basenameLower = m[1].toLowerCase();
          const extLower = m[2].toLowerCase();
          const list = index.get(basenameLower) ?? [];
          list.push({ name: name as string, handle: handle as FileSystemFileHandle, extLower, parentDir: dir });
          index.set(basenameLower, list);
        }
      }
    };
    await scanDir(fmRootDir);

    const matches: { query: string; name: string; handle: FileSystemFileHandle; parentDir: FileSystemDirectoryHandle }[] = [];
    const missing: string[] = [];
    for (const q of queries) {
      const candidates = index.get(q.basenameLower) ?? [];
      const picked = q.extLower ? candidates.filter((c) => c.extLower === q.extLower) : candidates;
      if (picked.length === 0) { missing.push(q.raw); continue; }
      for (const c of picked) matches.push({ query: q.raw, name: c.name, handle: c.handle, parentDir: c.parentDir });
    }
    // 같은 파일이 여러 질의에 중복 매치되면 하나로 합친다
    const uniqueMatches = Array.from(new Map(matches.map((m) => [m.name, m])).values());

    setFmMatches(uniqueMatches);
    setFmMissing(missing);
    setFmStep("result");
  }, [fmRootDir, fmText, fmFolderName]);

  /* ── 파일명으로 찾아 이동: 매칭된 파일을 선택 폴더로 이동 ── */
  const runMoveMatched = useCallback(async () => {
    if (!fmRootDir || fmMatches.length === 0) return;
    setFmStep("moving");
    const destDir = await (fmRootDir as any).getDirectoryHandle(fmFolderName, { create: true }) as FileSystemDirectoryHandle;
    let moved = 0;
    for (let i = 0; i < fmMatches.length; i++) {
      const m = fmMatches[i];
      setFmProgress({ cur: i, total: fmMatches.length });
      try {
        await copyFileStreamed(m.handle, destDir, m.name);
        await (m.parentDir as any).removeEntry(m.name);
        moved++;
      } catch {}
    }
    setFmMovedCount(moved);
    setFmStep("done");
  }, [fmRootDir, fmMatches, fmFolderName]);

  const resetFindByName = () => {
    setFmStep("idle"); setFmMatches([]); setFmMissing([]); setFmMovedCount(0); setFmText(""); setFmOcrMessage(null);
  };

  /* ── 파일 순서 검토: 폴더 선택 ── */
  const pickScFolder = useCallback(async () => {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: "read" });
      setScRootDir(dir);
    } catch (e: any) {
      if (e?.name !== "AbortError") alert("폴더 선택 실패");
    }
  }, []);

  /* ── 파일 순서 검토: 폴더 직속 파일만 스캔 후 넘버링 검사 ── */
  // 분류 후에는 파일이 여러 하위 폴더(Scene01/, PROFILE/ 등)에 흩어지지만 파일명은 그대로
  // 유지되므로, 폴더 구조·순서와 무관하게 하위 폴더까지 전부 훑어 파일명만 모은다.
  const runSequenceCheck = useCallback(async () => {
    if (!scRootDir) return;
    setScStep("scanning");
    const names: string[] = [];
    const scanDir = async (dir: FileSystemDirectoryHandle, depth = 0) => {
      if (depth > 8) return;
      for await (const [name, handle] of (dir as any).entries()) {
        if ((handle as FileSystemHandle).kind === "directory") {
          await scanDir(handle as FileSystemDirectoryHandle, depth + 1);
        } else {
          const ext = (name as string).split(".").pop()?.toLowerCase() ?? "";
          if (!RAW_EXTS.has(ext) && !JPG_EXTS.has(ext)) continue;
          names.push(name as string);
        }
      }
    };
    await scanDir(scRootDir);
    setScResult(checkFileSequence(names));
    setScStep("result");
  }, [scRootDir]);

  const resetSequenceCheck = () => {
    setScStep("idle"); setScResult(null); setScRootDir(null);
  };

  const formatMissingRange = (r: { start: number; end: number }) =>
    r.start === r.end ? `${r.start}` : `${r.start}~${r.end} (${r.end - r.start + 1}개)`;

  /* ── 상단 기능 전환 탭 (두 기능 진입점에서만 노출) ── */
  const FeatureTabs = () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 20 }}>
      <button onClick={() => setFeature("raw_match")} style={{
        padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        border: `1.5px solid ${feature === "raw_match" ? C.teal : C.border}`,
        background: feature === "raw_match" ? C.light : C.white,
        color: feature === "raw_match" ? C.teal : C.muted, fontSize: 12, fontWeight: 800,
      }}>🎯 셀렉 &amp; RAW 매칭</button>
      <button onClick={() => setFeature("find_move")} style={{
        padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        border: `1.5px solid ${feature === "find_move" ? C.teal : C.border}`,
        background: feature === "find_move" ? C.light : C.white,
        color: feature === "find_move" ? C.teal : C.muted, fontSize: 12, fontWeight: 800,
      }}>📋 파일명으로 찾기</button>
      <button onClick={() => setFeature("seq_check")} style={{
        padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        border: `1.5px solid ${feature === "seq_check" ? C.teal : C.border}`,
        background: feature === "seq_check" ? C.light : C.white,
        color: feature === "seq_check" ? C.teal : C.muted, fontSize: 12, fontWeight: 800,
      }}>🔢 파일 순서 검토</button>
      <button onClick={() => setFeature("program_archive")} style={{
        padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        border: `1.5px solid ${feature === "program_archive" ? C.teal : C.border}`,
        background: feature === "program_archive" ? C.light : C.white,
        color: feature === "program_archive" ? C.teal : C.muted, fontSize: 11, fontWeight: 800,
      }}>📱 모바일 자동화 &gt; 프로그램 아카이브</button>
    </div>
  );

  /* ── 모바일 자동화 > 프로그램 아카이브 ── */
  if (feature === "program_archive") return (
    <div style={{ maxWidth: 760, margin: "32px auto", padding: "0 20px" }}>
      <FeatureTabs />
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>📱</div>
        <div style={{ fontSize: 16, fontWeight: 900, color: C.teal }}>모바일 자동화 &gt; 프로그램 아카이브</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>사진 작업실에서 사용하는 자동화 프로그램을 모아둔 자료실입니다.</div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {PROGRAM_ARCHIVE_ITEMS.map((item) => (
          <div key={item.href} style={{
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
            padding: 18, display: "grid", gridTemplateColumns: "1fr auto", gap: 16,
            alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.hint, marginBottom: 5 }}>{item.meta}</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.txt, marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{item.desc}</div>
            </div>
            <a href={item.href} download style={{
              display: "inline-block", padding: "9px 16px", borderRadius: 10,
              background: C.teal, color: C.white, fontSize: 12, fontWeight: 800,
              textDecoration: "none", whiteSpace: "nowrap",
            }}>다운로드</a>
          </div>
        ))}
      </div>
    </div>
  );

  /* ── 파일명으로 찾아 이동 ── */
  if (feature === "find_move") {
    if (fmStep === "idle") return (
      <div style={{ maxWidth: 660, margin: "32px auto", padding: "0 20px" }}>
        <FeatureTabs />
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.teal }}>파일명으로 찾기</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>파일명 목록을 붙여넣으면 폴더에서 찾아 선택 폴더로 이동합니다.</div>
        </div>

        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.txt, marginBottom: 8 }}>1. 검색할 폴더 선택 (하위 폴더까지 검색)</div>
            {!hasFS ? (
              <div style={{ fontSize: 12, color: C.red }}>Chrome 또는 Edge를 사용해주세요.</div>
            ) : (
              <Btn onClick={pickFmFolder}>{fmRootDir ? `✅ ${fmRootDir.name}` : "📂 폴더 선택"}</Btn>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.txt, marginBottom: 8 }}>2. 파일명 목록 (한 줄에 하나씩, 또는 쉼표로 구분)</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <input
                ref={fmOcrFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => extractFmNamesFromScreenshot(e.target.files?.[0] ?? null)}
              />
              <Btn
                variant="secondary"
                disabled={fmOcrLoading}
                onClick={() => fmOcrFileRef.current?.click()}
                style={{ padding: "8px 13px" }}
              >
                {fmOcrLoading ? "🔎 이미지 읽는 중..." : "📷 스크린샷에서 파일명 추출"}
              </Btn>
              <span style={{ fontSize: 11, color: C.hint }}>확장자를 제거하고 쉼표로 구분한 한 줄로 자동 입력합니다.</span>
            </div>
            {fmOcrMessage && (
              <div style={{
                marginBottom: 10, borderRadius: 8, padding: "9px 12px", fontSize: 11, fontWeight: 700,
                color: fmOcrMessage.ok ? C.green : C.red,
                background: fmOcrMessage.ok ? C.light : "#FEF2F2",
              }}>
                {fmOcrMessage.text}
              </div>
            )}
            <textarea
              value={fmText}
              onChange={(e) => setFmText(e.target.value)}
              placeholder={"예시:\nDSC_0142.jpg\nDSC_0145.mp4\nDSC_0148  ← 확장자 생략 시 모든 확장자 파일을 찾습니다"}
              rows={7}
              style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", resize: "vertical", background: C.bg, color: C.txt, boxSizing: "border-box" }}
            />
            {fmText.trim() && (
              <div style={{ marginTop: 10, background: C.light, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: C.muted }}>
                파일명 <strong style={{ color: C.teal }}>{parseFileNameQueries(fmText).length}개</strong> 입력됨
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.txt, marginBottom: 8 }}>3. 이동할 선택 폴더 이름</div>
            <input
              value={fmFolderName}
              onChange={(e) => setFmFolderName(e.target.value || "선택")}
              style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
            />
            <div style={{ fontSize: 11, color: C.hint, marginTop: 6 }}>선택한 폴더 안에 이 이름으로 폴더가 생성되고, 찾은 파일이 그 안으로 이동합니다.</div>
          </div>

          <div style={{ textAlign: "center" }}>
            <Btn onClick={runFindByName} disabled={!fmRootDir || !fmText.trim()}>🔍 폴더에서 찾기 →</Btn>
          </div>
        </div>
      </div>
    );

    if (fmStep === "scanning") return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <div style={{ fontSize: 30, marginBottom: 12 }}>🔍</div>
        <div style={{ fontSize: 13, color: C.muted }}>폴더를 검색하는 중입니다...</div>
      </div>
    );

    if (fmStep === "result") return (
      <div style={{ maxWidth: 660, margin: "32px auto", padding: "0 20px" }}>
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 900, color: C.teal }}>
            검색 결과 — 찾음 {fmMatches.length}개 · 못 찾음 {fmMissing.length}개
          </div>
          <div style={{ padding: 20 }}>
            {fmMatches.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: fmMissing.length > 0 ? 14 : 0 }}>
                {fmMatches.map((m) => (
                  <div key={m.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, color: C.txt, borderBottom: `1px solid ${C.border}` }}>
                    <span>{m.name}</span>
                    <span style={{ color: C.hint }}>{m.query}</span>
                  </div>
                ))}
              </div>
            )}
            {fmMissing.length > 0 && (
              <div style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red }}>
                ⚠️ 못 찾은 파일명 {fmMissing.length}개: {fmMissing.join(", ")}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <Btn variant="secondary" onClick={resetFindByName}>← 다시 검색</Btn>
          <Btn onClick={runMoveMatched} disabled={fmMatches.length === 0}>📁 {fmFolderName}/ 폴더로 이동 →</Btn>
        </div>
      </div>
    );

    if (fmStep === "moving") {
      const pct = fmProgress.total > 0 ? Math.round((fmProgress.cur / fmProgress.total) * 100) : 0;
      return (
        <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px" }}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 8, textAlign: "center" }}>{fmProgress.cur} / {fmProgress.total} 이동 중...</div>
          <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: C.teal, transition: "width .2s" }} />
          </div>
        </div>
      );
    }

    if (fmStep === "done") return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <div style={{ fontSize: 30, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.txt, marginBottom: 20 }}>
          {fmMovedCount}개 파일을 <strong style={{ color: C.teal }}>{fmFolderName}/</strong> 폴더로 이동했습니다.
        </div>
        <Btn onClick={resetFindByName}>새로 검색하기</Btn>
      </div>
    );
  }

  /* ── 파일 순서 검토 ── */
  if (feature === "seq_check") {
    if (scStep === "idle") return (
      <div style={{ maxWidth: 660, margin: "32px auto", padding: "0 20px" }}>
        <FeatureTabs />
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🔢</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.teal }}>파일 순서 검토</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>폴더를 지정하면 파일명 끝자리 번호(예: DSC03532 → 3532)로 넘버링이 끊긴 곳(누락 파일)이 있는지 검사합니다.</div>
        </div>

        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, textAlign: "center" }}>
          {!hasFS ? (
            <div style={{ fontSize: 12, color: C.red }}>Chrome 또는 Edge를 사용해주세요.</div>
          ) : (
            <>
              <Btn onClick={pickScFolder}>{scRootDir ? `✅ ${scRootDir.name}` : "📂 폴더 선택"}</Btn>
              <div style={{ fontSize: 11, color: C.hint, marginTop: 10 }}>선택한 폴더의 하위 폴더까지 전부 검사합니다 — 파일이 여러 폴더에 나뉘어 있어도 파일명 기준으로 하나의 순서로 검사합니다.</div>
              {scRootDir && (
                <div style={{ marginTop: 16 }}>
                  <Btn onClick={runSequenceCheck}>🔍 순서 검토 시작 →</Btn>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );

    if (scStep === "scanning") return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: C.muted }}>폴더를 스캔하는 중...</div>
      </div>
    );

    if (scStep === "result" && scResult) {
      const hasMissing = scResult.missingRanges.length > 0;
      return (
        <div style={{ maxWidth: 660, margin: "32px auto", padding: "0 20px" }}>
          <FeatureTabs />
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.txt, marginBottom: 4 }}>
              총 {scResult.totalFiles}개 파일
              {scResult.min !== null && scResult.max !== null && ` · 번호 범위 ${scResult.min}~${scResult.max}`}
            </div>

            {scResult.recognizedNumbers.length === 0 ? (
              <div style={{ background: C.bg, borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.muted, marginTop: 12 }}>
                번호를 인식할 수 있는 파일이 없습니다.
              </div>
            ) : scResult.rangeTooLarge ? (
              <div style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red, marginTop: 12 }}>
                ⚠️ 번호 범위가 비정상적으로 커서({scResult.min}~{scResult.max}) 검사할 수 없습니다. 파일명에 날짜·시간 등 다른 숫자가 섞여 잘못 인식됐을 가능성이 있습니다.
              </div>
            ) : hasMissing ? (
              <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8, padding: "12px 14px", marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#C2410C", marginBottom: 6 }}>⚠️ 누락 {scResult.missingRanges.length}건</div>
                <div style={{ fontSize: 12, color: C.txt, lineHeight: 1.8 }}>
                  {scResult.missingRanges.map(formatMissingRange).join(", ")}
                </div>
              </div>
            ) : (
              <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "12px 14px", marginTop: 12, fontSize: 13, fontWeight: 700, color: C.green }}>
                ✅ 번호가 모두 연속되어 있습니다. 누락된 파일이 없습니다.
              </div>
            )}

            {scResult.unrecognizedFiles.length > 0 && (
              <div style={{ background: C.bg, borderRadius: 8, padding: "12px 14px", marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>번호 인식 불가 (검사에서 제외됨) {scResult.unrecognizedFiles.length}개</div>
                <div style={{ fontSize: 11, color: C.hint, maxHeight: 120, overflowY: "auto" }}>{scResult.unrecognizedFiles.join(", ")}</div>
              </div>
            )}
          </div>
          <div style={{ textAlign: "center" }}>
            <Btn variant="secondary" onClick={resetSequenceCheck}>← 다시 선택</Btn>
          </div>
        </div>
      );
    }
  }

  /* ── Idle ── */
  if (step === "idle") return (
    <div style={{ maxWidth: 660, margin: "32px auto", padding: "0 20px" }}>
      <FeatureTabs />
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>🎯</div>
        <div style={{ fontSize: 16, fontWeight: 900, color: C.teal }}>셀렉 & RAW 매칭</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>고객 선택 정보를 어떻게 받으셨나요?</div>
      </div>

      {/* 3가지 진입 모드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        {([
          { key: "folder", icon: "📂", title: "폴더 직접 선택", desc: "JPG 폴더를 열어서\n시각적으로 베스트컷 선택" },
          { key: "text",   icon: "💬", title: "텍스트 붙여넣기", desc: "카카오톡·메모 등\n파일명 목록을 붙여넣기" },
          { key: "upload", icon: "⬆",  title: "파일 업로드",    desc: "고객이 보낸 JPG 파일을\n직접 드래그 & 드롭" },
        ] as const).map(m => (
          <div key={m.key} onClick={() => setInputMode(m.key)}
            style={{
              background: inputMode === m.key ? C.light : C.white,
              border: `1.5px solid ${inputMode === m.key ? C.teal : C.border}`,
              borderRadius: 12, padding: "18px 14px", textAlign: "center", cursor: "pointer",
              transition: "all .15s",
            }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>{m.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: inputMode === m.key ? C.teal : C.txt, marginBottom: 4 }}>{m.title}</div>
            <div style={{ fontSize: 10, color: C.hint, lineHeight: 1.6, whiteSpace: "pre-line" }}>{m.desc}</div>
          </div>
        ))}
      </div>

      {/* 폴더 선택 모드 */}
      {inputMode === "folder" && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.8, marginBottom: 18, textAlign: "center" }}>
            분류된 폴더(JPG/SceneXX/ 구조)를 선택하면<br />
            씬별 사진을 보면서 베스트컷을 클릭으로 선택할 수 있습니다.
          </div>
          {!hasFS ? (
            <div style={{ fontSize: 12, color: C.red, textAlign: "center" }}>Chrome 또는 Edge를 사용해주세요.</div>
          ) : (
            <div style={{ textAlign: "center" }}><Btn onClick={loadFolder}>📂 폴더 선택</Btn></div>
          )}
          <div style={{ marginTop: 16, background: C.light, borderRadius: 8, padding: "12px 14px", fontSize: 11, color: C.muted, lineHeight: 1.9 }}>
            촬영폴더/<br />
            &nbsp;&nbsp;├ <strong>JPG/Scene01/, Scene02/, ...</strong> ← 여기 선택<br />
            &nbsp;&nbsp;├ <strong>RAW/</strong> — 전체 RAW<br />
            &nbsp;&nbsp;└ <strong>Selected_RAW/</strong> — 결과물 자동 생성
          </div>
        </div>
      )}

      {/* 텍스트 붙여넣기 모드 */}
      {inputMode === "text" && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 14 }}>
            카카오톡 대화, 이메일, 메모 등에서 파일명이 담긴 텍스트를 그대로 붙여넣으세요.<br />
            <span style={{ color: C.hint }}>DSC_0142.jpg 형태의 파일명을 자동 추출합니다.</span>
          </div>
          <textarea
            value={clientText}
            onChange={e => setClientText(e.target.value)}
            placeholder={"예시:\nDSC_0142.jpg, DSC_0145.jpg\nDSC_0148.jpg\nDSC_0151.jpg ..."}
            rows={7}
            style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", resize: "vertical", background: C.bg, color: C.txt, boxSizing: "border-box" }}
          />
          {clientText.trim() && (() => {
            const names = parseNamesFromText(clientText);
            return (
              <div style={{ marginTop: 10, background: C.light, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: C.muted }}>
                파일명 <strong style={{ color: C.teal }}>{names.size}개</strong> 추출됨
                {names.size > 0 && (
                  <span style={{ marginLeft: 8, color: C.hint }}>
                    {Array.from(names).slice(0, 3).join(", ")}{names.size > 3 ? ` 외 ${names.size - 3}개` : ""}
                  </span>
                )}
              </div>
            );
          })()}
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <Btn onClick={() => confirmClientInput(parseNamesFromText(clientText))} disabled={!clientText.trim()}>
              다음 — RAW 폴더 선택 →
            </Btn>
          </div>
        </div>
      )}

      {/* 파일 업로드 모드 */}
      {inputMode === "upload" && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 14 }}>
            고객이 선택해서 보낸 JPG 파일들을 아래 영역에 드래그하거나 클릭해서 선택하세요.<br />
            <span style={{ color: C.hint }}>파일 내용은 읽지 않고 파일명만 추출합니다.</span>
          </div>
          <input ref={clientFileRef} type="file" multiple accept="image/*,.jpg,.jpeg,.heic,.png,.tif"
            style={{ display: "none" }}
            onChange={e => { if (e.target.files) confirmClientInput(parseNamesFromFiles(e.target.files)); }} />
          <div
            onDragOver={e => { e.preventDefault(); setClientDragging(true); }}
            onDragLeave={() => setClientDragging(false)}
            onDrop={e => { e.preventDefault(); setClientDragging(false); confirmClientInput(parseNamesFromFiles(e.dataTransfer.files)); }}
            onClick={() => clientFileRef.current?.click()}
            style={{
              border: `2px dashed ${clientDragging ? C.teal : C.border}`,
              borderRadius: 12, padding: "48px 24px", textAlign: "center", cursor: "pointer",
              background: clientDragging ? C.light : C.bg, transition: "all .2s",
            }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📁</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.teal, marginBottom: 4 }}>파일을 드래그하거나 클릭</div>
            <div style={{ fontSize: 11, color: C.hint }}>파일 내용은 업로드되지 않습니다 — 파일명만 사용</div>
          </div>
        </div>
      )}
    </div>
  );

  /* ── RAW 폴더 선택 (client_input 이후) ── */
  if (step === "raw_pick") return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: "0 24px" }}>
      <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, padding: 28 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: C.teal, marginBottom: 6 }}>📂 RAW 폴더를 선택하세요</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}>
          고객 선택 파일명 <strong style={{ color: C.teal }}>{selected.size}개</strong>를 확인했습니다.<br />
          이제 RAW 파일이 들어있는 폴더를 선택하세요.<br />
          매칭된 RAW 파일은 <strong>Selected_RAW/</strong> 폴더에 복사됩니다.
        </div>
        <div style={{ background: C.light, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: C.muted, marginBottom: 18 }}>
          <div style={{ fontWeight: 700, color: C.teal, marginBottom: 4 }}>추출된 파일명 샘플</div>
          {Array.from(selected).slice(0, 5).map(n => (
            <div key={n} style={{ fontFamily: "monospace", fontSize: 11 }}>{n}</div>
          ))}
          {selected.size > 5 && <div style={{ color: C.hint }}>... 외 {selected.size - 5}개</div>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="secondary" onClick={() => { setStep("idle"); setSelected(new Set()); }}>← 취소</Btn>
          <Btn onClick={async () => {
            try {
              const dir = await (window as any).showDirectoryPicker({ mode: "readwrite" });
              await runPreflight(dir);
            } catch (e: any) { if (e?.name !== "AbortError") alert("폴더 선택 실패"); }
          }}>RAW 폴더 선택 →</Btn>
        </div>
      </div>
    </div>
  );

  /* ── Loading ── */
  if (step === "loading") return (
    <div style={{ maxWidth: 500, margin: "60px auto", padding: "0 24px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: C.teal, fontWeight: 700, marginBottom: 12 }}>씬 폴더 스캔 중...</div>
      <div style={{ fontSize: 11, color: C.hint }}>{progress.msg}</div>
    </div>
  );

  /* ── Preflight ── */
  if (step === "preflight") return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: "0 24px" }}>
      <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 900, color: C.teal }}>
          🔍 매칭 사전 확인
        </div>
        {!preflight ? (
          <div style={{ padding: 32, textAlign: "center", fontSize: 12, color: C.hint }}>RAW 파일 탐색 중...</div>
        ) : (
          <div style={{ padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
              {[
                { label: "RAW 파일 발견", value: preflight.rawFound, color: C.teal },
                { label: "매칭 예상", value: preflight.willMatch, color: C.green },
                { label: "누락 예상", value: preflight.willMiss, color: preflight.willMiss > 0 ? C.red : C.hint },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: C.bg, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color }}>{value}</div>
                  <div style={{ fontSize: 10, color: C.hint, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              <div style={{ background: C.bg, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.hint, marginBottom: 6 }}>선택 JPG 샘플</div>
                {preflight.jpgSamples.map(s => (
                  <div key={s} style={{ fontSize: 11, fontFamily: "monospace", color: C.txt, marginBottom: 2 }}>{s}</div>
                ))}
              </div>
              <div style={{ background: C.bg, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.hint, marginBottom: 6 }}>발견된 RAW 샘플</div>
                {preflight.rawFound === 0
                  ? <div style={{ fontSize: 11, color: C.red }}>RAW 파일 없음</div>
                  : preflight.rawSamples.map(s => (
                    <div key={s} style={{ fontSize: 11, fontFamily: "monospace", color: C.txt, marginBottom: 2 }}>{s}</div>
                  ))
                }
              </div>
            </div>

            {preflight.rawFound === 0 ? (
              <div style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red, marginBottom: 16 }}>
                RAW 파일을 찾지 못했습니다. 상단의 <strong>RAW 폴더 선택</strong> 버튼으로 올바른 폴더를 선택해주세요.
              </div>
            ) : preflight.willMatch === 0 ? (
              <div style={{ background: "#FEF9C3", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#92400E", marginBottom: 16 }}>
                파일명이 맞지 않습니다. JPG와 RAW의 파일명이 같아야 매칭됩니다.<br />
                위 샘플을 비교해서 확인해주세요.
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="secondary" onClick={() => setStep("ready")}>← 취소</Btn>
              {preflight.willMatch > 0 && (
                <Btn onClick={runMatch}>복사 시작 ({preflight.willMatch}개) →</Btn>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /* ── Matching ── */
  if (step === "matching") return (
    <div style={{ maxWidth: 680, margin: "32px auto", padding: "0 24px" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: C.teal, marginBottom: 12 }}>RAW 매칭 진행 중...</div>
      <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ height: "100%", width: `${progress.total > 0 ? Math.round(progress.cur / progress.total * 100) : 0}%`, background: C.teal, borderRadius: 4, transition: "width .2s" }} />
      </div>
      <div style={{ fontSize: 11, color: C.hint, marginBottom: 16 }}>{progress.msg}</div>
      <div style={{ maxHeight: 300, overflowY: "auto", fontSize: 11, fontFamily: "monospace", background: "#F8FFFE", borderRadius: 8, padding: 12, border: `1px solid ${C.border}` }}>
        {log.slice(-60).map((l, i) => (
          <div key={i} style={{ color: l.startsWith("✅") ? C.green : l.startsWith("❌") ? C.red : C.muted }}>{l}</div>
        ))}
      </div>
      <button onClick={() => { cancelRef.current = true; }} style={{ marginTop: 12, padding: "6px 16px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: "pointer", color: C.muted, fontFamily: "inherit" }}>중단</button>
    </div>
  );

  /* ── Done ── */
  if (step === "done") return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: "0 24px" }}>
      <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 900, color: C.green }}>✅ 매칭 완료!</div>
        <div style={{ padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[
              { label: "선택 JPG", value: result.selected, color: C.teal },
              { label: "RAW 매칭", value: result.matched, color: C.green },
              { label: "RAW 누락", value: result.missing, color: result.missing > 0 ? C.red : C.hint },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: C.bg, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 900, color }}>{value}</div>
                <div style={{ fontSize: 10, color: C.hint, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: C.light, borderRadius: 8, padding: "12px 14px", fontSize: 11, color: C.muted, lineHeight: 1.9, marginBottom: 16 }}>
            📁 <strong style={{ color: C.teal }}>Selected_RAW/</strong> — 매칭 RAW 복사 완료<br />
            <span style={{ color: C.hint }}>원본 RAW 파일은 삭제되지 않았습니다.</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="secondary" onClick={() => { setStep("ready"); setLog([]); }}>← 다시 선택</Btn>
            <Btn onClick={() => { setStep("idle"); setRootDir(null); setScenes([]); setSelected(new Set()); }}>처음으로</Btn>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Ready: 썸네일 그리드 선택 UI ── */
  const ratingCounts = [5,4,3,2,1].map(r => ({
    r,
    count: scenes.flatMap(s => s.photos).filter(p => p.rating !== null && p.rating >= r).length,
  }));
  const hasAnyRating = scenes.flatMap(s => s.photos).some(p => p.rating !== null);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px" }}>

      {/* Bridge 별점 자동 선택 바 */}
      <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 18px", marginBottom: 12, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#92400E" }}>
          ⭐ Bridge 별점으로 자동 선택
          {ratingLoading && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, color: "#B45309" }}>읽는 중...</span>}
        </div>
        {hasAnyRating ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ratingCounts.map(({ r, count }) => (
              <button
                key={r}
                onClick={() => autoSelectByRating(r)}
                disabled={count === 0}
                style={{
                  padding: "4px 12px", fontSize: 11, fontWeight: 700, borderRadius: 8,
                  border: "1px solid #FDE68A", cursor: count === 0 ? "not-allowed" : "pointer",
                  background: count > 0 ? "#FEF3C7" : "#F9FAFB", color: count > 0 ? "#92400E" : "#9CA3AF",
                  fontFamily: "inherit",
                }}
              >{"★".repeat(r)}{"☆".repeat(5-r)} 이상 ({count}장)</button>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#B45309" }}>
              {ratingLoading ? "XMP 사이드카 스캔 중..." : "사이드카(.xmp) 없음 — JPG 내 XMP 스캔"}
            </span>
            {!ratingLoading && (
              <button
                onClick={loadEmbeddedRatings}
                style={{ padding: "4px 12px", fontSize: 11, fontWeight: 700, background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, cursor: "pointer", color: "#92400E", fontFamily: "inherit" }}
              >JPG에서 별점 읽기</button>
            )}
          </div>
        )}
      </div>

      {/* 상단 액션바 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px 18px", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 900, color: C.teal }}>{selected.size}장 선택됨</span>
            <span style={{ fontSize: 11, color: C.hint, marginLeft: 8 }}>/ 전체 {totalPhotos}장 ({scenes.length}씬)</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => setSelected(new Set(scenes.flatMap(s => s.photos.map(p => p.basename.toLowerCase()))))}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 700, background: C.light, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", color: C.teal, fontFamily: "inherit" }}
            >전체 선택</button>
            <button
              onClick={() => setSelected(new Set())}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 700, background: C.white, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", color: C.muted, fontFamily: "inherit" }}
            >전체 해제</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Btn onClick={runPreflight} disabled={selected.size === 0}>
            {selected.size > 0 ? `${selected.size}장 → RAW 매칭 확인` : "사진을 선택하세요"}
          </Btn>
          <button
            onClick={pickRawFolder}
            style={{
              padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              background: rawRootDir ? "#DCFCE7" : "#FEF9C3",
              border: `1px solid ${rawRootDir ? "#86EFAC" : "#FDE68A"}`,
              borderRadius: 8, color: rawRootDir ? "#166534" : "#92400E",
            }}
            title={rawRootDir ? `RAW 폴더: ${rawRootDir.name}` : "RAW 파일이 있는 폴더를 별도로 선택"}
          >{rawRootDir ? `📁 ${rawRootDir.name}` : "📂 RAW 폴더 선택"}</button>
          <button
            onClick={() => { setStep("idle"); setRootDir(null); setRawRootDir(null); setScenes([]); setSelected(new Set()); }}
            style={{ padding: "6px 10px", fontSize: 11, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", color: C.muted, fontFamily: "inherit" }}
          >폴더 변경</button>
        </div>
      </div>

      {/* 씬별 패널 */}
      {scenes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.hint, fontSize: 13 }}>
          JPG/SceneXX/ 구조의 폴더를 찾지 못했습니다.<br />
          <span style={{ fontSize: 11 }}>사진 분류 후 생성된 폴더를 선택해주세요.</span>
        </div>
      ) : (
        scenes.map((scene, si) => {
          const sceneSelCount = scene.photos.filter(p => selected.has(p.basename.toLowerCase())).length;
          const isExpanded = expanded.has(si);
          return (
            <div key={si} style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 10 }}>
              {/* 씬 헤더 */}
              <div
                onClick={() => {
                  setExpanded(prev => {
                    const next = new Set(prev);
                    if (next.has(si)) { next.delete(si); }
                    else { next.add(si); loadSceneThumbs(si); }
                    return next;
                  });
                }}
                style={{ padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: sceneSelCount > 0 ? C.teal : C.border,
                    display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12, fontWeight: 800, transition: "background .2s", flexShrink: 0,
                  }}>{si + 1}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.txt }}>{scene.name}</div>
                    <div style={{ fontSize: 10, color: C.hint }}>{scene.photos.length}장</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {sceneSelCount > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.teal, background: C.light, padding: "3px 10px", borderRadius: 12 }}>✓ {sceneSelCount}장</span>
                  )}
                  {/* 빠른 전체선택 */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      const keys = scene.photos.map(p => p.basename.toLowerCase());
                      const allSel = keys.every(k => selected.has(k));
                      setSelected(prev => {
                        const next = new Set(prev);
                        if (allSel) keys.forEach(k => next.delete(k));
                        else keys.forEach(k => next.add(k));
                        return next;
                      });
                    }}
                    style={{ padding: "3px 8px", fontSize: 10, fontWeight: 700, background: C.light, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", color: C.teal, fontFamily: "inherit" }}
                  >{scene.photos.every(p => selected.has(p.basename.toLowerCase())) ? "해제" : "씬 전체"}</button>
                  <span style={{ fontSize: 10, color: C.hint, width: 12 }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* 썸네일 그리드 */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
                    {scene.photos.map(p => {
                      const k = p.basename.toLowerCase();
                      const isSel = selected.has(k);
                      return (
                        <div
                          key={p.name}
                          onClick={() => setSelected(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                          style={{
                            position: "relative", cursor: "pointer", borderRadius: 7, overflow: "hidden",
                            border: isSel ? `2.5px solid ${C.teal}` : `1.5px solid ${C.border}`,
                            aspectRatio: "3/2", background: "#e5eeec", transition: "border-color .1s",
                          }}
                        >
                          {p.thumbUrl
                            ? <img src={p.thumbUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            : <div style={{ width: "100%", height: "100%", background: "#dde8e6" }} />
                          }
                          {isSel && (
                            <div style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%", background: C.teal, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "white", fontWeight: 900 }}>✓</div>
                          )}
                          {p.rating !== null && (
                            <div style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,0,0,.6)", borderRadius: 4, padding: "1px 4px", fontSize: 8, color: "#FBBF24", letterSpacing: -1 }}>
                              {"★".repeat(p.rating)}{"☆".repeat(5 - p.rating)}
                            </div>
                          )}
                          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,.5)", padding: "2px 4px", fontSize: 7, color: "rgba(255,255,255,.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* 하단 고정 액션바 (선택 시만) */}
      {selected.size > 0 && (
        <div style={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ pointerEvents: "all", background: C.teal, color: "white", borderRadius: 12, padding: "12px 28px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 4px 20px rgba(21,88,85,.35)" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{selected.size}장 선택됨</span>
            <button
              onClick={() => runPreflight()}
              style={{ padding: "7px 18px", background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.4)", borderRadius: 8, color: "white", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
            >RAW 매칭 확인 →</button>
          </div>
        </div>
      )}
    </div>
  );
}
