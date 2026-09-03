"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Crop, ImagePlus, Image as ImageIcon, Lock, MoveDown, MoveUp } from "lucide-react";
import type { ReviewStoryDocument, ReviewStoryElement, ReviewStoryImageElement, ReviewStoryTextElement } from "@/lib/reviewContent/storyDocument";
import { computeSnap, type Rect, type SmartGuide } from "@/lib/reviewContent/smartGuides";
import styles from "./ReviewStoryCanvas.module.css";

type Props = {
  document: ReviewStoryDocument;
  selectedElementId: string | null;
  assetUrls: Record<string, string>;
  zoom: number;
  lockAspectRatio?: boolean;
  onSelect: (id: string | null) => void;
  onChange: (document: ReviewStoryDocument, historyBase?: ReviewStoryDocument) => void;
  onReplaceImage?: () => void;
};

type ResizeHandle = "nw" | "ne" | "sw" | "se" | "w" | "e";

const clone = (value: ReviewStoryDocument) => JSON.parse(JSON.stringify(value)) as ReviewStoryDocument;
const rectOf = (element: ReviewStoryElement): Rect => ({ x: element.x, y: element.y, width: element.width, height: element.height });
const SNAP_THRESHOLD = 7; // logical px — 레퍼런스 스펙(6~8px) 기준

function maskStyle(element: ReviewStoryImageElement, inverted = false): React.CSSProperties {
  if (!element.edgeBlend?.enabled || !element.edgeBlend.directions.length) return {};
  const percent = Math.max(4, Math.min(48, (element.edgeBlend.size / Math.max(element.width, element.height)) * 100));
  const alpha = Math.max(0, Math.min(0.95, element.edgeBlend.strength / 100));
  const gradients = element.edgeBlend.directions.map((direction) => {
    const transparent = `rgba(0,0,0,${inverted ? 1 : 1 - alpha})`;
    const solid = `rgba(0,0,0,${inverted ? 0 : 1})`;
    if (direction === "top") return `linear-gradient(to bottom, ${transparent} 0%, ${solid} ${percent}%)`;
    if (direction === "bottom") return `linear-gradient(to top, ${transparent} 0%, ${solid} ${percent}%)`;
    if (direction === "left") return `linear-gradient(to right, ${transparent} 0%, ${solid} ${percent}%)`;
    return `linear-gradient(to left, ${transparent} 0%, ${solid} ${percent}%)`;
  });
  return {
    WebkitMaskImage: gradients.join(","),
    WebkitMaskComposite: "source-in",
    maskImage: gradients.join(","),
    maskComposite: "intersect",
  };
}

function sourceFor(element: ReviewStoryImageElement, assetUrls: Record<string, string>) {
  return element.storagePath ? assetUrls[element.storagePath] || element.src : element.src;
}

function resizeRect(origin: ReviewStoryElement, handle: ResizeHandle, dx: number, dy: number, lockRatio: boolean): Rect {
  const ratio = origin.width / Math.max(1, origin.height);
  let { x, y, width, height } = origin;
  if (handle === "se") { width = origin.width + dx; height = origin.height + dy; }
  else if (handle === "nw") { x = origin.x + dx; y = origin.y + dy; width = origin.width - dx; height = origin.height - dy; }
  else if (handle === "ne") { y = origin.y + dy; width = origin.width + dx; height = origin.height - dy; }
  else if (handle === "sw") { x = origin.x + dx; width = origin.width - dx; height = origin.height + dy; }
  else if (handle === "w") { x = origin.x + dx; width = origin.width - dx; }
  else { width = origin.width + dx; }
  width = Math.max(40, width);
  height = Math.max(32, height);
  if (lockRatio && handle !== "w" && handle !== "e") {
    height = width / ratio;
    if (handle === "nw" || handle === "ne") y = origin.y + origin.height - height;
    if (handle === "nw" || handle === "sw") x = origin.x + origin.width - width;
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

// 캔버스가 화면 대부분을 차지하던 원인 — 예전엔 zoom%를 스테이지 폭에 대한 CSS width:%로 직접
// 적용해서, 가운데 컬럼이 넓어지면(1fr) 캔버스도 그만큼 무한정 커졌다. 이제는 스테이지의 실제
// 픽셀 크기를 재서 "맞춤" 스케일을 직접 계산하고, zoom은 그 fit 스케일에 곱하는 배율(100%=맞춤)
// 로만 쓴다 — 컬럼 폭과 무관하게 캔버스가 항상 적당히 작게 유지된다.
const STAGE_PADDING = 64; // .stage의 좌우/상하 padding(32px×2) — 실제 사용 가능 영역 계산용
const MAX_FIT_SCALE = 0.46;

export default function ReviewStoryCanvas({ document, selectedElementId, assetUrls, zoom, lockAspectRatio, onSelect, onChange, onReplaceImage }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 480, height: 600 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cropModeId, setCropModeId] = useState<string | null>(null);
  const [activeGuides, setActiveGuides] = useState<SmartGuide[]>([]);
  const [rotationTooltip, setRotationTooltip] = useState<number | null>(null);
  const [resizeTooltip, setResizeTooltip] = useState<{ width: number; height: number } | null>(null);
  const [textBoxById, setTextBoxById] = useState<Record<string, { width: number; height: number }>>({});
  const textEditBase = useRef<ReviewStoryDocument | null>(null);
  const textRefs = useRef<Map<string, HTMLSpanElement>>(new Map());

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const update = () => setStageSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fitScale = Math.min(
    Math.max(0, stageSize.width - STAGE_PADDING) / document.width,
    Math.max(0, stageSize.height - STAGE_PADDING) / document.height,
    MAX_FIT_SCALE,
  ) || 0.3;
  const scale = fitScale * (Math.max(50, Math.min(160, zoom)) / 100);

  const sorted = useMemo(() => [...document.elements].sort((a, b) => a.zIndex - b.zIndex), [document.elements]);

  // 텍스트 선택 박스가 저장된 template height(예: 후기 본문 300~500px)만큼 커 보이던 문제 —
  // 실제 렌더된 글자 영역만 측정해서 선택 테두리는 그 크기로, 드래그/리사이즈 판정은 저장된
  // geometry 그대로 사용한다(문서에는 저장 안 함, 화면 표시 전용).
  useEffect(() => {
    const next: Record<string, { width: number; height: number }> = {};
    let changed = false;
    textRefs.current.forEach((node, id) => {
      const rect = { width: node.scrollWidth / scale, height: node.scrollHeight / scale };
      next[id] = rect;
      const prev = textBoxById[id];
      if (!prev || Math.abs(prev.width - rect.width) > 0.5 || Math.abs(prev.height - rect.height) > 0.5) changed = true;
    });
    if (changed || Object.keys(next).length !== Object.keys(textBoxById).length) setTextBoxById(next);
  }, [document.elements, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  const otherRectsFor = (elementId: string): Rect[] =>
    document.elements.filter((item) => item.id !== elementId && !item.hidden).map(rectOf);

  const beginPointerAction = (event: React.PointerEvent, element: ReviewStoryElement, action: "move" | ResizeHandle) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(element.id);
    if (element.locked || cropModeId) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const base = clone(document);
    let latest = base;
    const origin = { ...element };
    const others = otherRectsFor(element.id);
    const move = (pointerEvent: PointerEvent) => {
      const dx = (pointerEvent.clientX - startX) / scale;
      const dy = (pointerEvent.clientY - startY) / scale;
      const next = clone(base);
      next.elements = next.elements.map((item) => {
        if (item.id !== element.id) return item;
        if (action === "move") {
          const rawX = Math.max(-item.width + 24, Math.min(document.width - 24, origin.x + dx));
          const rawY = Math.max(-item.height + 24, Math.min(document.height - 24, origin.y + dy));
          const snap = computeSnap({ x: rawX, y: rawY, width: item.width, height: item.height }, { width: document.width, height: document.height }, others, SNAP_THRESHOLD / scale);
          setActiveGuides(snap.guides);
          setResizeTooltip(null);
          return { ...item, x: Math.round(snap.x), y: Math.round(snap.y) };
        }
        const shouldLockRatio = lockAspectRatio || (element.type === "image" && pointerEvent.shiftKey);
        const resized = resizeRect(origin, action, dx, dy, shouldLockRatio);
        const snap = computeSnap(resized, { width: document.width, height: document.height }, others, SNAP_THRESHOLD / scale);
        // 리사이즈 중엔 스냅을 크기 보정에는 안 쓰고(리사이즈 방향이 꼬일 수 있어) 가이드 표시만 재사용한다.
        setActiveGuides(snap.guides.filter((g) => !g.label));
        setResizeTooltip({ width: resized.width, height: resized.height });
        return { ...item, x: resized.x, y: resized.y, width: resized.width, height: resized.height };
      });
      latest = next;
      onChange(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setActiveGuides([]);
      setResizeTooltip(null);
      onChange(clone(latest), base);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const beginRotate = (event: React.PointerEvent, element: ReviewStoryElement) => {
    event.preventDefault();
    event.stopPropagation();
    if (element.locked) return;
    const canvasBox = canvasBoxRef.current?.getBoundingClientRect();
    if (!canvasBox) return;
    const centerScreen = {
      x: canvasBox.left + (element.x + element.width / 2) * scale,
      y: canvasBox.top + (element.y + element.height / 2) * scale,
    };
    const base = clone(document);
    let latest = base;
    const move = (pointerEvent: PointerEvent) => {
      let angle = Math.atan2(pointerEvent.clientX - centerScreen.x, -(pointerEvent.clientY - centerScreen.y)) * (180 / Math.PI);
      angle = ((angle % 360) + 360) % 360;
      if (pointerEvent.shiftKey) {
        angle = Math.round(angle / 15) * 15;
      } else {
        for (const snapAngle of [0, 90, 180, 270, 360]) {
          if (Math.abs(angle - snapAngle) <= 3) { angle = snapAngle % 360; break; }
        }
      }
      const next = clone(base);
      next.elements = next.elements.map((item) => item.id === element.id ? { ...item, rotation: Math.round(angle) } : item);
      latest = next;
      setRotationTooltip(Math.round(angle));
      onChange(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setRotationTooltip(null);
      onChange(clone(latest), base);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const beginCropDrag = (event: React.PointerEvent, element: ReviewStoryImageElement) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const originCropX = element.cropX;
    const originCropY = element.cropY;
    const base = clone(document);
    let latest = base;
    const move = (pointerEvent: PointerEvent) => {
      const dx = pointerEvent.clientX - startX;
      const dy = pointerEvent.clientY - startY;
      const framePx = Math.max(1, element.width * scale);
      const frameHeightPx = Math.max(1, element.height * scale);
      const next = clone(base);
      next.elements = next.elements.map((item) => {
        if (item.id !== element.id || item.type !== "image") return item;
        return {
          ...item,
          cropX: Math.max(0, Math.min(100, originCropX - (dx / framePx) * 100)),
          cropY: Math.max(0, Math.min(100, originCropY - (dy / frameHeightPx) * 100)),
        };
      });
      latest = next;
      onChange(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onChange(clone(latest), base);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const adjustCropZoom = (element: ReviewStoryImageElement, delta: number) => {
    const before = clone(document);
    const next = clone(document);
    next.elements = next.elements.map((item) => item.id === element.id && item.type === "image" ? { ...item, scale: Math.max(1, Math.min(3, item.scale + delta)) } : item);
    onChange(next, before);
  };

  const commitPatch = (elementId: string, patch: Partial<ReviewStoryElement>) => {
    const before = clone(document);
    const next = clone(document);
    next.elements = next.elements.map((item) => item.id === elementId ? ({ ...item, ...patch } as ReviewStoryElement) : item);
    onChange(next, before);
  };

  const bringToFront = (element: ReviewStoryElement) => {
    const maxZ = Math.max(0, ...document.elements.map((item) => item.zIndex));
    commitPatch(element.id, { zIndex: maxZ + 1 });
  };
  const sendToBack = (element: ReviewStoryElement) => {
    const minZ = Math.min(0, ...document.elements.map((item) => item.zIndex));
    commitPatch(element.id, { zIndex: minZ - 1 });
  };

  const beginTextEdit = (element: ReviewStoryTextElement) => {
    textEditBase.current = clone(document);
    setEditingId(element.id);
  };
  const commitTextEdit = () => {
    if (textEditBase.current) onChange(clone(document), textEditBase.current);
    textEditBase.current = null;
    setEditingId(null);
  };
  const cancelTextEdit = (elementId: string) => {
    if (textEditBase.current) onChange(clone(textEditBase.current));
    textEditBase.current = null;
    setEditingId(null);
    void elementId;
  };

  const selectedElement = document.elements.find((item) => item.id === selectedElementId) || null;
  const inverse = 1 / scale;

  return (
    <div ref={stageRef} className={styles.stage} onPointerDown={() => { onSelect(null); setCropModeId(null); }}>
      <div
        ref={canvasBoxRef}
        className={styles.canvas}
        style={{ background: document.background, width: `${Math.round(document.width * scale)}px`, "--story-scale": scale } as React.CSSProperties}
        role="application"
        aria-label="리뷰 스토리 편집 캔버스"
      >
        {sorted.map((element) => {
          if (element.hidden) return null;
          const selected = selectedElementId === element.id;
          const commonStyle: React.CSSProperties = {
            left: `${(element.x / document.width) * 100}%`,
            top: `${(element.y / document.height) * 100}%`,
            width: `${(element.width / document.width) * 100}%`,
            height: `${(element.height / document.height) * 100}%`,
            opacity: element.opacity,
            zIndex: element.zIndex,
            transform: `rotate(${element.rotation}deg)`,
          };
          const isCropping = cropModeId === element.id && element.type === "image";
          // 텍스트는 실제 렌더된 글자 영역(측정값)에 맞춰 선택 테두리를 그린다 — 저장된 template
          // height가 넉넉해도 선택 박스가 그만큼 커 보이지 않게.
          const textBox = element.type === "text" ? textBoxById[element.id] : null;
          const selectionStyle: React.CSSProperties | null = selected && element.type === "text" && textBox
            ? { position: "absolute", left: 0, top: 0, width: `${(textBox.width / element.width) * 100}%`, height: `${(textBox.height / element.height) * 100}%` }
            : null;
          return (
            <div
              key={element.id}
              role="button"
              tabIndex={0}
              className={`${styles.element} ${element.locked ? styles.locked : ""}`}
              style={commonStyle}
              aria-label={`${element.name} 선택`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(element.id);
                }
              }}
              onPointerDown={(event) => isCropping ? undefined : beginPointerAction(event, element, "move")}
              onDoubleClick={(event) => {
                event.stopPropagation();
                if (element.locked) return;
                if (element.type === "text") beginTextEdit(element);
                if (element.type === "image") setCropModeId(element.id);
              }}
            >
              {element.type === "shape" ? <span style={{ display: "block", width: "100%", height: "100%", borderRadius: element.radius * scale, background: element.fill }} /> : null}
              {element.type === "image" ? (
                <span
                  className={styles.imageFrame}
                  style={element.edgeBlend?.type === "gradient" ? maskStyle(element) : undefined}
                  onPointerDown={(event) => isCropping ? beginCropDrag(event, element) : undefined}
                  onWheel={(event) => { if (isCropping) { event.preventDefault(); adjustCropZoom(element, event.deltaY < 0 ? 0.05 : -0.05); } }}
                >
                  {sourceFor(element, assetUrls) ? (
                    <>
                      <img className={styles.image} src={sourceFor(element, assetUrls)} alt="" draggable={false} style={{ objectPosition: `${element.cropX}% ${element.cropY}%`, transform: `scale(${element.scale})`, cursor: isCropping ? "move" : undefined }} />
                      {element.edgeBlend?.enabled && element.edgeBlend.type === "blur" ? <img className={styles.blurOverlay} src={sourceFor(element, assetUrls)} alt="" draggable={false} style={{ objectPosition: `${element.cropX}% ${element.cropY}%`, transform: `scale(${element.scale})`, filter: `blur(${Math.max(2, element.edgeBlend.strength / 5) * scale}px)`, ...maskStyle(element, true) }} /> : null}
                    </>
                  ) : <span className={styles.placeholder}><ImageIcon size={42 * scale} /> 사진을 추가하세요</span>}
                </span>
              ) : null}
              {element.type === "text" ? (
                <span
                  ref={(node) => { if (node) textRefs.current.set(element.id, node); else textRefs.current.delete(element.id); }}
                  className={styles.text}
                  style={{ display: "block", width: "100%", height: "100%", fontFamily: element.fontFamily, fontSize: element.fontSize * scale, fontWeight: element.fontWeight, color: element.color, textAlign: element.textAlign, lineHeight: element.lineHeight, letterSpacing: element.letterSpacing * scale, visibility: editingId === element.id ? "hidden" : "visible" }}
                >
                  {element.text}
                </span>
              ) : null}
              {element.type === "text" && editingId === element.id ? (
                <textarea
                  autoFocus
                  className={styles.inlineEditor}
                  value={element.text}
                  style={{ fontFamily: element.fontFamily, fontSize: element.fontSize * scale, fontWeight: element.fontWeight, color: element.color, textAlign: element.textAlign, lineHeight: element.lineHeight, letterSpacing: element.letterSpacing * scale }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const next = clone(document);
                    next.elements = next.elements.map((item) => item.id === element.id && item.type === "text" ? { ...item, text: event.target.value } : item);
                    onChange(next);
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") { event.preventDefault(); cancelTextEdit(element.id); }
                    else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); commitTextEdit(); }
                  }}
                  onBlur={commitTextEdit}
                />
              ) : null}

              {isCropping ? (
                <div className={styles.cropToolbar} onPointerDown={(event) => event.stopPropagation()}>
                  <button type="button" className={styles.cropButton} onClick={() => adjustCropZoom(element as ReviewStoryImageElement, -0.05)}>-</button>
                  <span>확대/이동</span>
                  <button type="button" className={styles.cropButton} onClick={() => adjustCropZoom(element as ReviewStoryImageElement, 0.05)}>+</button>
                  <button type="button" className={`${styles.cropButton} ${styles.cropDone}`} onClick={() => setCropModeId(null)}>완료</button>
                </div>
              ) : null}

              {selected && !element.locked && !isCropping ? (
                <>
                  <span className={styles.selectionBorder} style={selectionStyle ?? undefined} />
                  {element.type === "image" || element.type === "shape" ? (
                    <>
                      <span className={`${styles.handle} ${styles.handleNw}`} onPointerDown={(event) => beginPointerAction(event, element, "nw")} />
                      <span className={`${styles.handle} ${styles.handleNe}`} onPointerDown={(event) => beginPointerAction(event, element, "ne")} />
                      <span className={`${styles.handle} ${styles.handleSw}`} onPointerDown={(event) => beginPointerAction(event, element, "sw")} />
                      <span className={`${styles.handle} ${styles.handleSe}`} onPointerDown={(event) => beginPointerAction(event, element, "se")} />
                    </>
                  ) : (
                    <>
                      <span className={`${styles.handle} ${styles.handleW}`} onPointerDown={(event) => beginPointerAction(event, element, "w")} />
                      <span className={`${styles.handle} ${styles.handleE}`} onPointerDown={(event) => beginPointerAction(event, element, "e")} />
                      <span className={`${styles.handle} ${styles.handleSe}`} onPointerDown={(event) => beginPointerAction(event, element, "se")} />
                    </>
                  )}
                  <span className={styles.rotateHandle} onPointerDown={(event) => beginRotate(event, element)} />
                  {rotationTooltip !== null ? <span className={styles.angleTooltip}>{rotationTooltip}°</span> : null}
                  {resizeTooltip ? <span className={styles.sizeTooltip}>{resizeTooltip.width} × {resizeTooltip.height}</span> : null}

                  <div className={styles.floatingToolbar} onPointerDown={(event) => event.stopPropagation()}>
                    {element.type === "text" ? (
                      <>
                        <button type="button" className={`${styles.toolbarBtn} ${element.textAlign === "left" ? styles.toolbarBtnActive : ""}`} aria-label="왼쪽 정렬" onClick={() => commitPatch(element.id, { textAlign: "left" })}><AlignLeft size={13} /></button>
                        <button type="button" className={`${styles.toolbarBtn} ${element.textAlign === "center" ? styles.toolbarBtnActive : ""}`} aria-label="가운데 정렬" onClick={() => commitPatch(element.id, { textAlign: "center" })}><AlignCenter size={13} /></button>
                        <button type="button" className={`${styles.toolbarBtn} ${element.textAlign === "right" ? styles.toolbarBtnActive : ""}`} aria-label="오른쪽 정렬" onClick={() => commitPatch(element.id, { textAlign: "right" })}><AlignRight size={13} /></button>
                        <span className={styles.toolbarDivider} />
                        <button type="button" className={`${styles.toolbarBtn} ${element.fontWeight >= 700 ? styles.toolbarBtnActive : ""}`} aria-label="굵게" onClick={() => commitPatch(element.id, { fontWeight: element.fontWeight >= 700 ? 400 : 700 })}><Bold size={13} /></button>
                      </>
                    ) : element.type === "image" ? (
                      <>
                        <button type="button" className={styles.toolbarBtn} aria-label="사진 교체" onClick={() => onReplaceImage?.()}><ImagePlus size={13} /></button>
                        <button type="button" className={styles.toolbarBtn} aria-label="자르기" onClick={() => setCropModeId(element.id)}><Crop size={13} /></button>
                        <span className={styles.toolbarDivider} />
                        <button type="button" className={styles.toolbarBtn} aria-label="맨 앞으로" onClick={() => bringToFront(element)}><MoveUp size={13} /></button>
                        <button type="button" className={styles.toolbarBtn} aria-label="맨 뒤로" onClick={() => sendToBack(element)}><MoveDown size={13} /></button>
                      </>
                    ) : null}
                  </div>
                </>
              ) : null}
              {selected && element.locked ? <span className={styles.lockBadge}><Lock size={11} /></span> : null}
            </div>
          );
        })}

        {activeGuides.map((guide, index) => guide.type === "vertical" ? (
          <span
            key={index}
            className={styles.guideVertical}
            style={{ left: `${(guide.position / document.width) * 100}%`, top: `${((guide.start ?? 0) / document.height) * 100}%`, height: `${(((guide.end ?? document.height) - (guide.start ?? 0)) / document.height) * 100}%` }}
          >
            {guide.label ? <span className={styles.guideLabel} style={{ transform: `translate(-50%, -50%) scale(${inverse})` }}>{guide.label}</span> : null}
          </span>
        ) : (
          <span
            key={index}
            className={styles.guideHorizontal}
            style={{ top: `${(guide.position / document.height) * 100}%`, left: `${((guide.start ?? 0) / document.width) * 100}%`, width: `${(((guide.end ?? document.width) - (guide.start ?? 0)) / document.width) * 100}%` }}
          >
            {guide.label ? <span className={styles.guideLabel} style={{ transform: `translate(-50%, -50%) scale(${inverse})` }}>{guide.label}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}
