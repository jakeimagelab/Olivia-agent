"use client";

import { useState } from "react";
import { ChevronDown, Clock3 } from "lucide-react";
import type { DerivedContiScheduleRow } from "@/lib/conti/deriveSchedule";
import styles from "@/components/conti/v2/ContiV2.module.css";

export default function ContiCompactSchedule({ rows, startTime, onStartTimeChange }: { rows: DerivedContiScheduleRow[]; startTime?: string; onStartTimeChange: (value: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  return (
    <section className={`${styles.compactPanel} ${expanded ? styles.compactPanelExpanded : ""}`}>
      <header className={styles.compactHeader}>
        <div><span>촬영스케줄</span><strong>예상 {formatMinutes(totalMinutes)}</strong></div>
        <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "접기" : "전체보기"}<ChevronDown size={13} style={{ transform: expanded ? "rotate(180deg)" : undefined }} /></button>
      </header>
      <label className={styles.startTimeControl}><Clock3 size={14} /><span>시작시간</span><input type="time" value={startTime ?? ""} onChange={(event) => onStartTimeChange(event.target.value)} /><small>{startTime ? "순서 변경 시 자동 재계산" : "미정"}</small></label>
      <div className={styles.scheduleList}>
        {rows.map((row) => (
          <div key={row.sceneId} className={styles.scheduleItem}>
            <span className={styles.scheduleDot} />
            <time>{row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : `${row.minutes}분`}</time>
            <strong>{String(row.order).padStart(2, "0")} {row.name}</strong>
            <small>{row.location}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}
