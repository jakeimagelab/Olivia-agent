"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { captureReviewCanvas } from "@/lib/reviewContent/canvasExport.client";
import type { ReviewStoryDocument } from "@/lib/reviewContent/storyDocument";
import ReviewCanvasRenderer from "./ReviewCanvasRenderer";
import styles from "./ReviewCanvasExportHost.module.css";

export type ReviewCanvasExportHostHandle = {
  captureRaster: (targetWidthPx: number) => Promise<HTMLCanvasElement>;
};

const ReviewCanvasExportHost = forwardRef<ReviewCanvasExportHostHandle, { document: ReviewStoryDocument; assetUrls: Record<string, string> }>(function ReviewCanvasExportHost(
  { document, assetUrls },
  ref,
) {
  const rendererRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    captureRaster: async (targetWidthPx) => {
      if (!rendererRef.current) throw new Error("내보내기 캔버스를 찾을 수 없습니다.");
      return captureReviewCanvas(rendererRef.current, document, targetWidthPx);
    },
  }), [document]);

  return (
    <div className={styles.host} aria-hidden="true">
      <ReviewCanvasRenderer rootRef={rendererRef} document={document} assetUrls={assetUrls} />
    </div>
  );
});

export default ReviewCanvasExportHost;
