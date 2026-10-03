import type { InterviewClip, InterviewSegment, InterviewWord } from "./types";

/** 마이크를 찬 사람(원장님) 목소리 중앙값보다 이만큼 작으면 질문자 후보로 본다. */
export const QUIET_DB_MARGIN = 9;
/** 이 이상 말이 없으면 질문이 바뀌는 지점 후보 */
export const LONG_PAUSE_SEC = 3.5;

export type RawSegment = {
  start: number;
  end: number;
  text: string;
  words?: InterviewWord[];
  levelDb?: number | null;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function clipIndexAt(seconds: number, clips: Pick<InterviewClip, "timelineStartSec" | "durationSec">[]): number {
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index];
    if (seconds < clip.timelineStartSec + clip.durationSec) return index;
  }
  return Math.max(0, clips.length - 1);
}

/**
 * 전사 결과에 Q&A 판단용 신호를 붙인다.
 * - quiet: 마이크 없는 사람(질문자) 후보
 * - pauseBefore: 앞 발화와의 간격
 * - clipStartsHere: 촬영 파일이 바뀐 첫 문장
 */
export function annotateSegments(
  raw: RawSegment[],
  clips: Pick<InterviewClip, "timelineStartSec" | "durationSec">[],
): InterviewSegment[] {
  const levels = raw
    .map((segment) => segment.levelDb)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  // 발화 대부분은 마이크를 찬 사람이므로 중앙값이 곧 "주 화자 음량"이다.
  const reference = median(levels);
  let previousClip = -1;
  return raw.map((segment, id) => {
    const clipIndex = clipIndexAt(segment.start, clips);
    const levelDb = typeof segment.levelDb === "number" && Number.isFinite(segment.levelDb) ? Math.round(segment.levelDb * 10) / 10 : null;
    const previous = raw[id - 1];
    const annotated: InterviewSegment = {
      id,
      start: segment.start,
      end: segment.end,
      text: segment.text,
      words: segment.words ?? [],
      levelDb,
      quiet: reference !== null && levelDb !== null && levelDb < reference - QUIET_DB_MARGIN,
      pauseBefore: Math.max(0, Math.round((previous ? segment.start - previous.end : segment.start) * 100) / 100),
      clipIndex,
      clipStartsHere: id > 0 && clipIndex !== previousClip,
    };
    previousClip = clipIndex;
    return annotated;
  });
}

/** 질문이 시작될 가능성이 높은 문장 번호 (Claude에게 힌트로 주고, 실패 시 대체 분리에 사용) */
export function candidateBoundaries(segments: InterviewSegment[]): number[] {
  const result: number[] = [];
  segments.forEach((segment, index) => {
    if (index === 0) return;
    const previous = segments[index - 1];
    const quietStart = segment.quiet && !previous.quiet;
    if (quietStart || segment.clipStartsHere || segment.pauseBefore >= LONG_PAUSE_SEC) result.push(segment.id);
  });
  return result;
}

export type QaSkeleton = { questionStartSeg: number | null; answerStartSeg: number; answerEndSeg: number };

/**
 * Claude 결과를 쓸 수 없을 때의 기계적 Q&A 분리.
 * 작은 목소리 구간은 질문, 그 뒤 큰 목소리 구간은 답변으로 묶고, 작은 목소리가 없으면
 * 파일 바뀜·긴 쉼에서 자른다.
 */
export function fallbackQaBlocks(segments: InterviewSegment[]): QaSkeleton[] {
  if (!segments.length) return [];
  const starts = [0, ...candidateBoundaries(segments)].filter((value, index, array) => array.indexOf(value) === index).sort((a, b) => a - b);
  const blocks: QaSkeleton[] = [];
  starts.forEach((start, index) => {
    const end = (starts[index + 1] ?? segments.length) - 1;
    let cursor = start;
    while (cursor <= end && segments[cursor].quiet) cursor += 1;
    const hasQuestion = cursor > start;
    if (cursor > end) {
      // 질문만 있고 답이 없는 구간은 다음 블록 질문에 합친다.
      if (blocks.length) blocks[blocks.length - 1].answerEndSeg = end;
      return;
    }
    blocks.push({ questionStartSeg: hasQuestion ? start : null, answerStartSeg: cursor, answerEndSeg: end });
  });
  return mergeShortBlocks(blocks, segments);
}

/** 15초도 안 되는 답변 블록은 앞 블록에 붙인다 (맞장구·짧은 리액션 분리 방지). */
function mergeShortBlocks(blocks: QaSkeleton[], segments: InterviewSegment[]): QaSkeleton[] {
  const merged: QaSkeleton[] = [];
  for (const block of blocks) {
    const duration = segments[block.answerEndSeg].end - segments[block.answerStartSeg].start;
    const previous = merged[merged.length - 1];
    if (previous && duration < 15 && block.questionStartSeg === null) {
      previous.answerEndSeg = block.answerEndSeg;
    } else {
      merged.push({ ...block });
    }
  }
  return merged;
}

/**
 * 릴스·구간의 시작/끝을 말 사이 쉼에 맞춘다. 단어 시간이 있으면 첫 단어 직전·마지막 단어 직후로,
 * 앞뒤 발화와 겹치지 않게 쉼의 절반까지만 여유를 둔다.
 */
export function snapRange(segments: InterviewSegment[], startSeg: number, endSeg: number, timelineEnd: number) {
  const first = segments[startSeg];
  const last = segments[endSeg];
  const previous = segments[startSeg - 1];
  const next = segments[endSeg + 1];
  const speechStart = first.words[0]?.s ?? first.start;
  const speechEnd = last.words[last.words.length - 1]?.e ?? last.end;
  const gapBefore = previous ? Math.max(0, speechStart - (previous.words[previous.words.length - 1]?.e ?? previous.end)) : speechStart;
  const gapAfter = next ? Math.max(0, (next.words[0]?.s ?? next.start) - speechEnd) : Math.max(0, timelineEnd - speechEnd);
  const start = Math.max(0, speechStart - Math.min(0.25, gapBefore / 2));
  const end = Math.min(timelineEnd, speechEnd + Math.min(0.4, gapAfter / 2));
  return { start: round2(start), end: round2(Math.max(end, start + 0.5)) };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Claude에게 주는 대본 한 줄: 번호·시간·신호 표시 */
export function transcriptLine(segment: InterviewSegment, clock: (seconds: number) => string): string {
  const tags: string[] = [];
  if (segment.quiet) tags.push("작은목소리");
  if (segment.pauseBefore >= LONG_PAUSE_SEC) tags.push(`앞 ${segment.pauseBefore.toFixed(1)}초 쉼`);
  if (segment.clipStartsHere) tags.push(`파일${segment.clipIndex + 1} 시작`);
  return `#${segment.id} [${clock(segment.start)}]${tags.length ? ` (${tags.join(", ")})` : ""} ${segment.text}`;
}
