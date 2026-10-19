"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { createPersonSelectRemoteDataSource, createRemoteWorkerNasDataSource, remoteWorkerNasDataSource } from "@/lib/remote-nas/remoteNasDataSource";
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
  sourceScope = "photo",
}: {
  onCancel: () => void;
  onSelectRemote: (selection: RemoteNasSelection) => void;
  targetWorker?: string;
  /** 개인별 사진 셀렉은 기존 사진 작업과 분리된 다중 허용 루트를 쓴다. */
  sourceScope?: "photo" | "person-select";
}) {
  const isMacBook = targetWorker === "jake-macbookpro-01";
  const dataSource = useMemo(() => {
    if (sourceScope === "person-select") return createPersonSelectRemoteDataSource({ targetWorker });
    return targetWorker ? createRemoteWorkerNasDataSource({ targetWorker }) : remoteWorkerNasDataSource;
  }, [sourceScope, targetWorker]);
  const workerLabel = isMacBook ? "MacBook Pro" : "Mac Studio";
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`${workerLabel} 작업 폴더 선택`}>
      <RemoteNasBrowser
        dataSource={dataSource}
        rootLabel={sourceScope === "person-select" ? "사진 가져오기 폴더" : isMacBook ? "MacBook Pro" : undefined}
        workerLabel={workerLabel}
        foldersOnly
        onCancel={onCancel}
        onSelect={(_path, selection) => onSelectRemote(selection)}
      />
    </div>
  );
}
