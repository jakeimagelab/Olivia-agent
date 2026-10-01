"use client";

import { Clock3, PlayCircle } from "lucide-react";
import type { VideoGenerationRecord } from "@/lib/higgsfield/types";
import styles from "./VideoProductionWorkspace.module.css";

export function VideoHistory({ records, activeId, onSelect }: { records: VideoGenerationRecord[]; activeId?: string; onSelect: (record: VideoGenerationRecord) => void }) {
  return <section className={styles.historyPanel}><div className={styles.historyHead}><div><Clock3 size={17} /><strong>최근 생성 결과</strong></div><span>{records.length}개</span></div>{records.length ? <div className={styles.historyList}>{records.slice(0, 8).map((record) => <button type="button" className={record.requestId === activeId ? styles.historyActive : styles.historyCard} key={record.requestId} onClick={() => onSelect(record)}>{record.thumbnailUrl ? <video muted preload="metadata" src={record.thumbnailUrl} /> : <span className={styles.historyPlaceholder}><PlayCircle size={20} /></span>}<span><strong>{record.modelLabel}</strong><small>{record.prompt || "프롬프트 없음"}</small><em>{record.status === "completed" ? "완료" : record.status}</em></span></button>)}</div> : <p className={styles.emptyHistory}>아직 생성 기록이 없습니다.</p>}</section>;
}
