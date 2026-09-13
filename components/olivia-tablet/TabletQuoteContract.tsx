"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import styles from "./OliviaTabletShell.module.css";

const TabletQuote = dynamic(
  () => import("@/components/olivia-os/adapters/QuoteBuilderWindowContent").then((module) => module.QuoteBuilderWindowContent),
  { ssr: false, loading: () => <div className={styles.appLoading}>견적서를 준비하는 중…</div> },
);
const TabletContract = dynamic(
  () => import("@/components/olivia-os/adapters/ContractBuilderWindowContent").then((module) => module.ContractBuilderWindowContent),
  { ssr: false, loading: () => <div className={styles.appLoading}>계약서를 준비하는 중…</div> },
);

export default function TabletQuoteContract() {
  const [active, setActive] = useState<"quote" | "contract">("quote");
  return (
    <section className={styles.segmentWorkspace} aria-label="견적과 계약">
      <div className={styles.segmentBar} role="tablist" aria-label="문서 종류">
        <button type="button" role="tab" aria-selected={active === "quote"} onClick={() => setActive("quote")}>견적</button>
        <button type="button" role="tab" aria-selected={active === "contract"} onClick={() => setActive("contract")}>계약</button>
      </div>
      <div className={styles.segmentContent}>{active === "quote" ? <TabletQuote /> : <TabletContract />}</div>
    </section>
  );
}
