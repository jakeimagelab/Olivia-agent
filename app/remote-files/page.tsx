"use client";

import { Check, FolderOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import RemoteNasBrowser from "@/components/remote-nas/RemoteNasBrowser";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import styles from "./page.module.css";

export default function RemoteFilesPage() {
  const router = useRouter();
  const [selection, setSelection] = useState<RemoteNasSelection | null>(null);

  return (
    <main className={styles.page}>
      <RemoteNasBrowser
        onCancel={() => router.push("/")}
        onSelect={(_path, nextSelection) => setSelection(nextSelection)}
      />

      {selection ? (
        <div className={styles.selectionToast} role="status" aria-live="polite">
          <span><Check size={16} strokeWidth={2} aria-hidden="true" /></span>
          <span>
            <small>선택된 원격 폴더</small>
            <strong><FolderOpen size={14} aria-hidden="true" /> {selection.displayPath || selection.rootName}</strong>
          </span>
        </div>
      ) : null}
    </main>
  );
}
