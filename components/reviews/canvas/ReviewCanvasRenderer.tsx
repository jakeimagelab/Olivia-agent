import { Image as ImageIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { reviewCanvasElementStyle, reviewCanvasImageStyle, reviewCanvasTextStyle } from "@/lib/reviewContent/canvasLayout";
import type { ReviewStoryDocument, ReviewStoryElement, ReviewStoryImageElement, ReviewStoryTextElement } from "@/lib/reviewContent/storyDocument";
import styles from "./ReviewCanvasRenderer.module.css";

type ElementProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "className" | "style">;
type ImageFrameProps = Omit<HTMLAttributes<HTMLSpanElement>, "children" | "className" | "style">;

type Props = {
  document: ReviewStoryDocument;
  assetUrls?: Record<string, string>;
  rootRef?: Ref<HTMLDivElement>;
  className?: string;
  elementClassName?: (element: ReviewStoryElement) => string | undefined;
  elementProps?: (element: ReviewStoryElement) => ElementProps;
  imageFrameProps?: (element: ReviewStoryImageElement) => ImageFrameProps;
  registerTextNode?: (elementId: string, node: HTMLSpanElement | null) => void;
  hiddenTextElementId?: string | null;
  renderElementChrome?: (element: ReviewStoryElement) => ReactNode;
};

function sourceFor(element: ReviewStoryImageElement, assetUrls: Record<string, string>) {
  return element.storagePath ? assetUrls[element.storagePath] || element.src : element.src;
}

function remoteImage(src?: string) {
  return Boolean(src && /^https?:\/\//i.test(src));
}

function maskStyle(element: ReviewStoryImageElement, inverted = false) {
  if (!element.edgeBlend?.enabled || !element.edgeBlend.directions.length) return undefined;
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
  } as React.CSSProperties;
}

function ImageLayer({ element, assetUrls, frameProps }: { element: ReviewStoryImageElement; assetUrls: Record<string, string>; frameProps?: ImageFrameProps }) {
  const src = sourceFor(element, assetUrls);
  const imageStyle = reviewCanvasImageStyle(element);
  return (
    <span className={styles.imageFrame} style={element.edgeBlend?.type === "gradient" ? maskStyle(element) : undefined} {...frameProps}>
      {src ? (
        <>
          <img
            className={styles.image}
            crossOrigin={remoteImage(src) ? "anonymous" : undefined}
            src={src}
            alt=""
            data-review-asset-name={element.name}
            draggable={false}
            style={imageStyle}
          />
          {element.edgeBlend?.enabled && element.edgeBlend.type === "blur" ? (
            <img
              className={styles.blurOverlay}
              crossOrigin={remoteImage(src) ? "anonymous" : undefined}
              src={src}
              alt=""
              data-review-asset-name={`${element.name} 블렌딩`}
              draggable={false}
              style={{ ...imageStyle, filter: `blur(${Math.max(2, element.edgeBlend.strength / 5)}px)`, ...maskStyle(element, true) }}
            />
          ) : null}
        </>
      ) : <span className={styles.placeholder}><ImageIcon size={42} />사진을 추가하세요</span>}
    </span>
  );
}

function TextLayer({ element, registerNode, hidden }: { element: ReviewStoryTextElement; registerNode?: (node: HTMLSpanElement | null) => void; hidden: boolean }) {
  return (
    <span
      ref={registerNode}
      className={styles.text}
      style={{ ...reviewCanvasTextStyle(element), visibility: hidden ? "hidden" : "visible" }}
    >
      <span className={styles.reviewTextHighlight} style={element.highlight ? { display: "inline", backgroundColor: element.highlightColor ?? "#FFF176" } : undefined}>
        {element.text}
      </span>
    </span>
  );
}

export default function ReviewCanvasRenderer({
  document: documentValue,
  assetUrls = {},
  rootRef,
  className,
  elementClassName,
  elementProps,
  imageFrameProps,
  registerTextNode,
  hiddenTextElementId,
  renderElementChrome,
}: Props) {
  const sorted = [...documentValue.elements].sort((a, b) => a.zIndex - b.zIndex);
  return (
    <div
      ref={rootRef}
      className={`${styles.canvas} ${className || ""}`}
      style={{ width: documentValue.width, height: documentValue.height, background: documentValue.background }}
      data-review-canvas-renderer
    >
      {sorted.map((element) => {
        if (element.hidden) return null;
        return (
          <div
            key={element.id}
            className={`${styles.element} ${elementClassName?.(element) || ""}`}
            style={reviewCanvasElementStyle(element)}
            {...elementProps?.(element)}
          >
            {element.type === "shape" ? <span style={{ display: "block", width: "100%", height: "100%", borderRadius: element.radius, background: element.fill }} /> : null}
            {element.type === "image" ? <ImageLayer element={element} assetUrls={assetUrls} frameProps={imageFrameProps?.(element)} /> : null}
            {element.type === "text" ? <TextLayer element={element} registerNode={registerTextNode ? (node) => registerTextNode(element.id, node) : undefined} hidden={hiddenTextElementId === element.id} /> : null}
            {renderElementChrome?.(element)}
          </div>
        );
      })}
    </div>
  );
}
