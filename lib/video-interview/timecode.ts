import type { FrameRate, InterviewClip } from "./types";

const BASES = [24, 25, 30, 48, 50, 60, 120];

/** 29.97 → {30, ntsc}, 25 → {25}. 알 수 없는 값은 반올림 정수로. */
export function fpsToRate(fps: number | null | undefined): FrameRate {
  const value = typeof fps === "number" && Number.isFinite(fps) && fps > 0 ? fps : 30000 / 1001;
  for (const base of BASES) {
    if (Math.abs(value - base) < 0.01) return { timebase: base, ntsc: false, fps: base };
    if (Math.abs(value - (base * 1000) / 1001) < 0.01) return { timebase: base, ntsc: true, fps: (base * 1000) / 1001 };
  }
  const rounded = Math.max(1, Math.round(value));
  return { timebase: rounded, ntsc: false, fps: rounded };
}

export function secondsToFrames(seconds: number, rate: FrameRate): number {
  return Math.round(Math.max(0, seconds) * rate.fps);
}

const pad = (value: number, size = 2) => String(value).padStart(size, "0");

/** NDF 타임코드 문자열 (프리미어 시퀀스 표시와 같은 형식) */
export function framesToTimecode(frames: number, rate: FrameRate): string {
  const total = Math.max(0, Math.round(frames));
  const seconds = Math.floor(total / rate.timebase);
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}:${pad(total % rate.timebase)}`;
}

export function secondsToTimecode(seconds: number, rate: FrameRate): string {
  return framesToTimecode(secondsToFrames(seconds, rate), rate);
}

export function timecodeToFrames(timecode: string, rate: FrameRate): number | null {
  const parts = timecode.split(/[:;.]/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [h, m, s, f] = parts;
  return ((h * 60 + m) * 60 + s) * rate.timebase + f;
}

/** 목록 표시용 짧은 시계 (05:31 / 1:02:14) */
export function formatClock(seconds: number, withTenths = false): string {
  const value = Math.max(0, seconds);
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  const sec = withTenths ? s.toFixed(1).padStart(4, "0") : pad(Math.floor(s));
  return h ? `${h}:${pad(m)}:${sec}` : `${pad(m)}:${sec}`;
}

export function formatSrtTime(seconds: number): string {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

/** 타임라인 시간 → 몇 번째 파일의 몇 분 */
export function locateInClip(seconds: number, clips: Pick<InterviewClip, "name" | "timelineStartSec" | "durationSec">[]) {
  if (!clips.length) return null;
  let found = clips[clips.length - 1];
  for (const clip of clips) {
    if (seconds >= clip.timelineStartSec && seconds < clip.timelineStartSec + clip.durationSec) {
      found = clip;
      break;
    }
  }
  return { clipName: found.name, offsetSec: Math.max(0, seconds - found.timelineStartSec) };
}
