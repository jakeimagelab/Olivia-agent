"use client";

import dynamic from "next/dynamic";
import { remoteWorkerNasDataSource } from "@/lib/remote-nas/remoteNasDataSource";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import styles from "./PhotoSourcePicker.module.css";

const RemoteNasBrowser = dynamic(
  () => import("@/components/remote-nas/RemoteNasBrowser"),
  {
    ssr: false,
    loading: () => <div className={styles.loading}>원격 NAS를 준비하고 있어요…</div>,
  },
);

export default function PhotoSourcePicker({
  onCancel,
  onSelectRemote,
}: {
  onCancel: () => void;
  onSelectRemote: (selection: RemoteNasSelection) => void;
}) {
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Mac Studio NAS 작업 폴더 선택">
      <RemoteNasBrowser
        dataSource={remoteWorkerNasDataSource}
        foldersOnly
        onCancel={onCancel}
        onSelect={(_path, selection) => onSelectRemote(selection)}
      />
    </div>
  );
}
