"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import { loadStatementPdf } from "@/lib/quote/transactionStatementClient";
import styles from "./TransactionStatement.module.css";

export function TransactionStatementPdfPreview({ source }: { source: string }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ request: string; error?: string }>();
  const request = `${source}&retry=${retry}`;
  const current = result?.request === request ? result : null;

  useEffect(() => {
    const pages = pagesRef.current;
    if (!pages) return;
    const controller = new AbortController();
    const { signal } = controller;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let renderTask: RenderTask | undefined;

    function destroyDocument() {
      const task = loadingTask;
      loadingTask = undefined;
      void task?.destroy().catch(() => undefined);
    }

    async function renderPdf(container: HTMLDivElement) {
      const [pdfjs, pdf] = await Promise.all([
        import("pdfjs-dist/legacy/build/pdf.mjs"),
        loadStatementPdf(request, signal),
      ]);
      const data = new Uint8Array(await pdf.arrayBuffer());
      signal.throwIfAborted();
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).href;
      loadingTask = pdfjs.getDocument({ data });
      const document = await loadingTask.promise;

      for (let index = 1; index <= document.numPages; index++) {
        const page = await document.getPage(index);
        signal.throwIfAborted();
        const viewport = page.getViewport({ scale: 2 });
        const canvas = container.ownerDocument.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `거래명세서 PDF ${index}쪽`);
        renderTask = page.render({ canvas, viewport });
        await renderTask.promise;
        renderTask = undefined;
        signal.throwIfAborted();
        container.append(canvas);
        page.cleanup();
      }

      setResult({ request });
    }

    void renderPdf(pages).catch((cause) => {
      if (!signal.aborted) setResult({ request, error: cause instanceof Error ? cause.message : "PDF 미리보기를 열지 못했습니다." });
    }).finally(destroyDocument);

    return () => {
      controller.abort();
      renderTask?.cancel();
      destroyDocument();
      pages.replaceChildren();
    };
  }, [request]);

  return <div className={styles.pdfFrame}>
    <div className={styles.pdfPages} ref={pagesRef} hidden={!current || Boolean(current.error)} />
    {!current || current.error ? <div className={styles.previewPlaceholder} role={current?.error ? "alert" : "status"}>
      <p>{current?.error || "PDF 미리보기를 만드는 중…"}</p>
      {current?.error ? <button className={styles.secondary} type="button" onClick={() => setRetry((value) => value + 1)}>다시 읽기</button> : null}
    </div> : null}
  </div>;
}
