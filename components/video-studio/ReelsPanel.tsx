"use client";

import { Copy, FileDown } from "lucide-react";
import photoStyles from "@/components/photo-workspace/PhotoWorkspace.module.css";
import { adjustRange } from "@/lib/video-interview/resolve";
import { buildSrt } from "@/lib/video-interview/srt";
import { secondsToTimecode } from "@/lib/video-interview/timecode";
import type { VideoInterviewResult } from "@/lib/video-interview/types";
import { exportInterview } from "./exportPlan";
import { copyText, downloadText, safeFileName, type ReelEdits } from "./useVideoStudio";
import styles from "./VideoStudio.module.css";

const STEP = 0.5;

export default function ReelsPanel({
  result,
  edits,
  updateEdits,
  editRoot,
  notify,
}: {
  result: VideoInterviewResult;
  edits: ReelEdits;
  updateEdits: (next: (current: ReelEdits) => ReelEdits) => void;
  editRoot: string;
  notify: (message: string) => void;
}) {
  const { reels, qa } = result.analysis;
  const tc = (seconds: number) => secondsToTimecode(seconds, result.rate);
  const adoptedCount = reels.filter((reel) => edits.adopted[reel.id]).length;

  if (!reels.length) return <div className={styles.panel}><div className={styles.empty}>릴스 후보가 없습니다.</div></div>;

  const range = (id: number) => {
    const reel = reels.find((item) => item.id === id)!;
    return edits.adjusted[id] ?? { start: reel.start, end: reel.end };
  };
  const trim = (id: number, deltaStart: number, deltaEnd: number) => updateEdits((current) => {
    const now = range(id);
    return { ...current, adjusted: { ...current.adjusted, [id]: adjustRange(now.start, now.end, deltaStart, deltaEnd, result.durationSec) } };
  });
  const reset = (id: number) => updateEdits((current) => {
    const adjusted = { ...current.adjusted };
    delete adjusted[id];
    return { ...current, adjusted };
  });

  return (
    <div className={styles.panel}>
      <div className={styles.resultHead}>
        <div className={styles.resultTitle}>
          <h3>릴스 후보 {reels.length}개</h3>
          <p>{adoptedCount ? `채택 ${adoptedCount}개 — 채택한 것만 프리미어 세로 시퀀스로 보냅니다.` : "채택하지 않으면 전체 후보를 보냅니다."} 시작·끝은 말 사이 쉼에 맞춰져 있습니다.</p>
        </div>
        <div className={styles.exportRow}>
          <button type="button" className={photoStyles.primaryButton} onClick={() => { exportInterview("premiere", result, edits, editRoot, { edits: true, cuts: true, compliance: true }); notify("프리미어 XML 내려받기 완료"); }}>
            <FileDown size={15} /> 프리미어로 보내기
          </button>
        </div>
      </div>

      <div className={styles.reelGrid}>
        {reels.map((reel, index) => {
          const { start, end } = range(reel.id);
          const changed = Boolean(edits.adjusted[reel.id]);
          const lines = result.segments.filter((segment) => segment.end > start + 0.05 && segment.start < end - 0.05).map((segment) => segment.text).join(" ");
          const adopted = Boolean(edits.adopted[reel.id]);
          const qaLabel = reel.qaId !== null ? qa[reel.qaId]?.label : null;
          return (
            <article key={reel.id} className={`${styles.card} ${styles.reel}`} data-adopted={adopted}>
              <div className={styles.reelHead}>
                <span className={styles.stars}>{"★".repeat(reel.score)}{"☆".repeat(5 - reel.score)}</span>
                <strong>{String(index + 1).padStart(2, "0")}. {reel.title}</strong>
                {qaLabel ? <span className={styles.badge}>{qaLabel}</span> : null}
              </div>
              <p className={styles.reelMeta}><span className={styles.tc}>{tc(start)} → {tc(end)}</span> · {(end - start).toFixed(1)}초{changed ? " · 수정됨" : ""}</p>
              {reel.hook ? <div className={styles.hook}>{reel.hook}</div> : null}
              <p className={styles.reelMeta}>{reel.reason}</p>
              {reel.structure ? <p className={styles.reelMeta}><b>구성</b>{reel.structure}</p> : null}
              {reel.emphasis.length ? <p className={styles.reelMeta}><b>자막 강조</b>{reel.emphasis.join(" · ")}</p> : null}
              <details className={styles.reelDetails}><summary>이 구간 대사</summary><p>{lines}</p></details>
              {reel.caption ? <details className={styles.reelDetails}><summary>인스타 캡션 · 해시태그</summary><p>{reel.caption}{"\n\n"}{reel.hashtags.join(" ")}</p></details> : null}
              <div className={styles.reelActions}>
                <span className={styles.trim} aria-label="시작 조정"><span>시작</span><button type="button" onClick={() => trim(reel.id, -STEP, 0)}>−0.5</button><button type="button" onClick={() => trim(reel.id, STEP, 0)}>+0.5</button></span>
                <span className={styles.trim} aria-label="끝 조정"><span>끝</span><button type="button" onClick={() => trim(reel.id, 0, -STEP)}>−0.5</button><button type="button" onClick={() => trim(reel.id, 0, STEP)}>+0.5</button></span>
                {changed ? <button type="button" className={styles.smallButton} onClick={() => reset(reel.id)}>원래대로</button> : null}
                <button type="button" className={styles.smallButton} onClick={async () => notify((await copyText(tc(start))) ? `${tc(start)} 복사됨` : "복사하지 못했습니다")}><Copy size={12} /> 시작 TC</button>
                {reel.caption ? <button type="button" className={styles.smallButton} onClick={async () => notify((await copyText(`${reel.caption}\n\n${reel.hashtags.join(" ")}`)) ? "캡션 복사됨" : "복사하지 못했습니다")}>캡션 복사</button> : null}
                <button type="button" className={styles.smallButton} onClick={() => downloadText(`${safeFileName(result.title)}_릴스${String(index + 1).padStart(2, "0")}_자막.srt`, buildSrt(result.segments, { start, end }))}>자막 .srt</button>
                <span className={styles.spacer} />
                <button
                  type="button"
                  className={styles.smallButton}
                  aria-pressed={adopted}
                  onClick={() => updateEdits((current) => ({ ...current, adopted: { ...current.adopted, [reel.id]: !adopted } }))}
                >
                  {adopted ? "✓ 채택됨" : "채택"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
