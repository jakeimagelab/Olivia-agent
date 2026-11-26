"use client";

import { useLayoutEffect, useRef, useState } from "react";
import styles from "./ContractBuilder.module.css";

const SHEET_FRAME = "<!doctype html><html lang='ko'><head><meta charset='utf-8'></head><body></body></html>";
const DOCUMENT_WIDTH = 836;

export default function ContractDocumentPreview({ html }: { html: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const frame = frameRef.current;
    if (!viewport || !frame) return;
    const fit = () => {
      const scale = Math.min(viewport.clientWidth / DOCUMENT_WIDTH, 1);
      if (scale <= 0) return;
      frame.style.width = `${DOCUMENT_WIDTH}px`;
      frame.style.height = `${viewport.clientHeight / scale}px`;
      frame.style.transform = `scale(${scale})`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!html || !frameDocument) return;
    const next = new DOMParser().parseFromString(html, "text/html");
    const scrollElement = frameDocument.scrollingElement;
    const scrollTop = scrollElement?.scrollTop ?? 0;
    if (frameDocument.head.innerHTML !== next.head.innerHTML) frameDocument.head.innerHTML = next.head.innerHTML;
    frameDocument.body.innerHTML = next.body.innerHTML;
    if (scrollElement) scrollElement.scrollTop = scrollTop;
  }, [frameDocument, html]);

  return (
    <div className={styles.previewSurface}>
      <div className={styles.previewViewport} ref={viewportRef}>
        <iframe className={styles.previewFrame} ref={frameRef} srcDoc={SHEET_FRAME} sandbox="allow-same-origin"
          title="계약서 미리보기" onLoad={(event) => setFrameDocument(event.currentTarget.contentDocument)} />
      </div>
    </div>
  );
}
