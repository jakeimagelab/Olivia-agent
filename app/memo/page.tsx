"use client";

import { Suspense } from "react";
import { MemoWorkspace } from "@/components/memo/MemoWorkspace";

export default function MemoPage() {
  return (
    <Suspense fallback={<div className="pc-empty">메모를 준비하는 중…</div>}>
      <MemoWorkspace />
    </Suspense>
  );
}
