import { formatSrtTime } from "./timecode";
import type { InterviewSegment } from "./types";

/** 자막 한 줄 최대 글자 수 (세로 릴스에서도 두 줄 안에 들어오게) */
export const SUBTITLE_MAX_CHARS = 30;

/** 긴 문장을 비슷한 길이로 나눈다. 단어 시간이 있으면 그 시간을, 없으면 글자 수 비례로 나눈다. */
export function splitForSubtitle(segment: InterviewSegment, maxChars = SUBTITLE_MAX_CHARS): Array<{ start: number; end: number; text: string }> {
  const content = segment.text.trim();
  if (content.length <= maxChars) return [{ start: segment.start, end: segment.end, text: content }];
  const words = content.split(/\s+/);
  const pieces = Math.ceil(content.length / maxChars);
  const target = content.length / pieces;
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    if (chunks.length < pieces - 1 && current.join(" ").length >= target * 0.9) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) chunks.push(current);

  const timed = segment.words.length >= words.length * 0.8;
  const out: Array<{ start: number; end: number; text: string }> = [];
  let wordIndex = 0;
  let cursor = segment.start;
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.join(" ").length, 0) || 1;
  for (const chunk of chunks) {
    const chunkText = chunk.join(" ");
    let start = cursor;
    let end = cursor + ((segment.end - segment.start) * chunkText.length) / totalChars;
    if (timed) {
      const first = segment.words[Math.min(wordIndex, segment.words.length - 1)];
      const last = segment.words[Math.min(wordIndex + chunk.length - 1, segment.words.length - 1)];
      start = Math.max(cursor, first?.s ?? start);
      end = Math.max(start + 0.3, last?.e ?? end);
    }
    out.push({ start, end, text: chunkText });
    wordIndex += chunk.length;
    cursor = end;
  }
  if (out.length) out[out.length - 1].end = Math.max(out[out.length - 1].end, segment.end);
  return out;
}

/** 전체 또는 구간(range) 자막. 구간이면 0초부터 다시 시작한다(릴스 시퀀스용). */
export function buildSrt(segments: InterviewSegment[], range?: { start: number; end: number }): string {
  const lines: string[] = [];
  let index = 1;
  for (const segment of segments) {
    for (const piece of splitForSubtitle(segment)) {
      let { start, end } = piece;
      if (range) {
        if (end <= range.start || start >= range.end) continue;
        start = Math.max(start, range.start) - range.start;
        end = Math.min(end, range.end) - range.start;
      }
      lines.push(`${index}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${piece.text}\n`);
      index += 1;
    }
  }
  return lines.join("\n");
}

export function buildPlainTranscript(segments: InterviewSegment[], clock: (seconds: number) => string): string {
  return segments.map((segment) => `[${clock(segment.start)}] ${segment.text}`).join("\n");
}
