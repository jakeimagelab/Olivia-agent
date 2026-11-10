"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, FolderOpen, ListOrdered, MessageSquare, ScanSearch, Smartphone, Upload } from "lucide-react";
import {
  collectJpgFolderGroups,
  SELECT_MATCH_JPG_EXTENSIONS as JPG_EXTS,
  type SelectMatchFolderGroup,
} from "@/lib/selectMatch/folderScanner";
import {
  parseNamesFromText,
  parseNamesFromFiles,
  SELECT_MATCH_RAW_EXTENSIONS as RAW_EXTS,
} from "@/lib/selectMatch/nameParsing";
import {
  buildRawIndex as buildRawIndexPure,
  copyFileHandle,
  type RawIndex,
} from "@/lib/selectMatch/rawIndex";
import {
  buildCaptureMatchPreflight,
  buildMatchLogCsv,
  captureMatchSummaryTotal,
  isCaptureMatchTargetCountConsistent,
  resolveCaptureMatchJpgSources,
  type CaptureMatchPreflight,
  type JpgMatchSource,
  type MatchLogRow,
} from "@/lib/selectMatch/captureMatch";
import { formatCaptureTime } from "@/lib/selectMatch/captureTime";
import { readRatingEmbedded, readRatingSidecar } from "@/lib/selectMatch/bridgeRating";
import { useBackgroundJobsStore } from "@/lib/store/useBackgroundJobsStore";
import { C } from "@/lib/theme";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";
import { normalizePhotoToolFileKey } from "@/lib/photo-bridge/toolLinkage";
import { discoverRawFolder } from "@/lib/selectMatch/rawFolderDiscovery";
import { BRIDGE_COLOR_LABELS, type BridgeColorLabel } from "@/lib/photo-bridge/labels";
import {
  buildDeliveredJpgMovePlan,
  DEFAULT_RAW_MATCH_CRITERIA,
  moveFileWithSizeVerification,
  nextDeliveredRoundFolderName,
  normalizeRawMatchCriteria,
  rawMatchProgressPercent,
  resolveRawMatchTargets,
  type RawMatchCriteria,
} from "@/lib/photo-bridge/rawMatchDelivery";

// 우상단 전역 작업 팝업(BackgroundJobsWidget)에 등록할 때 쓰는 고정 job id — 기능당 하나라
// 재시작해도 이전 항목을 덮어쓴다.
const RAW_MATCH_JOB_ID = "raw-match";

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
type SceneFolder = SelectMatchFolderGroup;

type Step = "idle" | "loading" | "ready" | "preflight" | "matching" | "done" | "client_input" | "raw_pick" | "selection_done";

/* ── Helpers ── */
function releaseObjectUrl(url: string | null | undefined): void {
  if (url) URL.revokeObjectURL(url);
}

async function loadThumb(file: File, size = 120): Promise<string | null> {
  return new Promise(res => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(size / img.width, size / img.height, 1);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((blob) => {
        releaseObjectUrl(url);
        res(blob ? URL.createObjectURL(blob) : null);
      }, "image/jpeg", 0.6);
    };
    img.onerror = () => { releaseObjectUrl(url); res(null); };
    img.src = url;
  });
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
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("이미지를 처리하지 못했습니다.")), "image/jpeg", 0.92);
  });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("이미지를 처리하지 못했습니다."));
    reader.onerror = () => reject(reader.error ?? new Error("이미지를 처리하지 못했습니다."));
    reader.readAsDataURL(blob);
  });
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
function Btn({ children, onClick, disabled, variant, dark = false, style: s }: {
  children: React.ReactNode; onClick?: () => void;
  disabled?: boolean; variant?: "secondary"; dark?: boolean; style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "9px 20px", fontSize: 13, fontWeight: 500, borderRadius: 10,
        border: variant === "secondary" ? `1px solid ${dark ? "rgba(255,255,255,.18)" : C.border}` : "none",
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
        background: disabled ? "transparent" : variant === "secondary" ? "rgba(255,255,255,.06)" : "#37C39D",
        color: disabled ? "rgba(255,255,255,.30)" : variant === "secondary" ? "#D9F6EE" : "#103E36",
        opacity: disabled ? 0.6 : 1, transition: "opacity .15s", ...s,
      } as React.CSSProperties}
    >{children}</button>
  );
}

export type SelectMatchInitialView = "raw" | "manual" | "client";

export function SelectMatchWorkspace({
  embedded = false,
  bridgeLinked = false,
  initialView = "raw",
  selectionOnly = false,
  selectedJpgNames = [],
  onSelectionComplete,
}: {
  embedded?: boolean;
  bridgeLinked?: boolean;
  initialView?: SelectMatchInitialView;
  /** 사진 셀렉 탭에서는 JPG 목록만 저장하고 RAW 탐색 UI를 렌더하지 않는다. */
  selectionOnly?: boolean;
  /** 사진 셀렉에서 확정한 JPG 이름. RAW 매칭 탭에서만 자동으로 이어받는다. */
  selectedJpgNames?: readonly string[];
  onSelectionComplete?: (names: string[]) => void;
} = {}) {
  const {
    currentLocalFolder,
    rawMatchDefaultFolder,
    rawMatchFolderCandidates,
    setCurrentLocalFolder,
    setSelectedJpgNames,
    jpgRatingsByName,
    setJpgRatingsByName,
    jpgColorLabelsByName,
    rawMatchFolderPath,
  } = usePhotoStudioExecution();
  const [step,       setStep]       = useState<Step>("idle");
  const [rootDir,    setRootDir]    = useState<FileSystemDirectoryHandle | null>(null);
  useEffect(() => {
    if (rootDir) setCurrentLocalFolder(rootDir);
  }, [rootDir, setCurrentLocalFolder]);
  useEffect(() => {
    if (!rootDir && currentLocalFolder) setRootDir(currentLocalFolder);
  }, [currentLocalFolder, rootDir]);
  const [scenes,     setScenes]     = useState<SceneFolder[]>([]);
  const [expanded,   setExpanded]   = useState<Set<number>>(new Set());
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [nameQuery,  setNameQuery]  = useState("");
  const queryTokens = useMemo(
    () => nameQuery.toLowerCase().split(/[\s,]+/).map((token) => token.trim()).filter(Boolean),
    [nameQuery],
  );
  /** 검색은 보이는 사진만 거르고 현재 선택은 그대로 유지한다. */
  const visibleScenes = useMemo(() => {
    if (!queryTokens.length) return scenes;
    return scenes
      .map((scene) => ({
        ...scene,
        photos: scene.photos.filter((photo) => (
          queryTokens.some((token) => photo.basename.toLowerCase().includes(token))
        )),
      }))
      .filter((scene) => scene.photos.length > 0);
  }, [queryTokens, scenes]);
  const matchedCount = useMemo(
    () => visibleScenes.reduce((sum, scene) => sum + scene.photos.length, 0),
    [visibleScenes],
  );
  const [ratingLoaded,  setRatingLoaded]  = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [rawRootDir,    setRawRootDir]    = useState<FileSystemDirectoryHandle | null>(null);
  const [jpgScanRootDir, setJpgScanRootDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [preflight,  setPreflight]  = useState<CaptureMatchPreflight | null>(null);
  const [manualRawChoices, setManualRawChoices] = useState<Record<string, string>>({});
  const [rawScanCount, setRawScanCount] = useState(0);
  const [rawIndexRef] = useState<{ map: RawIndex }>(() => ({ map: new Map() }));
  const preflightRequestRef = useRef(0);
  const [rawDiscovery, setRawDiscovery] = useState<{
    status: "idle" | "searching" | "found" | "not_found" | "error" | "manual";
    message: string;
    folderName?: string;
  }>({ status: "idle", message: "" });
  const rawDiscoveryKeyRef = useRef("");
  const approvedMatches = useMemo(() => (preflight?.items.flatMap((item) => {
    const candidateId = manualRawChoices[item.id] ?? item.confirmedCandidateId;
    if (!candidateId) return [];
    const candidate = item.candidates.find((entry) => entry.id === candidateId);
    return candidate ? [{ item, candidate, manual: Boolean(manualRawChoices[item.id]) }] : [];
  }) ?? []), [manualRawChoices, preflight]);

  useEffect(() => {
    if (!bridgeLinked || rawRootDir || !rawMatchDefaultFolder) return;
    setRawRootDir(rawMatchDefaultFolder);
  }, [bridgeLinked, rawMatchDefaultFolder, rawRootDir]);
  // 매칭된 RAW 파일을 Selected_RAW/에 넣을 때 원본을 지울지(이동) 남겨둘지(복사) — 기본값은
  // 기존 동작(복사)과 동일하게 유지해 이 기능을 모르는 사용자에게 갑자기 원본이 사라지는
  // 일이 없게 한다.
  const [rawSelectMode, setRawSelectMode] = useState<"move" | "copy">("copy");
  const [progress,   setProgressState] = useState({ cur: 0, total: 0, msg: "" });
  const [rawOutputDir, setRawOutputDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [rawOutputOpenError, setRawOutputOpenError] = useState("");
  const [result,     setResult]     = useState({
    matched: 0,
    missing: 0,
    selected: 0,
    jpgMoved: 0,
    xmpMoved: 0,
    failed: 0,
    deliveredFolderName: "",
    missingNames: [] as string[],
    failedNames: [] as string[],
    moveNotice: "",
    cancelled: false,
  });
  const cancelRef = useRef(false);
  const autoScannedFolderRef = useRef<FileSystemDirectoryHandle | null>(null);
  const sceneThumbnailUrlsRef = useRef(new Set<string>());
  const searchThumbnailRequestsRef = useRef(new WeakSet<FileSystemDirectoryHandle>());
  const [rawMatchCriteria, setRawMatchCriteria] = useState<RawMatchCriteria>(DEFAULT_RAW_MATCH_CRITERIA);
  const [criteriaReady, setCriteriaReady] = useState(!bridgeLinked);
  const [moveMatchedJpgs, setMoveMatchedJpgs] = useState(true);
  const [deliveredFolderName, setDeliveredFolderName] = useState("1차보정본");
  const [deliveredFolderNameDirty, setDeliveredFolderNameDirty] = useState(false);

  const releaseSceneThumbnails = useCallback(() => {
    for (const url of sceneThumbnailUrlsRef.current) releaseObjectUrl(url);
    sceneThumbnailUrlsRef.current.clear();
  }, []);

  useEffect(() => () => releaseSceneThumbnails(), [releaseSceneThumbnails, rootDir]);

  // RAW 매칭이 다른 페이지로 이동해도 우상단 팝업에 계속 보이게(BackgroundJobsWidget) — 로컬
  // state를 그대로 두고 전역 스토어에도 같이 반영만 한다. runMatch 안의 기존 setProgress(...)
  // 호출부는 이름이 그대로라 하나도 안 건드려도 된다.
  const setProgress = useCallback((next: { cur: number; total: number; msg: string }) => {
    setProgressState(next);
    useBackgroundJobsStore.getState().updateJob(RAW_MATCH_JOB_ID, next);
  }, []);

  // 마운트 전엔 false — 서버 렌더와 클라이언트 첫 렌더를 동일하게 유지해 hydration mismatch를 피한다
  const [hasFS, setHasFS] = useState(false);
  useEffect(() => { setHasFS("showDirectoryPicker" in window); }, []);

  // 같은 도구가 단독 화면에서도 쓰이므로, 사진작업실 안에서만 중성 다크 토큰을 켠다.
  // 선택·파일 처리·매칭 상태에는 관여하지 않는 표시 전용 값이다.
  const surfaceCard = "rgba(255,255,255,.025)";
  const groupedSurface = embedded ? "rgba(255,255,255,.045)" : C.light;
  const inputSurface = embedded ? "rgba(0,0,0,.16)" : C.bg;
  const uiBorder = embedded ? "rgba(255,255,255,.13)" : C.border;
  const uiText = embedded ? "rgba(255,255,255,.88)" : C.txt;
  const uiMuted = embedded ? "rgba(255,255,255,.52)" : C.muted;
  const uiHint = embedded ? "rgba(255,255,255,.42)" : C.hint;
  const uiAccent = embedded ? "#4FD8B8" : C.teal;

  /* ── 클라이언트 입력 모드 상태 ── */
  const [inputMode,     setInputMode]     = useState<"folder" | "text" | "upload">(() => initialView === "client" ? "text" : "folder");
  const [clientText,    setClientText]    = useState("");
  const [clientDragging,setClientDragging]= useState(false);
  const clientFileRef = useRef<HTMLInputElement>(null);
  const [uploadedClientFiles, setUploadedClientFiles] = useState<File[]>([]);
  const [uploadOcrLoading, setUploadOcrLoading] = useState(false);
  const [uploadOcrNames, setUploadOcrNames] = useState<string[]>([]);
  const [selectedUploadOcrNames, setSelectedUploadOcrNames] = useState<Set<string>>(() => new Set());
  const [uploadOcrMessage, setUploadOcrMessage] = useState<{ text: string; ok: boolean } | null>(null);

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

  const criteriaFolderKey = rawMatchFolderPath || currentLocalFolder?.name || rootDir?.name || "current-folder";
  const criteriaStorageKey = `olivia-raw-match-criteria:${criteriaFolderKey}`;
  const resolvedBridgeTargets = useMemo(() => resolveRawMatchTargets({
    names: selectedJpgNames,
    ratingsByName: jpgRatingsByName,
    colorsByName: jpgColorLabelsByName,
    criteria: rawMatchCriteria,
  }), [jpgColorLabelsByName, jpgRatingsByName, rawMatchCriteria, selectedJpgNames]);
  const authoritativeMatchTargets = useMemo(
    () => bridgeLinked ? new Set(resolvedBridgeTargets) : new Set(selected),
    [bridgeLinked, resolvedBridgeTargets, selected],
  );
  const scannedJpgSources = useMemo<JpgMatchSource[]>(() => scenes.flatMap((scene) => (
    scene.photos.map((photo) => ({
      id: photo.relativePath.normalize("NFC"),
      name: photo.name,
      basename: photo.basename.normalize("NFC").toLocaleLowerCase("en-US"),
      relativePath: photo.relativePath,
      handle: photo.handle,
      thumbUrl: photo.thumbUrl,
    }))
  )), [scenes]);
  const selectedJpgSources = useMemo(() => resolveCaptureMatchJpgSources({
    targetBasenames: authoritativeMatchTargets,
    sources: scannedJpgSources,
  }), [authoritativeMatchTargets, scannedJpgSources]);
  const preflightTargetCountMatches = preflight
    ? isCaptureMatchTargetCountConsistent(authoritativeMatchTargets.size, preflight)
    : false;

  useEffect(() => {
    if (!bridgeLinked) return;
    setCriteriaReady(false);
    try {
      setRawMatchCriteria(normalizeRawMatchCriteria(JSON.parse(localStorage.getItem(criteriaStorageKey) ?? "null")));
    } catch {
      setRawMatchCriteria({ ...DEFAULT_RAW_MATCH_CRITERIA, colorLabels: [...DEFAULT_RAW_MATCH_CRITERIA.colorLabels] });
    } finally {
      setCriteriaReady(true);
    }
  }, [bridgeLinked, criteriaStorageKey]);

  useEffect(() => {
    if (!bridgeLinked || !criteriaReady) return;
    try {
      localStorage.setItem(criteriaStorageKey, JSON.stringify(rawMatchCriteria));
    } catch {
      // 저장소가 막혀 있어도 현재 세션의 기준 선택은 유지한다.
    }
  }, [bridgeLinked, criteriaReady, criteriaStorageKey, rawMatchCriteria]);

  useEffect(() => {
    if (!rootDir) {
      setJpgScanRootDir(null);
      return;
    }
    let disposed = false;
    void (async () => {
      let next = rootDir;
      try {
        next = await rootDir.getDirectoryHandle("JPG");
      } catch {
        // 선택한 폴더가 곧 JPG 폴더인 일반적인 Bridge 경로다.
      }
      if (!disposed) setJpgScanRootDir(next);
    })();
    return () => { disposed = true; };
  }, [rootDir]);

  useEffect(() => {
    if (!jpgScanRootDir) return;
    let disposed = false;
    void (async () => {
      const names: string[] = [];
      try {
        for await (const [name, handle] of (jpgScanRootDir as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
          if (handle.kind === "directory") names.push(name);
        }
      } catch {
        return;
      }
      if (!disposed && !deliveredFolderNameDirty) setDeliveredFolderName(nextDeliveredRoundFolderName(names));
    })();
    return () => { disposed = true; };
  }, [deliveredFolderNameDirty, jpgScanRootDir]);

  const completeSelection = useCallback((names: Set<string>) => {
    const selectedNames = Array.from(names);
    setSelectedJpgNames(selectedNames);
    onSelectionComplete?.(selectedNames);
    setStep("selection_done");
  }, [onSelectionComplete, setSelectedJpgNames]);

  useEffect(() => {
    if (!selectionOnly || step !== "ready") return;
    setSelectedJpgNames([...selected]);
  }, [selected, selectionOnly, setSelectedJpgNames, step]);

  /* ── 클라이언트 선택 확정 → RAW 탭에서만 raw_pick 단계로 ── */
  const confirmClientInput = (names: Set<string>) => {
    if (names.size === 0) { alert("파일명을 찾지 못했습니다. 파일명(DSC_0142.jpg 형태)이 포함된 텍스트를 붙여넣어 주세요."); return; }
    setSelected(names);
    if (selectionOnly) {
      completeSelection(names);
      return;
    }
    setStep("raw_pick");
  };

  const setUploadedFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) => file.size > 0);
    setUploadedClientFiles(files);
    setUploadOcrNames([]);
    setSelectedUploadOcrNames(new Set());
    setUploadOcrMessage(files.length
      ? { text: `${files.length}개 파일을 준비했습니다. 사진 파일명 그대로 사용하거나, 셀렉 리포트라면 이미지 속 파일명을 분석하세요.`, ok: true }
      : { text: "선택한 파일을 읽지 못했습니다.", ok: false });
    if (clientFileRef.current) clientFileRef.current.value = "";
  }, []);

  const analyzeUploadedFileNames = useCallback(async () => {
    if (!uploadedClientFiles.length || uploadOcrLoading) return;
    setUploadOcrLoading(true);
    setUploadOcrMessage(null);
    try {
      const recognized: string[] = [];
      for (const file of uploadedClientFiles.slice(0, 4)) {
        const imageBase64 = await prepareScreenshotForOcr(file);
        const response = await fetch("/api/select-match/ocr-filenames", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64 }),
        });
        const data = await response.json().catch(() => null) as { ok?: boolean; filenames?: unknown; error?: unknown } | null;
        if (!response.ok || !data?.ok || !Array.isArray(data.filenames)) {
          throw new Error(typeof data?.error === "string" ? data.error : "이미지 속 파일명 분석에 실패했습니다.");
        }
        recognized.push(...data.filenames.filter((name): name is string => typeof name === "string"));
      }
      const names = Array.from(new Map(recognized.map((name) => {
        const normalized = name.trim().normalize("NFC").toLocaleLowerCase("en-US");
        return [normalized, normalized] as const;
      })).values()).filter(Boolean);
      if (!names.length) throw new Error("이미지에서 확장자가 포함된 파일명을 찾지 못했습니다.");
      setUploadOcrNames(names);
      setSelectedUploadOcrNames(new Set(names));
      setUploadOcrMessage({ text: `이미지에서 파일명 ${names.length}개를 찾았습니다. 아래 목록을 확인한 뒤 RAW 매칭으로 진행하세요.`, ok: true });
    } catch (error) {
      setUploadOcrNames([]);
      setSelectedUploadOcrNames(new Set());
      setUploadOcrMessage({ text: error instanceof Error ? error.message : "이미지 속 파일명 분석에 실패했습니다.", ok: false });
    } finally {
      setUploadOcrLoading(false);
    }
  }, [uploadOcrLoading, uploadedClientFiles]);

  useEffect(() => {
    if (selectionOnly || initialView !== "raw" || step !== "idle" || selectedJpgNames.length === 0 || !criteriaReady) return;
    // The photo-select store keeps JPG basenames (the RAW matcher uses the
    // basename too), while pasted text may include extensions. Do not route
    // the stored list back through the text-only parser.
    const names = bridgeLinked
      ? new Set(resolvedBridgeTargets)
      : new Set(selectedJpgNames
        .map((name) => name.trim().replace(/\.[^.]+$/, "").normalize("NFC").toLocaleLowerCase("en-US"))
        .filter(Boolean));
    setSelected(names);
    setStep("raw_pick");
  }, [bridgeLinked, criteriaReady, initialView, resolvedBridgeTargets, selectedJpgNames, selectionOnly, step]);

  useEffect(() => {
    if (!bridgeLinked || initialView !== "raw" || (step !== "raw_pick" && step !== "preflight")) return;
    setSelected(new Set(resolvedBridgeTargets));
  }, [bridgeLinked, initialView, resolvedBridgeTargets, step]);

  /* ── RAW 폴더 별도 선택 ── */
  const pickRawFolder = useCallback(async () => {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      setRawRootDir(dir);
      setRawDiscovery({ status: "manual", folderName: dir.name, message: `${dir.name} 폴더를 직접 선택했습니다.` });
    } catch (e: any) {
      if (e?.name !== "AbortError") alert("폴더 선택 실패");
    }
  }, []);

  /* ── 폴더 로드: 이름 규칙 없이 JPG 폴더 재귀 스캔 ── */
  const scanFolder = useCallback(async (dir: FileSystemDirectoryHandle) => {
      releaseSceneThumbnails();
      searchThumbnailRequestsRef.current = new WeakSet<FileSystemDirectoryHandle>();
      setRootDir(dir);
      setStep("loading");
      setProgress({ cur: 0, total: 0, msg: "JPG 폴더 스캔 중..." });

      // JPG/ 폴더 탐색
      let jpgBase: FileSystemDirectoryHandle | null = null;
      try { jpgBase = await (dir as any).getDirectoryHandle("JPG"); } catch (error) { console.error("[OLIVIA] Suppressed error", error); }

      // JPG/ 없으면 루트 직접 사용
      const scanDir = jpgBase ?? dir;
      setJpgScanRootDir(scanDir);
      setDeliveredFolderNameDirty(false);
      const sceneList = await collectJpgFolderGroups(scanDir);
      setScenes(sceneList);
      setExpanded(new Set());
      setRatingLoaded(false);

      // XMP 사이드카 빠른 스캔 → 이후 JPG 내장 XMP 자동 딥스캔
      if (!(bridgeLinked && initialView === "raw")) setStep("ready");
      setRatingLoading(true);

      // 1단계: .xmp 사이드카
      const afterSidecar = await Promise.all(sceneList.map(async (scene) => ({
        ...scene,
        photos: await Promise.all(scene.photos.map(async (p) => {
          const sharedRating = jpgRatingsByName[normalizePhotoToolFileKey(p.name)];
          return {
            ...p,
            rating: sharedRating ?? await readRatingSidecar(scene.dirHandle, p.basename),
          };
        })),
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
      setJpgRatingsByName(Object.fromEntries(afterEmbedded.flatMap((scene) => scene.photos.flatMap((photo) => (
        photo.rating !== null && photo.rating >= 1 ? [[photo.name, photo.rating] as const] : []
      )))), { overwrite: false });

      // Bridge RAW 매칭은 위의 "매칭 기준" 결과만 사용한다. 폴더 스캔에서 새로 발견한
      // 하위 폴더 별점 JPG를 대상에 합치면 화면 수와 사전 확인 수가 달라진다.
      const autoKeys = bridgeLinked && initialView === "raw"
        ? new Set(resolvedBridgeTargets)
        : new Set(selectedJpgNames
          .map((name) => name.trim().replace(/\.[^.]+$/, "").normalize("NFC").toLocaleLowerCase("en-US"))
          .filter(Boolean));
      if (!(bridgeLinked && initialView === "raw")) {
        for (const scene of afterEmbedded) {
          for (const p of scene.photos) {
            if (p.rating !== null && p.rating >= 1) autoKeys.add(p.basename.toLowerCase());
          }
        }
      }
      setSelected(autoKeys);

      setRatingLoaded(true);
      setRatingLoading(false);
      if (bridgeLinked && initialView === "raw") setStep("raw_pick");
  }, [bridgeLinked, initialView, jpgRatingsByName, releaseSceneThumbnails, resolvedBridgeTargets, selectedJpgNames, setJpgRatingsByName, setProgress]);

  const loadFolder = useCallback(async () => {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      await scanFolder(dir);
    } catch (e: any) {
      if (e?.name !== "AbortError") alert("폴더를 읽는 중 오류가 발생했습니다.");
      setStep("idle");
    }
  }, [scanFolder]);

  useEffect(() => {
    const shouldScanBridgeFolder = selectionOnly || (bridgeLinked && initialView === "raw");
    if (!shouldScanBridgeFolder || !currentLocalFolder || step !== "idle" || autoScannedFolderRef.current === currentLocalFolder) return;
    autoScannedFolderRef.current = currentLocalFolder;
    void scanFolder(currentLocalFolder).catch((error) => {
      console.error("[photo-select] Bridge folder scan failed", error);
      setStep("idle");
    });
  }, [bridgeLinked, currentLocalFolder, initialView, scanFolder, selectedJpgNames.length, selectionOnly, step]);

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
    setJpgRatingsByName(Object.fromEntries(updated.flatMap((scene) => scene.photos.flatMap((photo) => (
      photo.rating !== null && photo.rating >= 1 ? [[photo.name, photo.rating] as const] : []
    )))), { overwrite: false });
    setRatingLoaded(true);
    setRatingLoading(false);
  }, [scenes, setJpgRatingsByName]);

  useEffect(() => {
    if (!scenes.length) return;
    setScenes((current) => current.map((scene) => ({
      ...scene,
      photos: scene.photos.map((photo) => {
        const sharedRating = jpgRatingsByName[normalizePhotoToolFileKey(photo.name)];
        return sharedRating && sharedRating !== photo.rating ? { ...photo, rating: sharedRating } : photo;
      }),
    })));
  }, [jpgRatingsByName, scenes.length]);

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
    const updated = [] as typeof scene.photos;
    for (const [index, photo] of scene.photos.entries()) {
      if (photo.thumbUrl) {
        updated.push(photo);
      } else {
        try {
          const file = await photo.handle.getFile();
          const url = await loadThumb(file, 130);
          if (url) sceneThumbnailUrlsRef.current.add(url);
          updated.push({ ...photo, thumbUrl: url });
        } catch {
          updated.push(photo);
        }
      }
      if ((index + 1) % 20 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    setScenes(prev => prev.map((s, i) => i === sceneIdx ? { ...s, photos: updated } : s));
  }, [scenes]);

  useEffect(() => {
    if (!queryTokens.length) return;
    for (const scene of visibleScenes) {
      if (searchThumbnailRequestsRef.current.has(scene.dirHandle)) continue;
      const sceneIndex = scenes.findIndex((candidate) => candidate.dirHandle === scene.dirHandle);
      if (sceneIndex < 0) continue;
      searchThumbnailRequestsRef.current.add(scene.dirHandle);
      void loadSceneThumbs(sceneIndex);
    }
  }, [loadSceneThumbs, queryTokens.length, scenes, visibleScenes]);

  /* ── 재귀 RAW 스캔 공통 함수 (lib/selectMatch/rawIndex.ts로 추출된 순수 함수의 얇은 wrapper) ── */
  const buildRawIndex = useCallback((
    overrideRawDir?: FileSystemDirectoryHandle,
    onProgress?: (scannedCount: number) => void,
  ): Promise<RawIndex> => buildRawIndexPure(
    overrideRawDir ?? rawRootDir,
    rootDir,
    onProgress,
    authoritativeMatchTargets,
  ), [authoritativeMatchTargets, rootDir, rawRootDir]);

  /* ── 사전 확인 (preflight) ── */
  const runPreflight = useCallback(async (overrideRawDir?: FileSystemDirectoryHandle) => {
    if (authoritativeMatchTargets.size === 0) return;
    if (!rootDir && !rawRootDir && !overrideRawDir) return;
    if (overrideRawDir) setRawRootDir(overrideRawDir);
    const requestId = preflightRequestRef.current + 1;
    preflightRequestRef.current = requestId;
    setStep("preflight");
    setPreflight(null);
    setManualRawChoices({});
    setRawScanCount(0);
    const rawIndex = await buildRawIndex(overrideRawDir, setRawScanCount);
    if (preflightRequestRef.current !== requestId) return;
    const sourceBasenames = new Set(selectedJpgSources.map((source) => source.basename));
    const missingSources = Array.from(authoritativeMatchTargets).filter((basename) => !sourceBasenames.has(basename));
    if (missingSources.length > 0) {
      setRawDiscovery({
        status: "error",
        message: `선택 JPG ${missingSources.length}장의 원본 파일을 찾지 못했습니다. JPG 폴더를 다시 열어 주세요.`,
      });
    }
    const capturePreflight = await buildCaptureMatchPreflight({
      jpgSources: selectedJpgSources,
      rawIndex,
      concurrency: 8,
      onProgress: (completed) => setRawScanCount(completed),
    });
    if (preflightRequestRef.current !== requestId) return;
    rawIndexRef.map.clear();
    for (const [k, v] of rawIndex) rawIndexRef.map.set(k, v);
    const unresolved = capturePreflight.items.filter((item) => item.status !== "confirmed" && !item.jpg.thumbUrl);
    for (const item of unresolved) {
      if (preflightRequestRef.current !== requestId) return;
      try {
        const url = await loadThumb(await item.jpg.handle.getFile(), 180);
        if (url) {
          if (preflightRequestRef.current !== requestId) {
            releaseObjectUrl(url);
            return;
          }
          sceneThumbnailUrlsRef.current.add(url);
          item.jpg.thumbUrl = url;
        }
      } catch {
        // 썸네일 실패는 촬영시각 안전 검사 결과에 영향을 주지 않는다.
      }
    }
    if (preflightRequestRef.current !== requestId) return;
    setPreflight(capturePreflight);
  }, [authoritativeMatchTargets, rootDir, rawRootDir, selectedJpgSources, buildRawIndex, rawIndexRef]);

  useEffect(() => {
    if (!bridgeLinked || step !== "raw_pick" || authoritativeMatchTargets.size === 0 || selectedJpgSources.length === 0 || rawMatchFolderCandidates.length === 0) return;
    const selectionKey = Array.from(authoritativeMatchTargets).sort().join("|");
    const discoveryKey = `${rawMatchFolderCandidates.map((item) => `${item.distance}:${item.name}`).join("|")}::${selectionKey}`;
    if (rawDiscoveryKeyRef.current === discoveryKey) return;
    rawDiscoveryKeyRef.current = discoveryKey;
    let disposed = false;

    setRawDiscovery({ status: "searching", message: "현재 폴더와 상위 폴더에서 RAW 원본 위치를 찾고 있습니다." });
    void discoverRawFolder({
      candidates: rawMatchFolderCandidates,
      selectedNames: authoritativeMatchTargets,
      onCandidate: (candidate) => {
        if (!disposed) setRawDiscovery({ status: "searching", message: `${candidate.name} 폴더에서 표본 RAW를 확인하고 있습니다.`, folderName: candidate.name });
      },
    }).then(async (result) => {
      if (disposed) return;
      if (!result.candidate) {
        setRawDiscovery({ status: "not_found", message: "현재 폴더와 상위 2단계에서 같은 이름의 RAW를 찾지 못했습니다." });
        return;
      }
      const folderName = result.candidate.name;
      setRawRootDir(result.candidate.handle);
      setRawDiscovery({
        status: "found",
        folderName,
        message: `${folderName}에서 표본 ${result.matchedSamples}/${result.samples.length}개를 찾았습니다. 전체 선택 파일을 확인합니다.`,
      });
      await runPreflight(result.candidate.handle);
    }).catch((error) => {
      if (disposed) return;
      setRawDiscovery({
        status: "error",
        message: error instanceof Error ? error.message : "RAW 원본 폴더를 자동으로 찾지 못했습니다.",
      });
    });

    return () => { disposed = true; };
  }, [authoritativeMatchTargets, bridgeLinked, rawMatchFolderCandidates, runPreflight, selectedJpgSources.length, step]);

  /* ── 실제 복사 실행 ── */
  const runMatch = useCallback(async () => {
    if ((!rootDir && !rawRootDir) || !preflight || approvedMatches.length === 0 || !preflightTargetCountMatches) return;
    const approvedBasenames = new Set(approvedMatches.map(({ item }) => item.jpg.basename));
    const approvedJpgIds = new Set(approvedMatches.map(({ item }) => item.jpg.id.normalize("NFC")));
    setStep("matching");
    cancelRef.current = false;
    setRawOutputDir(null);
    setRawOutputOpenError("");
    useBackgroundJobsStore.getState().startJob({
      id: RAW_MATCH_JOB_ID, label: `RAW ${rawSelectMode === "move" ? "이동" : "복사"} 중`,
      cur: 0, total: approvedMatches.length, status: "running",
      returnPath: "/photo-sorting?mode=raw-match", cancelRef,
    });
    setProgress({ cur: 0, total: approvedMatches.length, msg: "검증된 RAW 복사를 준비하고 있습니다." });

    let deliveryRootHandle: FileSystemDirectoryHandle | null = null;
    let deliveryDirectory: FileSystemDirectoryHandle | null = null;
    let deliveryPlanByJpgId = new Map<string, Array<{
      name: string;
      kind: "jpg" | "xmp";
      handle: FileSystemFileHandle;
      sourceDirectory: FileSystemDirectoryHandle;
    }>>();
    let moveNotice = "";

    if (moveMatchedJpgs) {
      const deliveryRoot = jpgScanRootDir ?? rootDir;
      if (!deliveryRoot) {
        moveNotice = "JPG 폴더를 확인하지 못해 JPG 이동은 건너뛰었습니다.";
      } else if (!deliveredFolderName.trim() || /[\\/\0]/u.test(deliveredFolderName) || deliveredFolderName === "." || deliveredFolderName === "..") {
        moveNotice = "보정본 폴더 이름이 올바르지 않아 JPG 이동은 건너뛰었습니다.";
      } else {
        try {
          const permissionHandle = deliveryRoot as FileSystemDirectoryHandle & {
            requestPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
            queryPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
          };
          let permission: PermissionState = permissionHandle.queryPermission
            ? await permissionHandle.queryPermission({ mode: "readwrite" })
            : "prompt";
          if (permission !== "granted" && permissionHandle.requestPermission) {
            permission = await permissionHandle.requestPermission({ mode: "readwrite" });
          }
          if (permission !== "granted") {
            moveNotice = "JPG 폴더 쓰기 권한이 없어 RAW만 복사했습니다. JPG 원본은 그대로 유지했습니다.";
          } else {
            const sourceGroups = (await collectJpgFolderGroups(deliveryRoot))
              .filter((group) => group.dirHandle.name !== deliveredFolderName.trim());
            const handles = new Map<string, { handle: FileSystemFileHandle; sourceDirectory: FileSystemDirectoryHandle }>();
            const jpgIdByDirectoryBasename = new Map<string, string>();
            const jpgs: Array<{ name: string; directoryKey: string }> = [];
            const sidecars: Array<{ name: string; directoryKey: string }> = [];
            for (const group of sourceGroups) {
              const directoryKey = group.relativeDirectory.normalize("NFC");
              for (const photo of group.photos) {
                const photoId = photo.relativePath.normalize("NFC");
                if (!approvedJpgIds.has(photoId)) continue;
                jpgs.push({ name: photo.name, directoryKey });
                handles.set(`${directoryKey}\0${photo.name}`, { handle: photo.handle, sourceDirectory: group.dirHandle });
                jpgIdByDirectoryBasename.set(`${directoryKey}\0${photo.basename.normalize("NFC").toLocaleLowerCase("en-US")}`, photoId);
              }
              for await (const [name, handle] of (group.dirHandle as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
                if (handle.kind !== "file" || !/\.xmp$/iu.test(name)) continue;
                sidecars.push({ name, directoryKey });
                handles.set(`${directoryKey}\0${name}`, { handle: handle as FileSystemFileHandle, sourceDirectory: group.dirHandle });
              }
            }
            const plan = buildDeliveredJpgMovePlan({ rawMatchedNames: approvedBasenames, jpgs, sidecars });
            deliveryPlanByJpgId = plan.reduce((map, item) => {
              const source = handles.get(`${item.directoryKey}\0${item.name}`);
              if (!source) return map;
              const jpgId = jpgIdByDirectoryBasename.get(`${item.directoryKey}\0${item.basename}`);
              if (!jpgId) return map;
              const list = map.get(jpgId) ?? [];
              list.push({ name: item.name, kind: item.kind, ...source });
              map.set(jpgId, list);
              return map;
            }, new Map<string, Array<{ name: string; kind: "jpg" | "xmp"; handle: FileSystemFileHandle; sourceDirectory: FileSystemDirectoryHandle }>>());
            deliveryRootHandle = deliveryRoot;
          }
        } catch (error) {
          moveNotice = `JPG 이동 준비 실패 — RAW만 복사합니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`;
        }
      }
    }

    const outputBase = rawRootDir ?? rootDir!;
    const rawSelectDir = await (outputBase as any).getDirectoryHandle("Selected_RAW", { create: true }) as FileSystemDirectoryHandle;
    setRawOutputDir(rawSelectDir);

    let matched = 0, missing = 0, done = 0, jpgMoved = 0, xmpMoved = 0, failed = 0;
    const missingNames: string[] = preflight.items
      .filter((item) => !approvedMatches.some((approved) => approved.item.id === item.id))
      .map((item) => `${item.jpg.name} — ${item.status === "time_mismatch" ? "촬영시각 불일치" : item.status === "multiple_candidates" ? "후보 여러 개" : item.status === "missing_time" ? "촬영시각 없음" : "RAW 없음"}`);
    missing = missingNames.length;
    const failedNames: string[] = [];
    const logRowsByJpgId = new Map<string, MatchLogRow>(preflight.items.map((item) => [item.id, {
      jpgName: item.jpg.name,
      jpgPath: item.jpg.relativePath,
      jpgCaptureTime: item.jpgCaptureTime,
      rawPath: item.candidates.map((candidate) => candidate.entry.relativePath).join(" | "),
      rawCaptureTime: null,
      rawCaptureTimeText: item.candidates.map((candidate) => formatCaptureTime(candidate.captureTime)).join(" | ") || "촬영시각 없음",
      result: "건너뜀",
    }]));
    const copiedOutputNames = new Set<string>();
    for (const { item, candidate, manual } of approvedMatches) {
      if (cancelRef.current) break;
      setProgress({ cur: done, total: approvedMatches.length, msg: `검증 RAW: ${item.jpg.name}` });
      const entry = candidate.entry;
      let rawCopied = false;
      try {
        const rawFile = await entry.fileHandle.getFile();
        const outputKey = rawFile.name.normalize("NFC").toLocaleLowerCase("en-US");
        if (copiedOutputNames.has(outputKey)) throw new Error("같은 이름의 RAW가 이미 결과에 있어 덮어쓰지 않음");
        await copyFileHandle(entry.fileHandle, rawSelectDir, rawFile.name);
        copiedOutputNames.add(outputKey);
        if (rawSelectMode === "move") await (entry.dirHandle as any).removeEntry(entry.fileHandle.name);
        matched++;
        rawCopied = true;
        logRowsByJpgId.set(item.id, {
          jpgName: item.jpg.name,
          jpgPath: item.jpg.relativePath,
          jpgCaptureTime: item.jpgCaptureTime,
          rawPath: entry.relativePath,
          rawCaptureTime: candidate.captureTime,
          result: manual ? "수동선택" : "확정",
        });
      } catch (error) {
        failed += 1;
        failedNames.push(`${entry.fileHandle.name} — ${error instanceof Error ? error.message : "RAW 복사 실패"}`);
      }
      if (rawCopied && deliveryRootHandle) {
        try {
          deliveryDirectory ??= await deliveryRootHandle.getDirectoryHandle(deliveredFolderName.trim(), { create: true });
          const moveItems = deliveryPlanByJpgId.get(item.jpg.id.normalize("NFC")) ?? [];
          if (!moveItems.some((moveItem) => moveItem.kind === "jpg")) {
            failed += 1;
            failedNames.push(`${item.jpg.name} — 원본 JPG를 찾지 못해 이동하지 않음`);
          } else {
            for (const moveItem of moveItems) {
              try {
                const moved = await moveFileWithSizeVerification({
                  sourceHandle: moveItem.handle,
                  sourceDirectory: moveItem.sourceDirectory,
                  destinationDirectory: deliveryDirectory,
                  name: moveItem.name,
                });
                if (moved.status === "destination_exists") {
                  failed += 1;
                  failedNames.push(`${moveItem.name} — 대상 폴더에 같은 이름이 있어 원본 유지`);
                } else if (moveItem.kind === "jpg") {
                  jpgMoved += 1;
                } else {
                  xmpMoved += 1;
                }
              } catch (error) {
                failed += 1;
                failedNames.push(`${moveItem.name} — ${error instanceof Error ? error.message : "이동 실패"}`);
              }
            }
          }
        } catch (error) {
          failed += 1;
          failedNames.push(`${item.jpg.name} — ${error instanceof Error ? error.message : "JPG 이동 준비 실패"}`);
        }
      }
      done++;
      setProgress({ cur: done, total: approvedMatches.length, msg: `${item.jpg.name} 처리 완료` });
    }
    try {
      const logHandle = await rawSelectDir.getFileHandle("_match_log.csv", { create: true });
      const writable = await logHandle.createWritable();
      await writable.write(buildMatchLogCsv(Array.from(logRowsByJpgId.values())));
      await writable.close();
    } catch (error) {
      failed += 1;
      failedNames.push(`_match_log.csv — ${error instanceof Error ? error.message : "기록 실패"}`);
    }
    const cancelled = cancelRef.current;
    setProgress({
      cur: done, total: approvedMatches.length,
      msg: cancelled ? `중단됨 — ${done.toLocaleString("ko-KR")}장 처리` : "RAW 매칭 완료",
    });
    setResult({
      matched,
      missing,
      selected: preflight.items.length,
      jpgMoved,
      xmpMoved,
      failed,
      deliveredFolderName: deliveryDirectory ? deliveredFolderName.trim() : "",
      missingNames,
      failedNames,
      moveNotice,
      cancelled,
    });
    setStep("done");
    useBackgroundJobsStore.getState().finishJob(RAW_MATCH_JOB_ID, cancelRef.current ? "cancelled" : "done");
  }, [approvedMatches, deliveredFolderName, jpgScanRootDir, moveMatchedJpgs, preflight, preflightTargetCountMatches, rawRootDir, rawSelectMode, rootDir, setProgress]);

  const openRawOutputFolder = useCallback(async () => {
    setRawOutputOpenError("");
    if (!rawOutputDir) {
      setRawOutputOpenError("Selected_RAW 폴더 위치를 확인할 수 없습니다.");
      return;
    }
    const showDirectoryPicker = (window as typeof window & {
      showDirectoryPicker?: (options?: { mode?: "read" | "readwrite"; startIn?: FileSystemHandle }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;
    if (!showDirectoryPicker) {
      setRawOutputOpenError("이 브라우저에서는 폴더 열기를 지원하지 않습니다.");
      return;
    }
    try {
      await showDirectoryPicker({ mode: "read", startIn: rawOutputDir });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRawOutputOpenError(error instanceof Error ? error.message : "Selected_RAW 폴더를 열지 못했습니다.");
    }
  }, [rawOutputDir]);

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
      } catch (error) { console.error("[OLIVIA] Suppressed error", error); }
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
  const FeatureTabs = () => embedded ? null : (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 20 }}>
      <button onClick={() => setFeature("raw_match")} style={{
        padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        border: `1.5px solid ${feature === "raw_match" ? uiAccent : uiBorder}`,
        background: feature === "raw_match" ? groupedSurface : surfaceCard,
        color: feature === "raw_match" ? uiAccent : uiMuted, fontSize: 12, fontWeight: 500,
      }}>셀렉 &amp; RAW 매칭</button>
      <button onClick={() => setFeature("find_move")} style={{
        padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        border: `1.5px solid ${feature === "find_move" ? uiAccent : uiBorder}`,
        background: feature === "find_move" ? groupedSurface : surfaceCard,
        color: feature === "find_move" ? uiAccent : uiMuted, fontSize: 12, fontWeight: 500,
      }}>파일명으로 찾기</button>
      <button onClick={() => setFeature("seq_check")} style={{
        padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        border: `1.5px solid ${feature === "seq_check" ? uiAccent : uiBorder}`,
        background: feature === "seq_check" ? groupedSurface : surfaceCard,
        color: feature === "seq_check" ? uiAccent : uiMuted, fontSize: 12, fontWeight: 500,
      }}>파일 순서 검토</button>
      <button onClick={() => setFeature("program_archive")} style={{
        padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
        border: `1.5px solid ${feature === "program_archive" ? uiAccent : uiBorder}`,
        background: feature === "program_archive" ? groupedSurface : surfaceCard,
        color: feature === "program_archive" ? uiAccent : uiMuted, fontSize: 11, fontWeight: 500,
      }}>모바일 자동화 &gt; 프로그램 아카이브</button>
    </div>
  );

  const updateRawMatchCriteria = (next: RawMatchCriteria) => {
    preflightRequestRef.current += 1;
    rawDiscoveryKeyRef.current = "";
    setRawMatchCriteria(next);
    rawIndexRef.map.clear();
    setPreflight(null);
    setManualRawChoices({});
    if (step === "preflight") setStep("raw_pick");
  };

  const RawMatchCriteriaPanel = () => {
    if (!bridgeLinked || selectedJpgNames.length === 0) return null;
    const ratingEnabled = rawMatchCriteria.source !== "color";
    const colorEnabled = rawMatchCriteria.source !== "rating";
    return (
      <section aria-label="RAW 매칭 기준" style={{ background: groupedSurface, border: `1px solid ${uiBorder}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <strong style={{ color: uiText, fontSize: 12 }}>매칭 기준</strong>
          <div style={{ display: "inline-flex", border: `1px solid ${uiBorder}`, borderRadius: 9, overflow: "hidden" }}>
            {([['rating', '별점'], ['color', '컬러'], ['both', '둘 다']] as const).map(([source, label]) => (
              <button
                key={source}
                type="button"
                aria-pressed={rawMatchCriteria.source === source}
                onClick={() => updateRawMatchCriteria({ ...rawMatchCriteria, source })}
                style={{ minHeight: 36, padding: "0 14px", border: 0, borderRight: source !== "both" ? `1px solid ${uiBorder}` : 0, background: rawMatchCriteria.source === source ? uiAccent : "transparent", color: rawMatchCriteria.source === source ? "#103E36" : uiMuted, font: "inherit", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
              >{label}</button>
            ))}
          </div>
          <span style={{ marginLeft: "auto", color: uiAccent, fontSize: 12, fontWeight: 600 }}>매칭할 사진 {resolvedBridgeTargets.size.toLocaleString("ko-KR")}장</span>
        </div>
        <div style={{ display: "grid", gap: 9 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 36, color: ratingEnabled ? uiText : uiHint, opacity: ratingEnabled ? 1 : .45 }}>
            <span style={{ width: 42, fontSize: 11, fontWeight: 600 }}>별점</span>
            <select
              value={rawMatchCriteria.minRating}
              disabled={!ratingEnabled}
              onChange={(event) => updateRawMatchCriteria({ ...rawMatchCriteria, minRating: Number(event.currentTarget.value) as RawMatchCriteria["minRating"] })}
              style={{ minHeight: 36, border: `1px solid ${uiBorder}`, borderRadius: 8, background: inputSurface, color: uiText, padding: "0 10px", font: "inherit", fontSize: 11 }}
            >
              {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>★{rating} 이상</option>)}
            </select>
          </label>
          <div aria-disabled={!colorEnabled} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 36, color: colorEnabled ? uiText : uiHint, opacity: colorEnabled ? 1 : .45 }}>
            <span style={{ width: 42, fontSize: 11, fontWeight: 600 }}>컬러</span>
            {([6, 7, 8, 9] as BridgeColorLabel[]).map((label) => {
              const checked = rawMatchCriteria.colorLabels.includes(label);
              return (
                <label key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 36, cursor: colorEnabled ? "pointer" : "default", fontSize: 11 }}>
                  <input
                    type="checkbox"
                    disabled={!colorEnabled}
                    checked={checked}
                    onChange={() => updateRawMatchCriteria({
                      ...rawMatchCriteria,
                      colorLabels: checked
                        ? rawMatchCriteria.colorLabels.filter((value) => value !== label)
                        : [...rawMatchCriteria.colorLabels, label].sort() as RawMatchCriteria["colorLabels"],
                    })}
                  />
                  <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: BRIDGE_COLOR_LABELS[label].color }} />
                  {label}
                </label>
              );
            })}
          </div>
        </div>
      </section>
    );
  };

  /* ── 모바일 자동화 > 프로그램 아카이브 ── */
  if (feature === "program_archive") return (
    <div style={{ maxWidth: 760, margin: "32px auto", padding: "0 20px" }}>
      <FeatureTabs />
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <Smartphone size={28} aria-hidden="true" style={{ marginBottom: 8, color: uiAccent }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: uiAccent }}>모바일 자동화 &gt; 프로그램 아카이브</div>
        <div style={{ fontSize: 12, color: uiMuted, marginTop: 4 }}>사진 작업실에서 사용하는 자동화 프로그램을 모아둔 자료실입니다.</div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {PROGRAM_ARCHIVE_ITEMS.map((item) => (
          <div key={item.href} style={{
            background: surfaceCard, border: `1px solid ${uiBorder}`, borderRadius: 14,
            padding: 18, display: "grid", gridTemplateColumns: "1fr auto", gap: 16,
            alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: uiHint, marginBottom: 5 }}>{item.meta}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: uiText, marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: uiMuted, lineHeight: 1.7 }}>{item.desc}</div>
            </div>
            <a href={item.href} download style={{
              display: "inline-block", padding: "9px 16px", borderRadius: 10,
              background: uiAccent, color: surfaceCard, fontSize: 12, fontWeight: 500,
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
          <FileText size={28} aria-hidden="true" style={{ marginBottom: 8, color: uiAccent }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: uiAccent }}>파일명으로 찾기</div>
          <div style={{ fontSize: 12, color: uiMuted, marginTop: 4 }}>파일명 목록을 붙여넣으면 폴더에서 찾아 선택 폴더로 이동합니다.</div>
        </div>

        <div style={{ background: surfaceCard, border: `1px solid ${uiBorder}`, borderRadius: 14, padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: uiText, marginBottom: 8 }}>1. 검색할 폴더 선택 (하위 폴더까지 검색)</div>
            {!hasFS ? (
              <div style={{ fontSize: 12, color: C.red }}>Chrome 또는 Edge를 사용해주세요.</div>
            ) : (
              <Btn onClick={pickFmFolder}>{fmRootDir ? <><CheckCircle2 size={16} aria-hidden="true" />{fmRootDir.name}</> : <><FolderOpen size={16} aria-hidden="true" />폴더 선택</>}</Btn>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: uiText, marginBottom: 8 }}>2. 파일명 목록 (한 줄에 하나씩, 또는 쉼표로 구분)</div>
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
                {fmOcrLoading ? "이미지 읽는 중..." : <><ScanSearch size={15} aria-hidden="true" />스크린샷에서 파일명 추출</>}
              </Btn>
              <span style={{ fontSize: 11, color: uiHint }}>확장자를 제거하고 쉼표로 구분한 한 줄로 자동 입력합니다.</span>
            </div>
            {fmOcrMessage && (
              <div style={{
                marginBottom: 10, borderRadius: 8, padding: "9px 12px", fontSize: 11, fontWeight: 500,
                color: fmOcrMessage.ok ? C.green : C.red,
                background: fmOcrMessage.ok ? groupedSurface : "#FEF2F2",
              }}>
                {fmOcrMessage.text}
              </div>
            )}
            <textarea
              value={fmText}
              onChange={(e) => setFmText(e.target.value)}
              placeholder={"예시:\nDSC_0142.jpg\nDSC_0145.mp4\nDSC_0148  ← 확장자 생략 시 모든 확장자 파일을 찾습니다"}
              rows={7}
              style={{ width: "100%", border: `1px solid ${uiBorder}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", resize: "vertical", background: inputSurface, color: uiText, boxSizing: "border-box" }}
            />
            {fmText.trim() && (
              <div style={{ marginTop: 10, background: groupedSurface, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: uiMuted }}>
                파일명 <strong style={{ color: uiAccent }}>{parseFileNameQueries(fmText).length}개</strong> 입력됨
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: uiText, marginBottom: 8 }}>3. 이동할 선택 폴더 이름</div>
            <input
              value={fmFolderName}
              onChange={(e) => setFmFolderName(e.target.value || "선택")}
              style={{ width: "100%", border: `1px solid ${uiBorder}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
            />
            <div style={{ fontSize: 11, color: uiHint, marginTop: 6 }}>선택한 폴더 안에 이 이름으로 폴더가 생성되고, 찾은 파일이 그 안으로 이동합니다.</div>
          </div>

          <div style={{ textAlign: "center" }}>
            <Btn onClick={runFindByName} disabled={!fmRootDir || !fmText.trim()}>폴더에서 찾기</Btn>
          </div>
        </div>
      </div>
    );

    if (fmStep === "scanning") return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <ScanSearch size={28} aria-hidden="true" style={{ marginBottom: 12, color: uiAccent }} />
        <div style={{ fontSize: 13, color: uiMuted }}>폴더를 검색하는 중입니다...</div>
      </div>
    );

    if (fmStep === "result") return (
      <div style={{ maxWidth: 660, margin: "32px auto", padding: "0 20px" }}>
        <div style={{ background: surfaceCard, border: `1px solid ${uiBorder}`, borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${uiBorder}`, fontSize: 13, fontWeight: 600, color: uiAccent }}>
            검색 결과 — 찾음 {fmMatches.length}개 · 못 찾음 {fmMissing.length}개
          </div>
          <div style={{ padding: 20 }}>
            {fmMatches.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: fmMissing.length > 0 ? 14 : 0 }}>
                {fmMatches.map((m) => (
                  <div key={m.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, color: uiText, borderBottom: `1px solid ${uiBorder}` }}>
                    <span>{m.name}</span>
                    <span style={{ color: uiHint }}>{m.query}</span>
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
          <Btn onClick={runMoveMatched} disabled={fmMatches.length === 0}>{fmFolderName}/ 폴더로 이동</Btn>
        </div>
      </div>
    );

    if (fmStep === "moving") {
      const pct = fmProgress.total > 0 ? Math.round((fmProgress.cur / fmProgress.total) * 100) : 0;
      return (
        <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px" }}>
          <div style={{ fontSize: 13, color: uiMuted, marginBottom: 8, textAlign: "center" }}>{fmProgress.cur} / {fmProgress.total} 이동 중...</div>
          <div style={{ height: 8, background: uiBorder, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: uiAccent, transition: "width .2s" }} />
          </div>
        </div>
      );
    }

    if (fmStep === "done") return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <CheckCircle2 size={28} aria-hidden="true" style={{ marginBottom: 12, color: C.green }} />
        <div style={{ fontSize: 14, fontWeight: 500, color: uiText, marginBottom: 20 }}>
          {fmMovedCount}개 파일을 <strong style={{ color: uiAccent }}>{fmFolderName}/</strong> 폴더로 이동했습니다.
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
          <ListOrdered size={28} aria-hidden="true" style={{ marginBottom: 8, color: uiAccent }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: uiAccent }}>파일 순서 검토</div>
          <div style={{ fontSize: 12, color: uiMuted, marginTop: 4 }}>폴더를 지정하면 파일명 끝자리 번호(예: DSC03532 → 3532)로 넘버링이 끊긴 곳(누락 파일)이 있는지 검사합니다.</div>
        </div>

        <div style={{ background: surfaceCard, border: `1px solid ${uiBorder}`, borderRadius: 14, padding: 24, textAlign: "center" }}>
          {!hasFS ? (
            <div style={{ fontSize: 12, color: C.red }}>Chrome 또는 Edge를 사용해주세요.</div>
          ) : (
            <>
              <Btn onClick={pickScFolder}>{scRootDir ? <><CheckCircle2 size={16} aria-hidden="true" />{scRootDir.name}</> : <><FolderOpen size={16} aria-hidden="true" />폴더 선택</>}</Btn>
              <div style={{ fontSize: 11, color: uiHint, marginTop: 10 }}>선택한 폴더의 하위 폴더까지 전부 검사합니다 — 파일이 여러 폴더에 나뉘어 있어도 파일명 기준으로 하나의 순서로 검사합니다.</div>
              {scRootDir && (
                <div style={{ marginTop: 16 }}>
                  <Btn onClick={runSequenceCheck}>순서 검토 시작</Btn>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );

    if (scStep === "scanning") return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: uiMuted }}>폴더를 스캔하는 중...</div>
      </div>
    );

    if (scStep === "result" && scResult) {
      const hasMissing = scResult.missingRanges.length > 0;
      return (
        <div style={{ maxWidth: 660, margin: "32px auto", padding: "0 20px" }}>
          <FeatureTabs />
          <div style={{ background: surfaceCard, border: `1px solid ${uiBorder}`, borderRadius: 14, padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: uiText, marginBottom: 4 }}>
              총 {scResult.totalFiles}개 파일
              {scResult.min !== null && scResult.max !== null && ` · 번호 범위 ${scResult.min}~${scResult.max}`}
            </div>

            {scResult.recognizedNumbers.length === 0 ? (
              <div style={{ background: inputSurface, borderRadius: 8, padding: "12px 14px", fontSize: 12, color: uiMuted, marginTop: 12 }}>
                번호를 인식할 수 있는 파일이 없습니다.
              </div>
            ) : scResult.rangeTooLarge ? (
              <div style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red, marginTop: 12 }}>
                ⚠️ 번호 범위가 비정상적으로 커서({scResult.min}~{scResult.max}) 검사할 수 없습니다. 파일명에 날짜·시간 등 다른 숫자가 섞여 잘못 인식됐을 가능성이 있습니다.
              </div>
            ) : hasMissing ? (
              <div style={{ background: "rgba(214,188,125,.12)", border: "1px solid rgba(214,188,125,.36)", borderRadius: 8, padding: "12px 14px", marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#C2410C", marginBottom: 6 }}>⚠️ 누락 {scResult.missingRanges.length}건</div>
                <div style={{ fontSize: 12, color: uiText, lineHeight: 1.8 }}>
                  {scResult.missingRanges.map(formatMissingRange).join(", ")}
                </div>
              </div>
            ) : (
              <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "12px 14px", marginTop: 12, fontSize: 13, fontWeight: 500, color: C.green }}>
                ✅ 번호가 모두 연속되어 있습니다. 누락된 파일이 없습니다.
              </div>
            )}

            {scResult.unrecognizedFiles.length > 0 && (
              <div style={{ background: inputSurface, borderRadius: 8, padding: "12px 14px", marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: uiMuted, marginBottom: 6 }}>번호 인식 불가 (검사에서 제외됨) {scResult.unrecognizedFiles.length}개</div>
                <div style={{ fontSize: 11, color: uiHint, maxHeight: 120, overflowY: "auto" }}>{scResult.unrecognizedFiles.join(", ")}</div>
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
  const entryModes = ([
    { key: "folder", icon: <FolderOpen size={15} strokeWidth={2} aria-hidden="true" />, title: "폴더 직접 선택", desc: "JPG 폴더를 열어서\n시각적으로 베스트컷 선택" },
    { key: "text",   icon: <MessageSquare size={15} strokeWidth={2} aria-hidden="true" />, title: "텍스트 붙여넣기", desc: "카카오톡·메모 등\n파일명 목록을 붙여넣기" },
    { key: "upload", icon: <Upload size={15} strokeWidth={2} aria-hidden="true" />, title: "파일 업로드", desc: "고객이 보낸 JPG 파일을\n직접 드래그 & 드롭" },
  ] as const).filter((item) => initialView === "raw" || (initialView === "manual" ? item.key === "folder" : item.key !== "folder"));

  if (step === "idle") return (
    <div style={{ maxWidth: 660, margin: embedded ? "0 auto" : "32px auto", padding: embedded ? "24px 20px 28px" : "0 20px" }}>
      <FeatureTabs />
      {!embedded ? <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>🎯</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: uiAccent }}>RAW 매칭</div>
        <div style={{ fontSize: 12, color: uiMuted, marginTop: 4 }}>고객 선택 정보를 어떻게 받으셨나요?</div>
      </div> : null}

      {/* 3가지 진입 모드 */}
      {initialView !== "manual" ? <div style={{ display: "grid", gridTemplateColumns: `repeat(${entryModes.length}, minmax(0, 1fr))`, gap: 10, marginBottom: 20 }}>
        {entryModes.map(m => (
          <button type="button" key={m.key} onClick={() => setInputMode(m.key)}
            aria-pressed={inputMode === m.key}
            style={{
              background: inputMode === m.key ? (embedded ? "rgba(48,174,146,.14)" : groupedSurface) : surfaceCard,
              border: `1.5px solid ${inputMode === m.key ? uiAccent : uiBorder}`,
              borderRadius: 12, padding: "18px 14px", textAlign: "center", cursor: "pointer",
              transition: "background .2s cubic-bezier(.32,.72,0,1), border-color .2s cubic-bezier(.32,.72,0,1)", fontFamily: "inherit",
            }}>
            <div style={{ minHeight: 22, display: "grid", placeItems: "center", marginBottom: 8, color: inputMode === m.key ? uiAccent : uiMuted }}>{m.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: inputMode === m.key ? uiAccent : uiText, marginBottom: 4 }}>{m.title}</div>
            <div style={{ fontSize: 10, color: uiHint, lineHeight: 1.6, whiteSpace: "pre-line" }}>{m.desc}</div>
          </button>
        ))}
      </div> : null}

      {/* 폴더 선택 모드 */}
      {inputMode === "folder" && (
        <div style={{ background: surfaceCard, border: `1px solid ${uiBorder}`, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 12, color: uiMuted, lineHeight: 1.8, marginBottom: 18, textAlign: "center" }}>
            분류된 JPG 폴더를 선택하면 폴더 이름과 관계없이<br />
            하위 사진을 찾아 그룹별로 베스트컷을 선택할 수 있습니다.
          </div>
          {!hasFS ? (
            <div style={{ fontSize: 12, color: C.red, textAlign: "center" }}>Chrome 또는 Edge를 사용해주세요.</div>
          ) : (
            <div style={{ textAlign: "center" }}><Btn dark={embedded} onClick={loadFolder}><FolderOpen size={16} aria-hidden="true" />폴더 선택</Btn></div>
          )}
          <div style={{ marginTop: 16, background: groupedSurface, borderRadius: 8, padding: "12px 14px", fontSize: 11, color: uiMuted, lineHeight: 1.9 }}>
            {selectionOnly ? (
              <>JPG 또는 분류된 사진 폴더를 선택하세요.<br />선택 결과는 사진 작업실의 JPG 선택 목록에만 저장됩니다.</>
            ) : (
              <>촬영폴더/<br />
                &nbsp;&nbsp;├ <strong>JPG/분류폴더들/</strong> ← JPG 또는 촬영폴더 선택<br />
                &nbsp;&nbsp;├ <strong>RAW/</strong> — 전체 RAW<br />
                &nbsp;&nbsp;└ <strong>Selected_RAW/</strong> — 결과물 자동 생성</>
            )}
          </div>
        </div>
      )}

      {/* 텍스트 붙여넣기 모드 */}
      {inputMode === "text" && (
        <div style={{ background: surfaceCard, border: `1px solid ${uiBorder}`, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 12, color: uiMuted, lineHeight: 1.7, marginBottom: 14 }}>
            카카오톡 대화, 이메일, 메모 등에서 파일명이 담긴 텍스트를 그대로 붙여넣으세요.<br />
            <span style={{ color: uiHint }}>DSC_0142.jpg 형태의 파일명을 자동 추출합니다.</span>
          </div>
          <textarea
            value={clientText}
            onChange={e => setClientText(e.target.value)}
            placeholder={"예시:\nDSC_0142.jpg, DSC_0145.jpg\nDSC_0148.jpg\nDSC_0151.jpg ..."}
            rows={7}
            style={{ width: "100%", border: `1px solid ${uiBorder}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", resize: "vertical", background: inputSurface, color: uiText, boxSizing: "border-box" }}
          />
          {clientText.trim() && (() => {
            const names = parseNamesFromText(clientText);
            return (
              <div style={{ marginTop: 10, background: groupedSurface, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: uiMuted }}>
                파일명 <strong style={{ color: uiAccent }}>{names.size}개</strong> 추출됨
                {names.size > 0 && (
                  <span style={{ marginLeft: 8, color: uiHint }}>
                    {Array.from(names).slice(0, 3).join(", ")}{names.size > 3 ? ` 외 ${names.size - 3}개` : ""}
                  </span>
                )}
              </div>
            );
          })()}
          <div style={{ marginTop: 14, textAlign: "center" }}>
            <Btn dark={embedded} onClick={() => confirmClientInput(parseNamesFromText(clientText))} disabled={!clientText.trim()}>
              {selectionOnly ? "선택 목록 저장" : "다음 — RAW 폴더 선택"}
            </Btn>
          </div>
        </div>
      )}

      {/* 파일 업로드 모드 */}
      {inputMode === "upload" && (
        <div style={{ background: surfaceCard, border: `1px solid ${uiBorder}`, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 12, color: uiMuted, lineHeight: 1.7, marginBottom: 14 }}>
            고객이 선택해서 보낸 JPG 파일 또는 셀렉 리포트 스크린샷을 아래 영역에 드래그하거나 클릭해서 선택하세요.<br />
            <span style={{ color: uiHint }}>일반 JPG는 파일명 그대로, 리포트 이미지는 화면 안의 파일명을 분석해 RAW 매칭에 사용합니다.</span>
          </div>
          <input ref={clientFileRef} type="file" multiple accept="image/*,.jpg,.jpeg,.heic,.png,.tif"
            style={{ display: "none" }}
            onChange={e => { if (e.target.files) setUploadedFiles(e.target.files); }} />
          <div
            onDragOver={e => { e.preventDefault(); setClientDragging(true); }}
            onDragLeave={() => setClientDragging(false)}
            onDrop={e => { e.preventDefault(); setClientDragging(false); setUploadedFiles(e.dataTransfer.files); }}
            onClick={() => clientFileRef.current?.click()}
            style={{
              border: `2px dashed ${clientDragging ? uiAccent : uiBorder}`,
              borderRadius: 12, padding: "48px 24px", textAlign: "center", cursor: "pointer",
              background: clientDragging ? groupedSurface : inputSurface, transition: "all .2s",
            }}>
            <FolderOpen size={32} aria-hidden="true" style={{ marginBottom: 10, color: uiAccent }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: uiAccent, marginBottom: 4 }}>파일을 드래그하거나 클릭</div>
            <div style={{ fontSize: 11, color: uiHint }}>선택 후 파일명 그대로 사용하거나 이미지 안 파일명을 분석할 수 있습니다.</div>
          </div>
          {uploadedClientFiles.length > 0 && (
            <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: inputSurface }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: uiAccent }}>업로드한 파일 {uploadedClientFiles.length}개</div>
              <div style={{ marginTop: 5, maxHeight: 52, overflowY: "auto", fontSize: 10, color: uiMuted, lineHeight: 1.65 }}>
                {uploadedClientFiles.map((file) => file.name).join(", ")}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <Btn dark={embedded} variant="secondary" onClick={() => confirmClientInput(parseNamesFromFiles(uploadedClientFiles))}>
                  파일명 그대로 사용
                </Btn>
                <Btn dark={embedded} variant="secondary" disabled={uploadOcrLoading} onClick={() => void analyzeUploadedFileNames()}>
                  {uploadOcrLoading ? "🔎 이미지 분석 중..." : "🔎 이미지 속 파일명 분석"}
                </Btn>
              </div>
            </div>
          )}
          {uploadOcrMessage && (
            <div style={{ marginTop: 12, borderRadius: 9, padding: "10px 12px", fontSize: 11, fontWeight: 500, color: uploadOcrMessage.ok ? (embedded ? "#A8F1DC" : C.green) : C.red, background: uploadOcrMessage.ok ? groupedSurface : (embedded ? "rgba(232,93,44,.10)" : "#FEF2F2") }}>
              {uploadOcrMessage.text}
            </div>
          )}
          {uploadOcrNames.length > 0 && (
            <div style={{ marginTop: 12, border: `1px solid ${uiBorder}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 12px", background: groupedSurface, color: uiAccent, fontSize: 11, fontWeight: 500 }}>
                <span>인식된 파일명 {uploadOcrNames.length}개</span>
                <span>{selectedUploadOcrNames.size}개 선택</span>
              </div>
              <div style={{ maxHeight: 162, overflowY: "auto", padding: "7px 12px" }}>
                {uploadOcrNames.map((name) => {
                  const checked = selectedUploadOcrNames.has(name);
                  return (
                    <label key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer", color: uiText, fontSize: 11, fontFamily: "monospace", lineHeight: 1.5 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedUploadOcrNames((current) => {
                          const next = new Set(current);
                          if (next.has(name)) next.delete(name);
                          else next.add(name);
                          return next;
                        })}
                      />
                      {name}
                    </label>
                  );
                })}
              </div>
              <div style={{ padding: "0 12px 12px", textAlign: "right" }}>
                <Btn dark={embedded} disabled={selectedUploadOcrNames.size === 0} onClick={() => confirmClientInput(new Set(selectedUploadOcrNames))}>{selectionOnly ? "선택한 인식 목록 저장" : `선택한 ${selectedUploadOcrNames.size}개로 RAW 매칭`}</Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  /* ── RAW 폴더 선택 (client_input 이후) ── */
  if (step === "raw_pick") return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: "0 24px" }}>
      <RawMatchCriteriaPanel />
      <div style={{ background: surfaceCard, borderRadius: 16, border: `1px solid ${uiBorder}`, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 15, fontWeight: 600, color: uiAccent, marginBottom: 6 }}><FolderOpen size={17} aria-hidden="true" />{bridgeLinked ? "RAW 원본 폴더를 자동으로 찾습니다" : "RAW 폴더를 선택하세요"}</div>
        <div style={{ fontSize: 12, color: uiMuted, lineHeight: 1.7, marginBottom: 20 }}>
          {bridgeLinked ? "선택 기준에 맞는" : "고객 선택"} 파일명 <strong style={{ color: uiAccent }}>{authoritativeMatchTargets.size}개</strong>를 확인했습니다.<br />
          {bridgeLinked ? <>선택 사진 1~2장을 기준으로 현재 폴더와 상위 2단계까지만 확인합니다.<br /></> : <>이제 RAW 파일이 들어있는 폴더를 선택하세요.<br /></>}
          매칭된 RAW 파일은 <strong>Selected_RAW/</strong> 폴더에 복사됩니다.
        </div>
        {bridgeLinked ? <div role="status" style={{ background: groupedSurface, border: `1px solid ${rawDiscovery.status === "not_found" || rawDiscovery.status === "error" ? "rgba(201,74,30,.55)" : uiBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: rawDiscovery.status === "not_found" || rawDiscovery.status === "error" ? "#F0A98C" : uiMuted, marginBottom: 14 }}>
          {rawDiscovery.message || "RAW 원본 위치를 확인할 준비가 됐습니다."}
        </div> : null}
        <div style={{ background: groupedSurface, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: uiMuted, marginBottom: 18 }}>
          <div style={{ fontWeight: 500, color: uiAccent, marginBottom: 4 }}>추출된 파일명 샘플</div>
          {Array.from(authoritativeMatchTargets).slice(0, 5).map(n => (
            <div key={n} style={{ fontFamily: "monospace", fontSize: 11 }}>{n}</div>
          ))}
          {authoritativeMatchTargets.size > 5 && <div style={{ color: uiHint }}>... 외 {authoritativeMatchTargets.size - 5}개</div>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="secondary" onClick={() => { setStep("idle"); setSelected(new Set()); }}>← 취소</Btn>
          {bridgeLinked && rawDiscovery.status === "not_found" && (rawMatchDefaultFolder || currentLocalFolder || rootDir) ? <Btn onClick={() => void runPreflight(rawMatchDefaultFolder ?? currentLocalFolder ?? rootDir ?? undefined)}>기본 폴더로 전체 확인</Btn> : null}
          <Btn variant={bridgeLinked ? "secondary" : undefined} onClick={async () => {
            try {
              const dir = await (window as any).showDirectoryPicker({ mode: "readwrite" });
              setRawDiscovery({ status: "manual", folderName: dir.name, message: `${dir.name} 폴더를 직접 선택했습니다.` });
              await runPreflight(dir);
            } catch (e: any) { if (e?.name !== "AbortError") alert("폴더 선택 실패"); }
          }}>{bridgeLinked ? "다른 RAW 폴더 선택" : "RAW 폴더 선택"}</Btn>
        </div>
      </div>
    </div>
  );

  if (step === "selection_done") return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: "0 24px" }}>
      <div style={{ background: surfaceCard, borderRadius: 16, border: `1px solid ${uiBorder}`, padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: uiAccent }}>사진 셀렉 완료</div>
        <p style={{ margin: "8px 0 20px", color: uiMuted, fontSize: 12, lineHeight: 1.7 }}>선택한 JPG {selected.size.toLocaleString("ko-KR")}장을 사진 작업실에 저장했습니다. RAW 매칭 탭에서 이 목록만 사용합니다.</p>
        <Btn onClick={() => { setStep("idle"); setSelected(new Set()); }}>다시 선택하기</Btn>
      </div>
    </div>
  );

  /* ── Loading ── */
  if (step === "loading") return (
    <div style={{ maxWidth: 500, margin: "60px auto", padding: "0 24px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: uiAccent, fontWeight: 500, marginBottom: 12 }}>씬 폴더 스캔 중...</div>
      <div style={{ fontSize: 11, color: uiHint }}>{progress.msg}</div>
    </div>
  );

  /* ── Preflight ── */
  if (step === "preflight") {
    const unresolvedItems = preflight?.items.filter((item) => item.status !== "confirmed") ?? [];
    const manualCount = Object.keys(manualRawChoices).length;
    const preflightSummaryTotal = preflight ? captureMatchSummaryTotal(preflight) : 0;
    return (
    <div style={{ maxWidth: 960, margin: "28px auto", padding: "0 24px" }}>
      <RawMatchCriteriaPanel />
      <div style={{ background: surfaceCard, borderRadius: 16, border: `1px solid ${uiBorder}`, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "14px 20px", borderBottom: `1px solid ${uiBorder}`, fontSize: 13, fontWeight: 600, color: uiAccent }}>
          <ScanSearch size={16} aria-hidden="true" /> 매칭 사전 확인
        </div>
        {rawDiscovery.folderName ? <div style={{ padding: "9px 20px", borderBottom: `1px solid ${uiBorder}`, color: uiMuted, fontSize: 11 }}>
          RAW 원본 폴더 · <strong style={{ color: uiAccent, fontWeight: 600 }}>{rawDiscovery.folderName}</strong>
        </div> : null}
        {!preflight ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <div style={{ height: 6, background: uiBorder, borderRadius: 3, overflow: "hidden", marginBottom: 14 }}>
              <div style={{
                height: "100%", width: "40%", borderRadius: 3, background: uiAccent,
                animation: "select-match-scan-bar 1.1s ease-in-out infinite",
              }} />
            </div>
            <div style={{ fontSize: 12, color: uiHint }}>
              RAW 후보와 촬영시각 확인 중{rawScanCount > 0 ? ` — ${rawScanCount.toLocaleString()}장 완료` : "..."}
            </div>
            <style>{`@keyframes select-match-scan-bar { 0% { margin-left: 0%; } 50% { margin-left: 60%; } 100% { margin-left: 0%; } }`}</style>
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginBottom: 18 }}>
              {[
                { label: "확정", value: preflight.confirmed, color: C.green },
                { label: "촬영시각 불일치", value: preflight.timeMismatch, color: preflight.timeMismatch ? C.red : uiHint },
                { label: "후보 여러 개", value: preflight.multipleCandidates, color: preflight.multipleCandidates ? "#D6BC7D" : uiHint },
                { label: "촬영시각 없음", value: preflight.missingTime, color: preflight.missingTime ? "#D6BC7D" : uiHint },
                { label: "RAW 없음", value: preflight.rawMissing, color: preflight.rawMissing ? C.red : uiHint },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: inputSurface, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 600, color }}>{value}</div>
                  <div style={{ fontSize: 10, color: uiHint, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            <div role="status" style={{ background: groupedSurface, border: `1px solid ${uiBorder}`, borderRadius: 9, padding: "10px 13px", color: uiText, fontSize: 12, marginBottom: 16 }}>
              매칭 {preflight.items.length.toLocaleString("ko-KR")}장 = <strong style={{ color: C.green }}>확정 {preflight.confirmed.toLocaleString("ko-KR")}장</strong>
              {` · 촬영시각 불일치 ${preflight.timeMismatch.toLocaleString("ko-KR")}장 · 후보 여러 개 ${preflight.multipleCandidates.toLocaleString("ko-KR")}장 · 촬영시각 없음 ${preflight.missingTime.toLocaleString("ko-KR")}장`}
              {preflight.rawMissing ? ` · RAW 없음 ${preflight.rawMissing.toLocaleString("ko-KR")}장` : ""}
              {manualCount ? <strong style={{ color: uiAccent }}> · 직접 선택 {manualCount.toLocaleString("ko-KR")}장</strong> : null}
            </div>

            {!preflightTargetCountMatches ? (
              <div role="alert" style={{ background: "#FEF2F2", border: "1px solid rgba(201,74,30,.35)", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red, marginBottom: 16 }}>
                대상 수가 맞지 않습니다. 매칭 기준 {authoritativeMatchTargets.size.toLocaleString("ko-KR")}장 · 사전 확인 {preflight.items.length.toLocaleString("ko-KR")}장 · 상태 합계 {preflightSummaryTotal.toLocaleString("ko-KR")}장입니다. 폴더를 다시 확인해 주세요.
              </div>
            ) : preflight.items.length === 0 ? (
              <div role="alert" style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red, marginBottom: 16 }}>
                촬영시각을 확인할 JPG 원본 파일을 찾지 못했습니다. 파일명 목록만으로는 안전하게 매칭하지 않습니다. JPG가 들어 있는 촬영 폴더를 다시 열어 주세요.
              </div>
            ) : preflight.rawFound === 0 ? (
              <div style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red, marginBottom: 16 }}>
                RAW 파일을 찾지 못했습니다. 상단의 <strong>RAW 폴더 선택</strong> 버튼으로 올바른 폴더를 선택해주세요.
              </div>
            ) : preflight.confirmed === 0 && manualCount === 0 ? (
              <div style={{ background: "#FEF9C3", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#92400E", marginBottom: 16 }}>
                자동 확정된 RAW가 없습니다. 아래 경로와 촬영시각을 확인하고 필요한 항목만 직접 선택해 주세요.
              </div>
            ) : null}

            {unresolvedItems.length > 0 ? <div style={{ display: "grid", gap: 10, marginBottom: 18, maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
              {unresolvedItems.map((item) => {
                const statusLabel = item.status === "time_mismatch" ? "촬영시각 불일치" : item.status === "multiple_candidates" ? "후보 여러 개" : item.status === "missing_time" ? "촬영시각 없음" : "RAW 없음";
                return <div key={item.id} style={{ display: "grid", gridTemplateColumns: "112px minmax(0, .9fr) minmax(0, 1.5fr)", gap: 12, padding: 12, border: `1px solid ${uiBorder}`, borderRadius: 10, background: inputSurface }}>
                  <div style={{ height: 82, borderRadius: 7, overflow: "hidden", background: "rgba(0,0,0,.28)", display: "grid", placeItems: "center" }}>
                    {item.jpg.thumbUrl ? <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 FileSystemHandle에서 만든 blob 썸네일 */}
                      <img src={item.jpg.thumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </> : <span style={{ color: uiHint, fontSize: 10 }}>미리보기 없음</span>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", color: uiText, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>{item.jpg.name}</strong>
                    <span style={{ display: "block", color: uiHint, fontSize: 10, marginTop: 4, overflowWrap: "anywhere" }}>{item.jpg.relativePath}</span>
                    <span style={{ display: "block", color: uiMuted, fontSize: 10, marginTop: 6 }}>{formatCaptureTime(item.jpgCaptureTime)}</span>
                    <span style={{ display: "inline-block", color: item.status === "time_mismatch" || item.status === "raw_missing" ? C.red : "#D6BC7D", fontSize: 10, marginTop: 6, fontWeight: 600 }}>{statusLabel}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    {item.candidates.length > 0 ? <>
                      <select
                        aria-label={`${item.jpg.name} RAW 직접 선택`}
                        value={manualRawChoices[item.id] ?? ""}
                        onChange={(event) => setManualRawChoices((current) => {
                          const next = { ...current };
                          if (event.currentTarget.value) next[item.id] = event.currentTarget.value;
                          else delete next[item.id];
                          return next;
                        })}
                        style={{ width: "100%", minHeight: 40, border: `1px solid ${uiBorder}`, borderRadius: 8, background: surfaceCard, color: uiText, padding: "0 9px", font: "inherit", fontSize: 10 }}
                      >
                        <option value="">복사하지 않음</option>
                        {item.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.entry.relativePath} · {formatCaptureTime(candidate.captureTime)}</option>)}
                      </select>
                      <div style={{ marginTop: 7, display: "grid", gap: 4 }}>
                        {item.candidates.map((candidate) => <div key={candidate.id} style={{ color: uiHint, fontSize: 9, overflowWrap: "anywhere" }}>
                          {candidate.entry.relativePath} · {formatCaptureTime(candidate.captureTime)}{candidate.differenceMs !== null ? ` · 차이 ${(candidate.differenceMs / 1000).toFixed(3)}초` : ""}
                        </div>)}
                      </div>
                      {item.status === "missing_time" && item.candidates.length === 1 && !manualRawChoices[item.id] ? <button
                        type="button"
                        onClick={() => setManualRawChoices((current) => ({ ...current, [item.id]: item.candidates[0].id }))}
                        style={{ marginTop: 8, minHeight: 34, border: `1px solid ${uiBorder}`, borderRadius: 7, background: groupedSurface, color: uiAccent, padding: "0 10px", font: "inherit", fontSize: 10, cursor: "pointer" }}
                      >파일명만으로 매칭</button> : null}
                    </> : <span style={{ color: C.red, fontSize: 10 }}>같은 파일명의 RAW 후보가 없습니다.</span>}
                  </div>
                </div>;
              })}
            </div> : null}

            {approvedMatches.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: uiHint, marginBottom: 6 }}>매칭된 RAW 처리 방식</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {([["copy", "복사 (원본 유지)"], ["move", "이동 (원본 삭제)"]] as const).map(([mode, label]) => (
                    <button key={mode} onClick={() => setRawSelectMode(mode)} style={{
                      flex: 1, padding: "10px 0", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                      border: `1.5px solid ${rawSelectMode === mode ? uiAccent : uiBorder}`,
                      background: rawSelectMode === mode ? groupedSurface : surfaceCard,
                      color: rawSelectMode === mode ? uiAccent : uiMuted,
                      fontSize: 12, fontWeight: 600,
                    }}>{label}</button>
                  ))}
                </div>
                {rawSelectMode === "move" && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(214,188,125,.12)", borderRadius: 8, fontSize: 11, color: "#D6BC7D", border: "1px solid rgba(214,188,125,.36)" }}>
                    ⚠️ 이동을 선택하면 원본 RAW 파일이 원래 위치에서 삭제됩니다.
                  </div>
                )}
              </div>
            )}

            {approvedMatches.length > 0 && (
              <div style={{ marginBottom: 16, padding: "12px 14px", border: `1px solid ${uiBorder}`, borderRadius: 10, background: groupedSurface }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, color: uiText, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  <input type="checkbox" checked={moveMatchedJpgs} onChange={(event) => setMoveMatchedJpgs(event.currentTarget.checked)} />
                  매칭한 JPG를 보정본 폴더로 옮기기
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, opacity: moveMatchedJpgs ? 1 : .45 }}>
                  <span style={{ color: uiMuted, fontSize: 11 }}>JPG 폴더 안</span>
                  <input
                    value={deliveredFolderName}
                    disabled={!moveMatchedJpgs}
                    aria-label="매칭한 JPG를 옮길 폴더 이름"
                    onChange={(event) => {
                      setDeliveredFolderNameDirty(true);
                      setDeliveredFolderName(event.currentTarget.value);
                    }}
                    style={{ minHeight: 38, flex: 1, minWidth: 0, border: `1px solid ${uiBorder}`, borderRadius: 8, background: inputSurface, color: uiText, padding: "0 10px", font: "inherit", fontSize: 11 }}
                  />
                  <span style={{ color: uiMuted, fontSize: 11 }}>폴더</span>
                </div>
                <p style={{ margin: "8px 0 0", color: uiHint, fontSize: 10, lineHeight: 1.55 }}>RAW 복사가 성공한 JPG와 같은 이름의 XMP만 안전하게 복사·크기 확인 후 원본 위치에서 지웁니다.</p>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="secondary" onClick={() => { preflightRequestRef.current += 1; setStep("ready"); }}>← 취소</Btn>
              {approvedMatches.length > 0 && (
                <Btn disabled={!preflightTargetCountMatches} onClick={runMatch}>{manualCount ? "확정 + 직접 선택" : "확정된 것만"} {rawSelectMode === "move" ? "이동" : "복사"} ({approvedMatches.length}개)</Btn>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
  }

  /* ── Matching ── */
  if (step === "matching") {
    const progressPercent = rawMatchProgressPercent(progress.cur, progress.total);
    return (
    <div style={{ maxWidth: 680, margin: "32px auto", padding: "0 24px" }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: uiAccent, marginBottom: 12 }}>RAW 매칭 진행 중...</div>
      <div
        role="progressbar"
        aria-label="RAW 매칭 진행률"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        style={{ position: "relative", height: 24, background: uiBorder, borderRadius: 7, overflow: "hidden", marginBottom: 10 }}
      >
        <div style={{ height: "100%", width: `${progressPercent}%`, background: uiAccent, borderRadius: 7, transition: "width .2s" }} />
        <strong style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: progressPercent >= 55 ? "#103E36" : uiText, fontSize: 11, fontWeight: 600 }}>{progressPercent}%</strong>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: uiHint, fontSize: 11 }}>
        <span>{progress.msg}</span>
        <span style={{ flex: "0 0 auto" }}>{progress.cur.toLocaleString("ko-KR")} / {progress.total.toLocaleString("ko-KR")}장</span>
      </div>
      <button onClick={() => { cancelRef.current = true; }} style={{ marginTop: 12, padding: "6px 16px", background: "transparent", border: `1px solid ${uiBorder}`, borderRadius: 8, fontSize: 12, cursor: "pointer", color: uiMuted, fontFamily: "inherit" }}>중단</button>
    </div>
    );
  }

  /* ── Done ── */
  if (step === "done") return (
    <div style={{ maxWidth: 560, margin: "40px auto", padding: "0 24px" }}>
      <div style={{ background: surfaceCard, borderRadius: 16, border: `1px solid ${uiBorder}`, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "14px 20px", borderBottom: `1px solid ${uiBorder}`, fontSize: 13, fontWeight: 600, color: result.cancelled ? "#D6BC7D" : C.green }}><CheckCircle2 size={17} aria-hidden="true" />{result.cancelled ? "매칭 중단됨" : "매칭 완료"}</div>
        <div style={{ padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { label: "선택 JPG", value: result.selected, color: uiAccent },
              { label: "RAW 매칭", value: result.matched, color: C.green },
              { label: "검증 제외", value: result.missing, color: result.missing > 0 ? "#D6BC7D" : uiHint },
              { label: "실패", value: result.failed, color: result.failed > 0 ? C.red : uiHint },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: inputSurface, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 600, color }}>{value}</div>
                <div style={{ fontSize: 10, color: uiHint, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: groupedSurface, borderRadius: 8, padding: "12px 14px", fontSize: 11, color: uiMuted, lineHeight: 1.9, marginBottom: 16 }}>
            <FolderOpen size={14} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 5 }} /><strong style={{ color: uiAccent }}>Selected_RAW/</strong> — 매칭 RAW {rawSelectMode === "move" ? "이동" : "복사"} 완료<br />
            <span style={{ color: uiHint }}>{rawSelectMode === "move" ? "원본 RAW 파일은 삭제되었습니다." : "원본 RAW 파일은 삭제되지 않았습니다."}</span>
          </div>
          <div style={{ background: inputSurface, borderRadius: 8, padding: "12px 14px", fontSize: 11, color: uiText, lineHeight: 1.75, marginBottom: 16 }}>
            RAW {result.matched.toLocaleString("ko-KR")}장 Selected_RAW로 {rawSelectMode === "move" ? "이동" : "복사"}
            {result.deliveredFolderName ? <> · JPG {result.jpgMoved.toLocaleString("ko-KR")}장(+xmp {result.xmpMoved.toLocaleString("ko-KR")}개) {result.deliveredFolderName}으로 이동</> : null}
            {` · 검증 제외 ${result.missing.toLocaleString("ko-KR")}장 · 실패 ${result.failed.toLocaleString("ko-KR")}장 · _match_log.csv 기록`}
          </div>
          {result.moveNotice ? <div role="status" style={{ marginBottom: 12, borderRadius: 8, padding: "10px 12px", background: "rgba(214,188,125,.12)", border: "1px solid rgba(214,188,125,.36)", color: "#D6BC7D", fontSize: 11 }}>{result.moveNotice}</div> : null}
          {rawOutputOpenError ? <div role="alert" style={{ marginBottom: 12, color: C.red, fontSize: 11 }}>{rawOutputOpenError}</div> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Btn onClick={() => void openRawOutputFolder()} disabled={!rawOutputDir}><FolderOpen size={15} aria-hidden="true" />Selected_RAW 폴더 열기</Btn>
            <Btn variant="secondary" onClick={() => { setStep("ready"); setRawOutputDir(null); setRawOutputOpenError(""); }}>← 다시 선택</Btn>
            <Btn variant="secondary" onClick={() => { setStep("idle"); setRootDir(null); setScenes([]); setSelected(new Set()); setRawOutputDir(null); setRawOutputOpenError(""); }}>처음으로</Btn>
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
      <div style={{ background: "rgba(214,188,125,.12)", border: "1px solid rgba(214,188,125,.36)", borderRadius: 12, padding: "12px 18px", marginBottom: 12, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#92400E" }}>
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
                  padding: "4px 12px", fontSize: 11, fontWeight: 500, borderRadius: 8,
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
                style={{ padding: "4px 12px", fontSize: 11, fontWeight: 500, background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, cursor: "pointer", color: "#92400E", fontFamily: "inherit" }}
              >JPG에서 별점 읽기</button>
            )}
          </div>
        )}
      </div>

      {/* 상단 액션바 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: surfaceCard, borderRadius: 12, border: `1px solid ${uiBorder}`, padding: "12px 18px", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 600, color: uiAccent }}>{selected.size}장 선택됨</span>
            <span style={{ fontSize: 11, color: uiHint, marginLeft: 8 }}>
              {queryTokens.length ? `${matchedCount}장 찾음 / 전체 ${totalPhotos}장` : `/ 전체 ${totalPhotos}장 (${scenes.length}씬)`}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={() => setSelected(new Set(scenes.flatMap(s => s.photos.map(p => p.basename.toLowerCase()))))}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 500, background: groupedSurface, border: `1px solid ${uiBorder}`, borderRadius: 6, cursor: "pointer", color: uiAccent, fontFamily: "inherit" }}
            >전체 선택</button>
            <button
              onClick={() => setSelected(new Set())}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 500, background: surfaceCard, border: `1px solid ${uiBorder}`, borderRadius: 6, cursor: "pointer", color: uiMuted, fontFamily: "inherit" }}
            >전체 해제</button>
            <input
              type="search"
              value={nameQuery}
              onChange={(event) => setNameQuery(event.currentTarget.value)}
              placeholder="파일명 검색 (R5K, DSC…)"
              aria-label="파일명 검색"
              autoComplete="off"
              style={{ width: 190, maxWidth: "100%", padding: "4px 10px", fontSize: 11, background: inputSurface, border: `1px solid ${uiBorder}`, borderRadius: 6, color: uiText, fontFamily: "inherit", outline: "none" }}
            />
            {queryTokens.length ? <button
              type="button"
              onClick={() => setSelected((previous) => {
                const next = new Set(previous);
                for (const scene of visibleScenes) {
                  for (const photo of scene.photos) next.add(photo.basename.toLowerCase());
                }
                return next;
              })}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 500, background: groupedSurface, border: `1px solid ${uiBorder}`, borderRadius: 6, cursor: "pointer", color: uiAccent, fontFamily: "inherit", whiteSpace: "nowrap" }}
            >검색 결과 {matchedCount}장 선택</button> : null}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {selectionOnly ? (
            <Btn onClick={() => completeSelection(selected)} disabled={selected.size === 0}>
              {selected.size > 0 ? `선택 ${selected.size}장 저장` : "사진을 선택하세요"}
            </Btn>
          ) : (
            <>
              <Btn onClick={runPreflight} disabled={selected.size === 0}>
                {selected.size > 0 ? `${selected.size}장 RAW 매칭 확인` : "사진을 선택하세요"}
              </Btn>
              <button
                onClick={pickRawFolder}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                  background: rawRootDir ? "#DCFCE7" : "#FEF9C3",
                  border: `1px solid ${rawRootDir ? "#86EFAC" : "#FDE68A"}`,
                  borderRadius: 8, color: rawRootDir ? "#166534" : "#92400E",
                }}
                title={rawRootDir ? `RAW 폴더: ${rawRootDir.name}` : "RAW 파일이 있는 폴더를 별도로 선택"}
              >{rawRootDir ? <><FolderOpen size={14} aria-hidden="true" />{rawRootDir.name}</> : <><FolderOpen size={14} aria-hidden="true" />RAW 폴더 선택</>}</button>
            </>
          )}
          {!bridgeLinked ? <button
            onClick={() => { setStep("idle"); setRootDir(null); setRawRootDir(null); setScenes([]); setSelected(new Set()); }}
            style={{ padding: "6px 10px", fontSize: 11, background: "transparent", border: `1px solid ${uiBorder}`, borderRadius: 8, cursor: "pointer", color: uiMuted, fontFamily: "inherit" }}
          >폴더 변경</button> : null}
        </div>
      </div>

      {/* 씬별 패널 */}
      {scenes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: uiHint, fontSize: 13 }}>
          JPG 파일을 찾지 못했습니다. 폴더를 다시 확인해주세요.
        </div>
      ) : queryTokens.length && visibleScenes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: uiHint, fontSize: 13 }}>
          &quot;{nameQuery.trim()}&quot;와 맞는 파일이 없습니다
        </div>
      ) : (
        visibleScenes.map((scene, si) => {
          const sourceSceneIndex = queryTokens.length
            ? scenes.findIndex((candidate) => candidate.dirHandle === scene.dirHandle)
            : si;
          const sceneSelCount = scene.photos.filter(p => selected.has(p.basename.toLowerCase())).length;
          const isExpanded = queryTokens.length > 0 || expanded.has(sourceSceneIndex);
          return (
            <div key={sourceSceneIndex} style={{ background: surfaceCard, borderRadius: 12, border: `1px solid ${uiBorder}`, overflow: "hidden", marginBottom: 10 }}>
              {/* 씬 헤더 */}
              <div
                onClick={() => {
                  if (queryTokens.length) return;
                  setExpanded(prev => {
                    const next = new Set(prev);
                    if (next.has(sourceSceneIndex)) { next.delete(sourceSceneIndex); }
                    else { next.add(sourceSceneIndex); loadSceneThumbs(sourceSceneIndex); }
                    return next;
                  });
                }}
                style={{ padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: sceneSelCount > 0 ? uiAccent : uiBorder,
                    display: "flex", alignItems: "center", justifyContent: "center", color: sceneSelCount > 0 ? "#103E36" : uiMuted, fontSize: 12, fontWeight: 500, transition: "background .2s", flexShrink: 0,
                  }}>{sourceSceneIndex + 1}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: uiText }}>{scene.name}</div>
                    <div style={{ fontSize: 10, color: uiHint }}>{scene.photos.length}장</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {sceneSelCount > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 500, color: uiAccent, background: groupedSurface, padding: "3px 10px", borderRadius: 12 }}>✓ {sceneSelCount}장</span>
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
                    style={{ padding: "3px 8px", fontSize: 10, fontWeight: 500, background: groupedSurface, border: `1px solid ${uiBorder}`, borderRadius: 6, cursor: "pointer", color: uiAccent, fontFamily: "inherit" }}
                  >{scene.photos.every(p => selected.has(p.basename.toLowerCase())) ? "해제" : "씬 전체"}</button>
                  <span style={{ fontSize: 10, color: uiHint, width: 12 }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* 썸네일 그리드 */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${uiBorder}`, padding: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
                    {scene.photos.map(p => {
                      const k = p.basename.toLowerCase();
                      const isSel = selected.has(k);
                      return (
                        <div
                          key={p.name}
                          onClick={() => setSelected(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                          style={{
                            // OLIVIA OS 1차 작업 지시서 6단계 — 선택 표시를 테두리가 아니라
                            // 우상단 체크 배지로 통일한다(배지는 이미 있었다, 테두리 강조만
                            // 없앤다). 테두리를 선택 여부와 무관하게 고정해서 사진 색 판단에
                            // 방해되는 색 테두리 대비를 없앤다.
                            position: "relative", cursor: "pointer", borderRadius: 7, overflow: "hidden",
                            border: `1.5px solid ${uiBorder}`,
                            aspectRatio: "3/2", background: "#e5eeec",
                          }}
                        >
                          {p.thumbUrl
                            ? <img src={p.thumbUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            : <div style={{ width: "100%", height: "100%", background: "#dde8e6" }} />
                          }
                          {isSel && (
                            <div style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%", background: uiAccent, boxShadow: "0 0 0 2px rgba(255,255,255,.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#103E36", fontWeight: 600 }}>✓</div>
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

      {/* 하단 플로팅 알약 바 (선택 시만) — OLIVIA OS 1차 작업 지시서 6단계: 선택 개수 /
          전체 해제 / 다음 단계를 한 알약 안에 모은다. borderRadius를 완전한 캡슐 모양으로. */}
      {selected.size > 0 && (
        <div style={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ pointerEvents: "all", background: uiAccent, color: "#103E36", borderRadius: 999, padding: "10px 12px 10px 22px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 20px rgba(21,88,85,.35)" }}>
            <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>{selected.size}장 선택됨</span>
            <button
              onClick={() => setSelected(new Set())}
              style={{ padding: "7px 16px", background: "transparent", border: "1px solid rgba(16,62,54,.4)", borderRadius: 999, color: "#103E36", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >전체 해제</button>
            <button
              onClick={() => runPreflight()}
              style={{ padding: "7px 18px", background: "rgba(16,62,54,.12)", border: "1px solid rgba(16,62,54,.4)", borderRadius: 999, color: "#103E36", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily:"inherit", whiteSpace: "nowrap" }}
            >RAW 매칭 확인</button>
          </div>
        </div>
      )}
    </div>
  );
}
