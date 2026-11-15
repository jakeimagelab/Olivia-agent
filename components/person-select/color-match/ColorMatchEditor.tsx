"use client";
/* eslint-disable @next/next/no-img-element -- Private signed previews must stay directly canvas-readable. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Pipette,
  RotateCcw,
  Save,
  Sparkles,
  X,
} from "lucide-react";

import { ColorHistogram } from "@/components/person-select/color-match/ColorHistogram";
import { usePhotoEditPreview } from "@/components/person-select/color-match/usePhotoEditPreview";
import { useRemoteJobPoller } from "@/components/person-select/admin/hooks/useRemoteJobPoller";
import { readApiResponse } from "@/lib/http/apiResponse";
import {
  clonePhotoEditRecipe,
  colorMatchSignal,
  deriveAutomaticRecipe,
  IDENTITY_PHOTO_EDIT_RECIPE,
  labChroma,
  labHue,
  labToSrgb,
  mergePhotoEditRecipes,
  skinDifference,
  srgbToLab,
  type ColorMatchPublicResult,
  type LabColor,
  type PhotoEditRecipe,
  type PhotoMeasurement,
} from "@/lib/photo-edit";
import styles from "./ColorMatchEditor.module.css";

type ApiResult = { event?: { id: string; title: string }; colorMatch?: ColorMatchPublicResult | null; job?: { id?: string; status?: string } | null };
type Scope = "photo" | "common";
type ViewMode = "single" | "split" | "all";
type SectionKey = "light" | "color" | "skin" | "gown" | "curve";
type SliderKey = keyof PhotoEditRecipe["light"] | keyof PhotoEditRecipe["color"] | keyof PhotoEditRecipe["skin"] | keyof PhotoEditRecipe["gown"];

const SECTION_LABELS: Record<SectionKey, string> = { light: "밝게", color: "색상", skin: "피부 톤", gown: "가운", curve: "곡선" };
const SIGNAL_LABEL = { pass: "통과", check: "확인", review: "다시 보기", "no-skin": "피부 없음" } as const;

const SLIDERS: Record<Exclude<SectionKey, "curve">, Array<{ key: SliderKey; label: string; min: number; max: number; step?: number }>> = {
  light: [
    { key: "exposure", label: "노출", min: -2, max: 2, step: 0.01 },
    { key: "contrast", label: "대비", min: -100, max: 100 },
    { key: "highlights", label: "밝은 영역", min: -100, max: 100 },
    { key: "shadows", label: "어두운 영역", min: -100, max: 100 },
    { key: "whites", label: "흰색 계열", min: -100, max: 100 },
    { key: "blacks", label: "검정 계열", min: -100, max: 100 },
  ],
  color: [
    { key: "temperature", label: "색온도", min: -100, max: 100 },
    { key: "tint", label: "색조", min: -100, max: 100 },
  ],
  skin: [
    { key: "hue", label: "색상", min: -100, max: 100 },
    { key: "chroma", label: "채도", min: -100, max: 100 },
    { key: "lightness", label: "밝기", min: -100, max: 100 },
    { key: "highlight", label: "하이라이트", min: -100, max: 100 },
    { key: "mid", label: "미드톤", min: -100, max: 100 },
    { key: "shadow", label: "그림자", min: -100, max: 100 },
    { key: "uniformity", label: "얼룩 고르게", min: 0, max: 100 },
  ],
  gown: [
    { key: "lightness", label: "밝기", min: -100, max: 100 },
    { key: "warmth", label: "따뜻함", min: -100, max: 100 },
    { key: "tint", label: "색조", min: -100, max: 100 },
    { key: "strength", label: "강도", min: 0, max: 100 },
  ],
};

function trafficClass(signal: keyof typeof SIGNAL_LABEL) {
  return signal === "pass" ? styles.pass : signal === "check" ? styles.check : signal === "review" ? styles.review : styles.noSkin;
}

function rgbCss(lab: LabColor | null | undefined) {
  if (!lab) return "rgb(100 100 100)";
  const [r, g, b] = labToSrgb(lab).map((value) => Math.round(value));
  return `rgb(${r} ${g} ${b})`;
}

function targetFromSample(current: PhotoMeasurement, lab: LabColor): PhotoMeasurement {
  if (!current.skin) return current;
  return {
    ...current,
    skin: {
      ...current.skin,
      l25: lab.l - (current.skin.l50 - current.skin.l25),
      l50: lab.l,
      l75: lab.l + (current.skin.l75 - current.skin.l50),
      chroma: labChroma(lab),
      hue: labHue(lab),
      lab,
    },
  };
}

async function sampleImage(url: string, normalizedX: number, normalizedY: number): Promise<LabColor> {
  const response = await fetch(url);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("스포이드로 사진을 읽지 못했습니다.");
  context.drawImage(bitmap, 0, 0); bitmap.close();
  const x = Math.round(normalizedX * (canvas.width - 1));
  const y = Math.round(normalizedY * (canvas.height - 1));
  const startX = Math.max(0, x - 4);
  const startY = Math.max(0, y - 4);
  const sampleWidth = Math.min(9, canvas.width - startX);
  const sampleHeight = Math.min(9, canvas.height - startY);
  const pixels = context.getImageData(startX, startY, sampleWidth, sampleHeight).data;
  let red = 0; let green = 0; let blue = 0; let count = 0;
  for (let index = 0; index < pixels.length; index += 4) { red += pixels[index]; green += pixels[index + 1]; blue += pixels[index + 2]; count += 1; }
  return srgbToLab(red / count, green / count, blue / count);
}

function EditorSlider({ label, value, min, max, step = 1, track, onChange, onDrag }: {
  label: string; value: number; min: number; max: number; step?: number; track?: "temperature" | "tint";
  onChange: (value: number) => void; onDrag: (dragging: boolean) => void;
}) {
  return <label className={styles.sliderRow}>
    <span>{label}</span>
    <input className={track ? styles[`${track}Track`] : ""} type="range" min={min} max={max} step={step} value={value} onPointerDown={() => onDrag(true)} onPointerUp={() => onDrag(false)} onPointerCancel={() => onDrag(false)} onChange={(event) => onChange(Number(event.target.value))} />
    <input type="number" min={min} max={max} step={step} value={Number(value.toFixed(step < 1 ? 2 : 0))} onDoubleClick={() => onChange(0)} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value))))} aria-label={`${label} 값`} />
  </label>;
}

export function ColorMatchEditor({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ColorMatchPublicResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [scope, setScope] = useState<Scope>("photo");
  const [recipes, setRecipes] = useState<Record<string, PhotoEditRecipe>>({});
  const [commonRecipe, setCommonRecipe] = useState<PhotoEditRecipe>(() => clonePhotoEditRecipe());
  const [targetMeasurement, setTargetMeasurement] = useState<PhotoMeasurement | null>(null);
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());
  const [commonDirty, setCommonDirty] = useState(false);
  const [targetDirty, setTargetDirty] = useState(false);
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set(["skin"]));
  const [disabledSections, setDisabledSections] = useState<Set<SectionKey>>(new Set());
  const sectionBackupsRef = useRef(new Map<string, PhotoEditRecipe[Exclude<SectionKey, "curve">] | PhotoEditRecipe["curve"]>());
  const [showSkinMask, setShowSkinMask] = useState(false);
  const [originalHeld, setOriginalHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [eyedropper, setEyedropper] = useState(false);
  const [saveJobId, setSaveJobId] = useState("");
  const [message, setMessage] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySections, setCopySections] = useState<Set<SectionKey>>(new Set(Object.keys(SECTION_LABELS) as SectionKey[]));
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const response = await fetch(`/api/person-select/${eventId}/color-match`, { cache: "no-store" });
    const body = await readApiResponse<ApiResult>(response, "색 맞춤 편집기");
    if (!body.colorMatch) throw new Error("먼저 보정본 올리기에서 색 맞춤을 실행해 주세요.");
    setData(body.colorMatch);
    setRecipes(Object.fromEntries(body.colorMatch.files.map((file) => [file.relativePath, clonePhotoEditRecipe(file.recipe)])));
    setCommonRecipe(clonePhotoEditRecipe(body.colorMatch.commonRecipe));
    setTargetMeasurement(body.colorMatch.targetMeasurement);
    const requested = new URLSearchParams(window.location.search).get("file");
    if (requested) {
      const index = body.colorMatch.files.findIndex((file) => file.relativePath === requested);
      if (index >= 0) setSelectedIndex(index);
    }
    return body;
  }, [eventId]);

  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "색 맞춤 결과를 읽지 못했습니다.")); }, [load]);
  const dirty = dirtyFiles.size > 0 || commonDirty || targetDirty;
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input,textarea,select,[contenteditable=true]")) return;
      if (event.key === "ArrowLeft") setSelectedIndex((index) => Math.max(0, index - 1));
      if (event.key === "ArrowRight") setSelectedIndex((index) => Math.min((data?.files.length ?? 1) - 1, index + 1));
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [data?.files.length]);

  useRemoteJobPoller({
    jobId: saveJobId,
    label: "색 맞춤 저장",
    onTerminal: async (job) => {
      if (job.status === "COMPLETED") {
        await load();
        setDirtyFiles(new Set()); setCommonDirty(false); setTargetDirty(false); setMessage("원본 해상도로 저장했습니다.");
      } else setMessage(job.error || job.message || "색 맞춤 저장에 실패했습니다.");
      setSaveJobId("");
    },
  });

  const selected = data?.files[selectedIndex] ?? null;
  const selectedRecipe = selected ? recipes[selected.relativePath] ?? selected.recipe : clonePhotoEditRecipe();
  const effectiveRecipe = useMemo(() => mergePhotoEditRecipes(commonRecipe, selectedRecipe), [commonRecipe, selectedRecipe]);
  const previewRecipe = useMemo(() => {
    const next = clonePhotoEditRecipe(effectiveRecipe);
    for (const section of disabledSections) {
      if (section === "curve") next.curve.points = [[0, 0], [100, 100]];
      else Object.keys(next[section]).forEach((key) => { (next[section] as unknown as Record<string, number>)[key] = 0; });
    }
    return next;
  }, [disabledSections, effectiveRecipe]);
  const preview = usePhotoEditPreview({ sourceUrl: selected?.sourcePreviewUrl ?? null, recipe: previewRecipe, showSkinMask, dragging });
  const liveDelta = targetMeasurement && preview.measurementAfter ? skinDifference(preview.measurementAfter, targetMeasurement) : selected?.deltaAfter ?? null;
  const liveSignal = colorMatchSignal(liveDelta);

  const setScopeRecipe = useCallback((updater: (recipe: PhotoEditRecipe) => PhotoEditRecipe) => {
    if (!selected) return;
    if (scope === "common") {
      setCommonRecipe((current) => updater(clonePhotoEditRecipe(current)));
      setCommonDirty(true);
    } else {
      setRecipes((current) => ({ ...current, [selected.relativePath]: updater(clonePhotoEditRecipe(current[selected.relativePath] ?? selected.recipe)) }));
      setDirtyFiles((current) => new Set(current).add(selected.relativePath));
    }
  }, [scope, selected]);

  const changeValue = useCallback((section: Exclude<SectionKey, "curve">, key: SliderKey, value: number) => {
    setScopeRecipe((recipe) => {
      (recipe[section] as unknown as Record<string, number>)[key] = value;
      return recipe;
    });
  }, [setScopeRecipe]);

  useEffect(() => { setDisabledSections(new Set()); }, [scope, selectedIndex]);

  const toggleSection = useCallback((section: SectionKey) => {
    if (!selected) return;
    const disabling = !disabledSections.has(section);
    const backupKey = `${scope}:${scope === "common" ? "common" : selected.relativePath}:${section}`;
    if (disabling) {
      const activeRecipe = scope === "common" ? commonRecipe : selectedRecipe;
      sectionBackupsRef.current.set(backupKey, section === "curve"
        ? { points: activeRecipe.curve.points.map(([x, y]) => [x, y]) }
        : { ...activeRecipe[section] });
      setScopeRecipe((recipe) => {
        if (section === "curve") recipe.curve.points = [[0, 0], [100, 100]];
        else Object.assign(recipe[section], IDENTITY_PHOTO_EDIT_RECIPE[section]);
        return recipe;
      });
    } else {
      const backup = sectionBackupsRef.current.get(backupKey);
      if (backup) setScopeRecipe((recipe) => {
        if (section === "curve" && "points" in backup) recipe.curve.points = backup.points.map(([x, y]) => [x, y]);
        else if (section !== "curve") Object.assign(recipe[section], backup);
        return recipe;
      });
    }
    setDisabledSections((current) => {
      const next = new Set(current);
      if (disabling) next.add(section); else next.delete(section);
      return next;
    });
  }, [commonRecipe, disabledSections, scope, selected, selectedRecipe, setScopeRecipe]);

  const autoMatch = () => {
    if (!selected || !targetMeasurement) return;
    const automatic = deriveAutomaticRecipe(selected.measurementBefore, targetMeasurement, { brightness: true, skinTone: true });
    setRecipes((current) => ({ ...current, [selected.relativePath]: automatic }));
    setDirtyFiles((current) => new Set(current).add(selected.relativePath));
    setDisabledSections(new Set());
  };

  const resetToTarget = () => {
    if (!selected || !data) return;
    setTargetMeasurement(data.targetMeasurement);
    setRecipes((current) => ({ ...current, [selected.relativePath]: deriveAutomaticRecipe(selected.measurementBefore, data.targetMeasurement, data.options) }));
    setDirtyFiles((current) => new Set(current).add(selected.relativePath)); setTargetDirty(false);
    setDisabledSections(new Set());
  };

  const pickSkin = async (event: React.MouseEvent<HTMLImageElement>) => {
    if (!eyedropper || !selected?.sourcePreviewUrl || !targetMeasurement) return;
    if (!window.confirm("모든 사진의 기준 피부색이 바뀝니다. 계속할까요?")) { setEyedropper(false); return; }
    const bounds = event.currentTarget.getBoundingClientRect();
    const lab = await sampleImage(selected.sourcePreviewUrl, (event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
    const nextTarget = targetFromSample(targetMeasurement, lab);
    setTargetMeasurement(nextTarget);
    if (data) {
      setRecipes(Object.fromEntries(data.files.map((file) => [file.relativePath, deriveAutomaticRecipe(file.measurementBefore, nextTarget, data.options)])));
      setDirtyFiles(new Set(data.files.map((file) => file.relativePath)));
    }
    setTargetDirty(true); setEyedropper(false);
  };

  const save = async () => {
    if (!data || !dirty || saveJobId) return;
    setMessage("");
    try {
      const changes = [...dirtyFiles].map((relativePath) => ({ relativePath, recipe: recipes[relativePath] }));
      const response = await fetch(`/api/person-select/${eventId}/color-match`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputRelativePath: data.outputVirtualPath, changes, commonRecipe: commonDirty ? commonRecipe : undefined, targetMeasurement: targetDirty ? targetMeasurement : undefined }),
      });
      const body = await readApiResponse<{ job?: { id?: string } }>(response, "색 맞춤 저장");
      setSaveJobId(body.job?.id ?? "");
    } catch (error) { setMessage(error instanceof Error ? error.message : "색 맞춤 저장을 시작하지 못했습니다."); }
  };

  const openCopyDialog = () => {
    if (!selected || !data) return;
    setCopySections(new Set(Object.keys(SECTION_LABELS) as SectionKey[]));
    setCopyTargets(new Set(data.files.filter((file) => file.relativePath !== selected.relativePath).map((file) => file.relativePath)));
    setCopyOpen(true);
  };

  const applyCopy = () => {
    if (!selected || !data || !copySections.size || !copyTargets.size) return;
    setRecipes((current) => {
      const next = { ...current };
      for (const relativePath of copyTargets) {
        const file = data.files.find((entry) => entry.relativePath === relativePath);
        if (!file) continue;
        const target = clonePhotoEditRecipe(current[relativePath] ?? file.recipe);
        for (const section of copySections) {
          if (section === "curve") target.curve.points = selectedRecipe.curve.points.map(([x, y]) => [x, y]);
          else Object.assign(target[section], selectedRecipe[section]);
        }
        next[relativePath] = target;
      }
      return next;
    });
    setDirtyFiles((current) => new Set([...current, ...copyTargets]));
    setCopyOpen(false);
  };

  const leave = () => {
    if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 보정본 올리기로 돌아갈까요?")) return;
    router.back();
  };

  if (!data || !selected || !targetMeasurement) return <main className={styles.editor}><div className={styles.loading}>{message || "색 맞춤 편집기를 여는 중…"}</div></main>;
  const shownUrl = originalHeld ? selected.sourcePreviewUrl : preview.previewUrl || selected.resultPreviewUrl;
  const currentLab = preview.measurementAfter?.skin?.lab ?? selected.measurementAfter.skin?.lab;
  const folderLabel = data.outputVirtualPath.split("/").filter(Boolean).at(-1) || "색 맞춤 결과";
  return <main className={styles.editor}>
    <header className={styles.topbar}>
      <button type="button" onClick={leave}><ChevronLeft size={18} />보정본 올리기</button>
      <strong>색 맞춤 · 수동 편집</strong><span>{folderLabel}</span>
      <span>{data.files.length}장 중 {selectedIndex + 1}번째 · {selected.fileName}</span>
      <em>기준: {data.targetMode === "median" ? "전체 중앙값" : "기준 사진 1장"}</em>
    </header>
    <div className={styles.workspace}>
      <section className={styles.viewer}>
        <div className={styles.viewerToolbar}><div className={styles.viewSegment}>{([["single", "한 장"], ["split", "전후 나란히"], ["all", "전원 나란히"]] as const).map(([key, label]) => <button key={key} className={viewMode === key ? styles.active : ""} onClick={() => setViewMode(key)}>{label}</button>)}</div><button className={showSkinMask ? styles.maskActive : ""} onClick={() => setShowSkinMask((value) => !value)}><Eye size={14} />피부 범위 보기 {showSkinMask ? "켬" : "끔"}</button></div>
        <div className={styles.canvas} data-eyedropper={eyedropper || undefined}>
          {viewMode === "all" ? <div className={styles.allGrid}>{data.files.map((file, index) => <button key={file.relativePath} className={index === selectedIndex ? styles.selectedAll : ""} onClick={() => setSelectedIndex(index)}><img src={file.resultPreviewUrl || file.sourcePreviewUrl || ""} alt={file.fileName} /><span>{file.fileName}</span></button>)}</div> : viewMode === "split" ? <div className={styles.splitView}><figure><img src={selected.sourcePreviewUrl || ""} alt={`${selected.fileName} 원본`} /><figcaption>원본</figcaption></figure><figure><img src={shownUrl || ""} alt={`${selected.fileName} 편집`} onClick={(event) => void pickSkin(event)} /><figcaption>편집</figcaption></figure></div> : <img className={styles.mainImage} src={shownUrl || ""} alt={selected.fileName} onClick={(event) => void pickSkin(event)} />}
          {preview.busy ? <span className={styles.previewBusy}>미리보기 계산 중…</span> : null}
        </div>
        <div className={styles.filmstrip}>{data.files.map((file, index) => <button key={file.relativePath} className={index === selectedIndex ? styles.selectedFilm : ""} onClick={() => setSelectedIndex(index)}><img src={file.resultPreviewUrl || file.sourcePreviewUrl || ""} alt={file.fileName} /><i className={trafficClass(index === selectedIndex ? liveSignal : file.signalAfter)} /><span>{file.fileName}</span></button>)}</div>
      </section>
      <aside className={styles.controls}>
        <div className={styles.histogram}><ColorHistogram sourceUrl={shownUrl} /></div>
        <div className={styles.exif}><span>ISO {selected.exif.iso ?? "—"}</span><span>{selected.exif.lens ?? "렌즈 —"}</span><span>f/{selected.exif.aperture ?? "—"}</span><span>{selected.exif.shutter ?? "셔터 —"}</span></div>
        <div className={styles.editTitle}><h2>편집</h2><button onClick={autoMatch}><Sparkles size={14} />자동 맞춤</button><button onPointerDown={() => setOriginalHeld(true)} onPointerUp={() => setOriginalHeld(false)} onPointerCancel={() => setOriginalHeld(false)} onPointerLeave={() => setOriginalHeld(false)}>원본</button></div>
        <div className={styles.scopeTabs}><button className={scope === "photo" ? styles.active : ""} onClick={() => setScope("photo")}>이 사진</button><button className={scope === "common" ? styles.active : ""} onClick={() => setScope("common")}>전체 공통</button></div>
        <div className={styles.sections}>{(Object.keys(SECTION_LABELS) as SectionKey[]).map((section) => {
          const open = openSections.has(section); const enabled = !disabledSections.has(section);
          return <section key={section} className={styles.editSection}>
            <header><button onClick={() => setOpenSections((current) => { const next = new Set(current); if (next.has(section)) next.delete(section); else next.add(section); return next; })}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<strong>{SECTION_LABELS[section]}</strong>{section === "skin" && selected.recipe.skin ? <small>자동 맞춤 적용됨</small> : null}</button><button aria-label={`${SECTION_LABELS[section]} ${enabled ? "끄기" : "켜기"}`} onClick={() => toggleSection(section)}>{enabled ? <Eye size={14} /> : <EyeOff size={14} />}</button></header>
            {open ? <div className={styles.sectionBody}>
              {section === "skin" ? <><div className={styles.deltaBox}><span>기준과 차이 {selected.deltaBefore?.toFixed(1) ?? "—"} <b className={trafficClass(selected.signalBefore)}>● {SIGNAL_LABEL[selected.signalBefore]}</b></span><ChevronRight size={14} /><span>지금 {liveDelta?.toFixed(1) ?? "—"} <b className={trafficClass(liveSignal)}>● {SIGNAL_LABEL[liveSignal]}</b></span></div><div className={styles.swatches}><span><i style={{ background: rgbCss(currentLab) }} />현재 피부색</span><span><i style={{ background: rgbCss(targetMeasurement.skin?.lab) }} />기준 피부색</span></div></> : null}
              {section === "curve" ? <div className={styles.curveControl}><svg viewBox="0 0 100 100"><path className={styles.curveGrid} d="M25 0V100M50 0V100M75 0V100M0 25H100M0 50H100M0 75H100" /><path d="M0 100 L50 50 L100 0" /><circle cx="50" cy={100 - ((scope === "photo" ? selectedRecipe : commonRecipe).curve.points.find(([x]) => x === 50)?.[1] ?? 50)} r="3" /></svg><EditorSlider label="중간점" value={(scope === "photo" ? selectedRecipe : commonRecipe).curve.points.find(([x]) => x === 50)?.[1] ?? 50} min={0} max={100} onDrag={setDragging} onChange={(value) => setScopeRecipe((recipe) => { recipe.curve.points = [[0, 0], [50, value], [100, 100]]; return recipe; })} /></div> : SLIDERS[section].map((item) => {
                const recipe = scope === "photo" ? selectedRecipe : commonRecipe;
                const value = (recipe[section] as unknown as Record<string, number>)[item.key] ?? 0;
                return <EditorSlider key={`${section}-${item.key}`} label={item.label} min={item.min} max={item.max} step={item.step} value={value} track={section === "color" ? item.key as "temperature" | "tint" : undefined} onDrag={setDragging} onChange={(next) => changeValue(section, item.key, next)} />;
              })}
              {section === "skin" ? <div className={styles.skinActions}><button onClick={() => setEyedropper(true)} className={eyedropper ? styles.active : ""}><Pipette size={14} />스포이드로 피부 찍기</button><button onClick={resetToTarget}><RotateCcw size={14} />기준값으로 되돌리기</button></div> : null}
            </div> : null}
          </section>;
        })}</div>
        {message || preview.error ? <p className={styles.message}>{message || preview.error}</p> : null}
        <footer><button className={styles.copyButton} onClick={openCopyDialog}><Copy size={15} />다른 사진에 복사</button><button className={styles.saveButton} disabled={!dirty || Boolean(saveJobId)} onClick={() => void save()}><Save size={15} />{saveJobId ? "저장 중" : "저장"}</button></footer>
      </aside>
    </div>
    {copyOpen ? <div className={styles.copyBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCopyOpen(false); }}>
      <section className={styles.copyDialog} role="dialog" aria-modal="true" aria-labelledby="copy-dialog-title">
        <header><div><strong id="copy-dialog-title">다른 사진에 편집값 복사</strong><span>{selected.fileName}의 값을 복사합니다.</span></div><button type="button" aria-label="닫기" onClick={() => setCopyOpen(false)}><X size={17} /></button></header>
        <fieldset><legend>복사할 항목</legend><div className={styles.copyChoices}>{(Object.keys(SECTION_LABELS) as SectionKey[]).map((section) => <label key={section}><input type="checkbox" checked={copySections.has(section)} onChange={() => setCopySections((current) => { const next = new Set(current); if (next.has(section)) next.delete(section); else next.add(section); return next; })} />{SECTION_LABELS[section]}</label>)}</div></fieldset>
        <fieldset><legend>대상 사진 <button type="button" onClick={() => setCopyTargets((current) => current.size ? new Set() : new Set(data.files.filter((file) => file.relativePath !== selected.relativePath).map((file) => file.relativePath)))}>{copyTargets.size ? "전체 해제" : "전체 선택"}</button></legend><div className={styles.copyPhotoList}>{data.files.filter((file) => file.relativePath !== selected.relativePath).map((file) => <label key={file.relativePath}><input type="checkbox" checked={copyTargets.has(file.relativePath)} onChange={() => setCopyTargets((current) => { const next = new Set(current); if (next.has(file.relativePath)) next.delete(file.relativePath); else next.add(file.relativePath); return next; })} /><img src={file.resultPreviewUrl || file.sourcePreviewUrl || ""} alt="" /><span>{file.fileName}</span></label>)}</div></fieldset>
        <footer><button type="button" onClick={() => setCopyOpen(false)}>취소</button><button type="button" disabled={!copySections.size || !copyTargets.size} onClick={applyCopy}>선택한 사진에 복사</button></footer>
      </section>
    </div> : null}
  </main>;
}
