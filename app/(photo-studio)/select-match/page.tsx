"use client";

import { useCallback, useRef, useState } from "react";

/* ── 색상 ── */
const C = {
  teal: "#155855", green: "#22876A", white: "#FFFFFF",
  border: "rgba(21,88,85,.12)", muted: "#5A7470", hint: "#9BB5B0",
  txt: "#1C2B28", light: "#EAF4F2", bg: "#EDF5F3", red: "#DC2626",
};

const RAW_EXTS = new Set(["arw","cr2","cr3","nef","orf","raf","rw2","dng","pef","srw","x3f","3fr","mef","mrw"]);
const JPG_EXTS = new Set(["jpg","jpeg","heic","heif","tif","tiff","webp","png"]);

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

type Step = "idle" | "loading" | "ready" | "matching" | "done";

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
  const [ratingLoaded, setRatingLoaded] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [log,        setLog]        = useState<string[]>([]);
  const [progress,   setProgress]   = useState({ cur: 0, total: 0, msg: "" });
  const [result,     setResult]     = useState({ matched: 0, missing: 0, selected: 0 });
  const cancelRef = useRef(false);

  const hasFS = typeof window !== "undefined" && "showDirectoryPicker" in window;

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

  /* ── RAW 매칭 실행 ── */
  const runMatch = useCallback(async () => {
    if (!rootDir || selected.size === 0) return;
    setStep("matching");
    cancelRef.current = false;
    const logLines: string[] = [];
    const addLog = (l: string) => { logLines.push(l); setLog([...logLines]); };

    // RAW/ 폴더 인덱스 생성
    addLog("📂 RAW 폴더 스캔 중...");
    const rawIndex = new Map<string, FileSystemFileHandle>();
    try {
      const rawDir = await (rootDir as any).getDirectoryHandle("RAW");
      for await (const [name, handle] of (rawDir as any).entries()) {
        if ((handle as FileSystemHandle).kind !== "file") continue;
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        if (RAW_EXTS.has(ext)) rawIndex.set(name.replace(/\.[^.]+$/, "").toLowerCase(), handle as FileSystemFileHandle);
      }
      addLog(`✅ RAW/ 폴더: ${rawIndex.size}개 발견`);
    } catch {
      addLog("⚠️ RAW/ 폴더 없음 — 루트에서 탐색");
      for await (const [name, handle] of (rootDir as any).entries()) {
        if ((handle as FileSystemHandle).kind !== "file") continue;
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        if (RAW_EXTS.has(ext)) rawIndex.set(name.replace(/\.[^.]+$/, "").toLowerCase(), handle as FileSystemFileHandle);
      }
      addLog(`✅ 루트: ${rawIndex.size}개 발견`);
    }

    // Selected_RAW/ 폴더 생성 (루트에 직접)
    const rawSelectDir = await (rootDir as any).getDirectoryHandle("Selected_RAW", { create: true }) as FileSystemDirectoryHandle;
    addLog("📁 Selected_RAW/ 폴더 생성 완료");

    let matched = 0, missing = 0, done = 0;

    for (const basename of selected) {
      if (cancelRef.current) break;
      setProgress({ cur: done, total: selected.size, msg: `RAW 매칭: ${basename}` });
      const handle = rawIndex.get(basename);
      if (handle) {
        const rawFile = await handle.getFile();
        try {
          await copyFileHandle(handle, rawSelectDir, rawFile.name);
          addLog(`✅ 복사: ${rawFile.name}`);
          matched++;
        } catch { addLog(`❌ 실패: ${rawFile.name}`); }
      } else {
        addLog(`⚠️ RAW 없음: ${basename}`);
        missing++;
      }
      done++;
    }

    setResult({ matched, missing, selected: selected.size });
    setStep("done");
  }, [rootDir, scenes, selected]);

  const totalPhotos = scenes.reduce((a, s) => a + s.photos.length, 0);

  /* ── Idle ── */
  if (step === "idle") return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: "0 24px" }}>
      <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🎯</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.teal, marginBottom: 8 }}>셀렉 & RAW 매칭</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.8, marginBottom: 24 }}>
          이미 분류된 폴더(JPG/SceneXX/ 구조)를 선택하면<br />
          씬별 사진을 보면서 베스트컷을 클릭으로 선택하고<br />
          RAW 파일을 자동으로 매칭해 SELECT 폴더에 모아줍니다.
        </div>
        {!hasFS ? (
          <div style={{ fontSize: 12, color: C.red }}>이 브라우저는 파일 시스템 접근을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.</div>
        ) : (
          <Btn onClick={loadFolder}>📂 폴더 선택</Btn>
        )}
      </div>
      <div style={{ marginTop: 16, background: C.light, borderRadius: 10, padding: "14px 18px", fontSize: 11, color: C.muted, lineHeight: 1.9 }}>
        <strong>예상 폴더 구조:</strong><br />
        촬영폴더/<br />
        &nbsp;&nbsp;├ <strong>JPG/Scene01/, Scene02/, ...</strong> ← 여기 선택<br />
        &nbsp;&nbsp;├ <strong>RAW/</strong> — 전체 RAW<br />
        &nbsp;&nbsp;└ <strong>SELECT/</strong> — 결과물 저장 위치 (자동 생성)
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
          <Btn onClick={runMatch} disabled={selected.size === 0}>
            {selected.size > 0 ? `${selected.size}장 → RAW 매칭 시작` : "사진을 선택하세요"}
          </Btn>
          <button
            onClick={() => { setStep("idle"); setRootDir(null); setScenes([]); setSelected(new Set()); }}
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
              onClick={runMatch}
              style={{ padding: "7px 18px", background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.4)", borderRadius: 8, color: "white", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
            >RAW 매칭 시작 →</button>
          </div>
        </div>
      )}
    </div>
  );
}
