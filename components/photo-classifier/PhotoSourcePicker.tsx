"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { createRemoteWorkerNasDataSource, remoteWorkerNasDataSource } from "@/lib/remote-nas/remoteNasDataSource";
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
  targetWorker,
}: {
  onCancel: () => void;
  onSelectRemote: (selection: RemoteNasSelection) => void;
  targetWorker?: string;
}) {
  const isMacBook = targetWorker === "jake-macbookpro-01";
  const dataSource = useMemo(
    () => targetWorker ? createRemoteWorkerNasDataSource({ targetWorker }) : remoteWorkerNasDataSource,
    [targetWorker],
  );
  const workerLabel = isMacBook ? "MacBook Pro" : "Mac Studio";
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`${workerLabel} 작업 폴더 선택`}>
      <RemoteNasBrowser
        dataSource={dataSource}
        rootLabel={isMacBook ? "MacBook Pro" : undefined}
        workerLabel={workerLabel}
        foldersOnly
        onCancel={onCancel}
        onSelect={(_path, selection) => onSelectRemote(selection)}
      />
    </div>
  );
}
