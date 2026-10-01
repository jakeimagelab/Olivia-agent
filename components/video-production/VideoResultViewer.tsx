"use client";

import { AlertTriangle, Download, LoaderCircle, Play, RotateCcw, Square, Video } from "lucide-react";
import type { VideoGenerationRecord } from "@/lib/higgsfield/types";
import styles from "./VideoProductionWorkspace.module.css";

type Props = { record?: VideoGenerationRecord; configured: boolean; onCancel: () => void; onRetry: () => void; onReference: () => void; onNew: () => void };

function label(status: VideoGenerationRecord["status"] | undefined) {
  return ({ uploading: "입력 파일 업로드 중", submitting: "생성 요청 중", queued: "생성 대기 중", in_progress: "영상 생성 중", completed: "생성 완료", failed: "생성 실패", nsfw: "생성 제한", canceled: "생성 취소됨" } as Partial<Record<VideoGenerationRecord["status"], string>>)[status ?? "idle"] ?? "영상 결과가 여기에 표시됩니다.";
}

export function VideoResultViewer({ record, configured, onCancel, onRetry, onReference, onNew }: Props) {
  const active = record?.status === "uploading" || record?.status === "submitting" || record?.status === "queued" || record?.status === "in_progress";
  if (!configured) return <section className={styles.previewPanel}><div className={styles.emptyPreview}><AlertTriangle size={30} /><strong>Higgsfield API 연결이 필요합니다.</strong><p>서버 환경변수에 API 자격증명을 등록하면 영상 생성을 시작할 수 있습니다.</p></div></section>;
  if (!record) return <section className={styles.previewPanel}><div className={styles.emptyPreview}><Video size={34} /><strong>영상 결과가 여기에 표시됩니다.</strong><p>모델과 프롬프트를 설정한 뒤 영상 생성을 시작하세요.</p></div></section>;
  if (record.status === "completed" && record.videoUrl) return <section className={styles.previewPanel}><div className={styles.previewMeta}><span className={styles.statusDone}>완료</span><span>{record.modelLabel}</span></div><video className={styles.videoPlayer} controls poster={record.thumbnailUrl}><source src={record.videoUrl} /></video><div className={styles.previewActions}><a className={styles.primaryAction} href={record.videoUrl} download><Download size={16} /> 다운로드</a><button type="button" onClick={onRetry}><RotateCcw size={16} /> 다시 생성</button><button type="button" onClick={onReference}><Play size={16} /> Reference로 사용</button><button type="button" onClick={onNew}>새 영상 만들기</button></div></section>;
  if (active) return <section className={styles.previewPanel}><div className={styles.processingPreview}><LoaderCircle size={36} className={styles.spin} /><span className={styles.processingLabel}>{label(record.status)}</span><strong>{record.modelLabel}</strong><p>Higgsfield의 실제 작업 상태를 확인하고 있습니다.</p>{record.status === "queued" ? <button type="button" className={styles.cancelButton} onClick={onCancel}><Square size={15} /> 생성 취소</button> : null}</div></section>;
  return <section className={styles.previewPanel}><div className={styles.emptyPreview}><AlertTriangle size={30} /><strong>{label(record.status)}</strong><p>{record.providerError || "생성 옵션이나 Higgsfield 연결 상태를 확인한 뒤 다시 시도하세요."}</p><button type="button" className={styles.primaryAction} onClick={onRetry}><RotateCcw size={16} /> 다시 생성</button></div></section>;
}
