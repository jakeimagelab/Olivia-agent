"use client";

import { useEffect, useRef, useState } from "react";
import type { ReviewStoryDocument } from "@/lib/reviewContent/storyDocument";
import ReviewCanvasRenderer from "./ReviewCanvasRenderer";
import styles from "./ReviewCanvasThumbnail.module.css";

export default function ReviewCanvasThumbnail({ document, assetUrls = {}, className = "" }: { document: ReviewStoryDocument; assetUrls?: Record<string, string>; className?: string }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(0.05);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const update = () => setScale(node.clientWidth / document.width || 0.05);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [document.width]);

  return (
    <span ref={rootRef} className={`${styles.thumbnail} ${className}`}>
      <span className={styles.scale} style={{ transform: `scale(${scale})` }}>
        <ReviewCanvasRenderer document={document} assetUrls={assetUrls} />
      </span>
    </span>
  );
}
