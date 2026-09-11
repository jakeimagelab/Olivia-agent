"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import QuoteDocument, { quoteDocumentDataFromRow } from "@/components/quote/QuoteDocument";
import { buildContractHtmlFromRow } from "@/lib/contract/contractDocument";
import styles from "./OliviaMobileShell.module.css";

function useFitScale(naturalWidth: number) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setScale(Math.min(1, host.clientWidth / naturalWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [naturalWidth]);

  return { hostRef, scale };
}

export function MobileCanonicalQuoteDocument({ quote }: { quote: Record<string, unknown> }) {
  const data = useMemo(() => quoteDocumentDataFromRow(quote), [quote]);
  const { hostRef, scale } = useFitScale(1123);

  return (
    <div ref={hostRef} className={`${styles.canonicalDocumentHost} quote-app${data.brand === "jakeimage" ? " quote-app--jakeimage" : ""}`} data-mobile-resource-document="quote">
      <div className={styles.canonicalQuoteViewport} style={{ height: `${794 * scale}px` }}>
        <QuoteDocument data={data} scale={scale} />
      </div>
    </div>
  );
}

export function MobileCanonicalContractDocument({
  contract,
  frameRef,
}: {
  contract: Record<string, unknown>;
  frameRef?: RefObject<HTMLIFrameElement | null>;
}) {
  const { hostRef, scale } = useFitScale(840);
  const internalFrameRef = useRef<HTMLIFrameElement>(null);
  const resolvedFrameRef = frameRef ?? internalFrameRef;
  const [html, setHtml] = useState("");
  const [naturalHeight, setNaturalHeight] = useState(3445);

  useEffect(() => {
    setHtml(buildContractHtmlFromRow(contract));
  }, [contract]);

  return (
    <div ref={hostRef} className={styles.canonicalDocumentHost} data-mobile-resource-document="contract">
      <div className={styles.canonicalContractViewport} style={{ height: `${naturalHeight * scale}px` }}>
        {html ? (
          <iframe
            ref={resolvedFrameRef}
            srcDoc={html}
            title="계약서 미리보기"
            scrolling="no"
            onLoad={(event) => {
              const documentHeight = event.currentTarget.contentDocument?.documentElement.scrollHeight;
              if (documentHeight) setNaturalHeight(documentHeight);
            }}
            style={{ width: 840, height: naturalHeight, transform: `scale(${scale})` }}
          />
        ) : <div className={styles.canonicalDocumentLoading}>계약서를 불러오고 있어요...</div>}
      </div>
    </div>
  );
}
