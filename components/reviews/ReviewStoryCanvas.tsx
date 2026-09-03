"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import type { ReviewStoryDocument, ReviewStoryElement, ReviewStoryImageElement } from "@/lib/reviewContent/storyDocument";
import styles from "./ReviewStoryCanvas.module.css";

type Props = {
  document: ReviewStoryDocument;
  selectedElementId: string | null;
  assetUrls: Record<string, string>;
  zoom: number;
  lockAspectRatio?: boolean;
  onSelect: (id: string | null) => void;
  onChange: (document: ReviewStoryDocument, historyBase?: ReviewStoryDocument) => void;
};

const clone = (value: ReviewStoryDocument) => JSON.parse(JSON.stringify(value)) as ReviewStoryDocument;

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

// 캔버스가 화면 대부분을 차지하던 원인 — 예전엔 zoom%를 스테이지 폭에 대한 CSS width:%로 직접
// 적용해서, 가운데 컬럼이 넓어지면(1fr) 캔버스도 그만큼 무한정 커졌다. 이제는 스테이지의 실제
// 픽셀 크기를 재서 "맞춤" 스케일을 직접 계산하고, zoom은 그 fit 스케일에 곱하는 배율(100%=맞춤)
// 로만 쓴다 — 컬럼 폭과 무관하게 캔버스가 항상 적당히 작게 유지된다.
const STAGE_PADDING = 64; // .stage의 좌우/상하 padding(32px×2) — 실제 사용 가능 영역 계산용
const MAX_FIT_SCALE = 0.46;

export default function ReviewStoryCanvas({ document, selectedElementId, assetUrls, zoom, lockAspectRatio, onSelect, onChange }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 480, height: 600 });
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const beginPointerAction = (event: React.PointerEvent, element: ReviewStoryElement, action: "move" | "resize") => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(element.id);
    if (element.locked) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const base = clone(document);
    let latest = base;
    const origin = { ...element };
    const move = (pointerEvent: PointerEvent) => {
      const dx = (pointerEvent.clientX - startX) / scale;
      const dy = (pointerEvent.clientY - startY) / scale;
      const next = clone(base);
      next.elements = next.elements.map((item) => {
        if (item.id !== element.id) return item;
        if (action === "move") return { ...item, x: Math.round(Math.max(-item.width + 24, Math.min(document.width - 24, origin.x + dx))), y: Math.round(Math.max(-item.height + 24, Math.min(document.height - 24, origin.y + dy))) };
        const ratio = origin.width / Math.max(1, origin.height);
        const nextWidth = Math.max(40, origin.width + dx);
        const shouldLockRatio = lockAspectRatio || (element.type === "image" && pointerEvent.shiftKey);
        const nextHeight = shouldLockRatio ? nextWidth / ratio : Math.max(32, origin.height + dy);
        return { ...item, width: Math.round(nextWidth), height: Math.round(nextHeight) };
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

  return (
    <div ref={stageRef} className={styles.stage} onPointerDown={() => onSelect(null)}>
      <div
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
          return (
            <div
              key={element.id}
              role="button"
              tabIndex={0}
              className={`${styles.element} ${selected ? styles.selected : ""} ${element.locked ? styles.locked : ""}`}
              style={commonStyle}
              aria-label={`${element.name} 선택`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(element.id);
                }
              }}
              onPointerDown={(event) => beginPointerAction(event, element, "move")}
              onDoubleClick={(event) => {
                event.stopPropagation();
                if (element.type === "text" && !element.locked) setEditingId(element.id);
              }}
            >
              {element.type === "shape" ? <span style={{ display: "block", width: "100%", height: "100%", borderRadius: element.radius * scale, background: element.fill }} /> : null}
              {element.type === "image" ? (
                <span className={styles.imageFrame} style={element.edgeBlend?.type === "gradient" ? maskStyle(element) : undefined}>
                  {sourceFor(element, assetUrls) ? (
                    <>
                      <img className={styles.image} src={sourceFor(element, assetUrls)} alt="" draggable={false} style={{ objectPosition: `${element.cropX}% ${element.cropY}%`, transform: `scale(${element.scale})` }} />
                      {element.edgeBlend?.enabled && element.edgeBlend.type === "blur" ? <img className={styles.blurOverlay} src={sourceFor(element, assetUrls)} alt="" draggable={false} style={{ objectPosition: `${element.cropX}% ${element.cropY}%`, transform: `scale(${element.scale})`, filter: `blur(${Math.max(2, element.edgeBlend.strength / 5) * scale}px)`, ...maskStyle(element, true) }} /> : null}
                    </>
                  ) : <span className={styles.placeholder}><ImageIcon size={42 * scale} /> 사진을 추가하세요</span>}
                </span>
              ) : null}
              {element.type === "text" ? (
                <span className={styles.text} style={{ display: "block", width: "100%", height: "100%", fontFamily: element.fontFamily, fontSize: element.fontSize * scale, fontWeight: element.fontWeight, color: element.color, textAlign: element.textAlign, lineHeight: element.lineHeight, letterSpacing: element.letterSpacing * scale }}>
                  {element.text}
                  {editingId === element.id ? (
                    <textarea
                      autoFocus
                      className={styles.inlineEditor}
                      value={element.text}
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        const next = clone(document);
                        next.elements = next.elements.map((item) => item.id === element.id && item.type === "text" ? { ...item, text: event.target.value } : item);
                        onChange(next);
                      }}
                      onBlur={() => setEditingId(null)}
                    />
                  ) : null}
                </span>
              ) : null}
              {selected && !element.locked ? <span className={styles.resizeHandle} onPointerDown={(event) => beginPointerAction(event, element, "resize")} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
