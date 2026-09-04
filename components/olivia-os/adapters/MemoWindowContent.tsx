"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import styles from "./MemoWindowContent.module.css";

const MemoWorkspace = dynamic(
  () => import("@/components/memo/MemoWorkspace").then((module) => module.MemoWorkspace),
  { ssr: false },
);

export function MemoWindowContent() {
  return (
    <div className={styles.root}>
      <Suspense fallback={<div className={styles.loading}>메모를 준비하는 중…</div>}>
        <MemoWorkspace embedded />
      </Suspense>
    </div>
  );
}
