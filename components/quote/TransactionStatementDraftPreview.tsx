"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { fitA4Sheet } from "@/lib/contract/fitA4Sheet";
import type { StatementBusinessDetails, StatementWorkspaceData } from "@/lib/quote/transactionStatementDetails";
import { buildStatementPage } from "@/lib/quote/transactionStatementHtml";
import styles from "./TransactionStatement.module.css";

const SHEET_WIDTH = 793;
const PREVIEW_FRAME = "<!doctype html><html lang='ko'><head><meta charset='utf-8'><style></style></head><body></body></html>";

export function TransactionStatementDraftPreview({ number, preview, details }: {
  number: string;
  preview: NonNullable<StatementWorkspaceData["draftPreview"]>;
  details: StatementBusinessDetails;
}) {
  const paperRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);

  useLayoutEffect(() => {
    const paper = paperRef.current;
    const frame = frameRef.current;
    if (!paper || !frame) return;
    const resize = () => { frame.style.transform = `scale(${paper.clientWidth / SHEET_WIDTH})`; };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(paper);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!frameDocument) return;
    const style = frameDocument.querySelector("style");
    if (!style) return;
    const { css, sheet } = buildStatementPage({
      statement_number: number, snapshot: preview.snapshot,
      transaction_date: preview.transactionDate, shoot_date: preview.shootDate,
      business_details: details, confirmed_at: null, confirmed_by: null,
    }, {
      logo: preview.snapshot.document.brand === "jakeimage" ? "/assets/jakeimage-logo.png" : "/assets/photoclinic-logo.png",
      signature: "/assets/ceo-signature.png",
      seal: "/assets/jake-seal.png",
      koreanFont: new URL("../../lib/olivia/fonts/NanumSquare-Regular.ttf", import.meta.url).href,
    });
    if (style.textContent !== css) style.textContent = css;

    const drawSheet = () => {
      // The PDF template escapes each business field before building the sheet.
      frameDocument.body.innerHTML = sheet;
      const page = frameDocument.body.firstElementChild;
      if (page) fitA4Sheet(page);
    };
    drawSheet();
    if (frameDocument.fonts.status === "loading") {
      let active = true;
      void frameDocument.fonts.ready.then(() => { if (active) drawSheet(); });
      return () => { active = false; };
    }
  }, [frameDocument, number, preview, details]);

  return <div className={styles.pdfFrame}>
    <div className={styles.pdfPages}>
      <div className={styles.draftPaper} ref={paperRef}>
        <iframe className={styles.draftFrame} ref={frameRef} srcDoc={PREVIEW_FRAME} sandbox="allow-same-origin"
          title="거래명세서 실시간 미리보기" onLoad={(event) => setFrameDocument(event.currentTarget.contentDocument)} />
      </div>
    </div>
  </div>;
}
