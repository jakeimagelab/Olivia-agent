"use client";

import { useEffect, useState } from "react";
import { FolderOpen, Waves } from "lucide-react";
import PhotoSourcePicker from "@/components/photo-classifier/PhotoSourcePicker";
import photoStyles from "@/components/photo-workspace/PhotoWorkspace.module.css";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import type { VideoAudioExtractResult } from "@/lib/video-interview/types";
import { JobList, JobProgress } from "./InterviewAnalysisPanel";
import { videoStudioWorkerLabel, type VideoStudioJob } from "./useVideoStudio";
import styles from "./VideoStudio.module.css";

const formatSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)}GB` : `${Math.round(bytes / 1024 ** 2)}MB`);

export default function AudioExtractPanel({
  jobs,
  results,
  loadResult,
  targetWorker,
  onStart,
}: {
  jobs: VideoStudioJob[];
  results: Record<string, unknown>;
  loadResult: (jobId: string) => Promise<void>;
  targetWorker: string;
  onStart: (payload: { source_relative_path: string }) => Promise<string>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selection, setSelection] = useState<RemoteNasSelection | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = jobs.find((job) => job.id === openId) ?? null;
  const result = openId ? (results[openId] as VideoAudioExtractResult | undefined) : undefined;

  useEffect(() => {
    if (open?.status === "COMPLETED" && !result) void loadResult(open.id).catch(() => undefined);
  }, [open, result, loadResult]);

  useEffect(() => {
    setSelection(null);
    setPickerOpen(false);
  }, [targetWorker]);

  const start = async () => {
    if (!selection?.path) return;
    setBusy(true);
    setError(null);
    try {
      setOpenId(await onStart({ source_relative_path: selection.path }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "음성 분리를 시작하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel}>
      <p className={styles.panelIntro}>촬영 폴더의 영상마다 음성만 원음 그대로(WAV 24bit) 뽑아 작업 디스크의 <b>음성분리</b> 폴더에 저장합니다. 노이즈 제거·음성 보정용으로 쓰세요.</p>
      <h3 className={styles.sectionTitle}><span>1.</span>촬영 폴더 선택</h3>
      <div className={photoStyles.folderRow}>
        <span className={photoStyles.folderState}><FolderOpen size={18} />{selection ? selection.displayPath || `${videoStudioWorkerLabel(targetWorker)} 최상위` : "폴더가 선택되지 않았습니다."}</span>
        <button type="button" className={photoStyles.secondaryButton} onClick={() => setPickerOpen(true)}>폴더 선택</button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.actions}>
        <button type="button" className={photoStyles.primaryButton} disabled={busy || !selection} onClick={() => void start()}><Waves size={15} /> {busy ? "요청 중…" : "음성 분리 시작"}</button>
      </div>

      {open ? (
        <>
          <h3 className={styles.sectionTitle}>진행 상황</h3>
          <JobProgress job={open} />
          {result ? (
            <div className={styles.jobList} style={{ marginTop: 10 }}>
              {result.files.map((file) => (
                <div key={file.output} className={styles.jobRow} style={{ cursor: "default" }}>
                  <span><strong>{file.output.split("/").at(-1)?.normalize("NFC")}</strong><small>{file.output.normalize("NFC")}</small></span>
                  <span className={styles.status} data-state="COMPLETED">{formatSize(file.sizeBytes)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <h3 className={styles.sectionTitle}>최근 음성 분리</h3>
      <JobList jobs={jobs} onOpen={(job) => setOpenId(job.id)} empty="아직 음성 분리 작업이 없습니다." />
      {pickerOpen ? <PhotoSourcePicker targetWorker={targetWorker} onCancel={() => setPickerOpen(false)} onSelectRemote={(next) => { setSelection(next); setPickerOpen(false); }} /> : null}
    </div>
  );
}
