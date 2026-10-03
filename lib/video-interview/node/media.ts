import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fpsToRate } from "../timecode";
import type { InterviewClip } from "../types";

export const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".mxf", ".mts", ".m2ts", ".avi", ".mkv"]);

/** LaunchAgent로 뜬 Worker는 PATH가 짧아서 Homebrew 경로를 직접 찾아 본다. */
export function resolveBinary(envName: string, candidates: string[], fallback: string): string {
  const configured = process.env[envName]?.trim();
  if (configured) return configured;
  return candidates.find((candidate) => existsSync(candidate)) ?? fallback;
}

export const ffmpegPath = () => resolveBinary("OLIVIA_FFMPEG_PATH", ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"], "ffmpeg");
export const pythonPath = () => resolveBinary("OLIVIA_VIDEO_PYTHON", [path.join(process.env.HOME ?? "", "OliviaWorker", "venv-video", "bin", "python")], "python3");

export type ProcessResult = { code: number; stdout: string; stderr: string };

export function runProcess(
  command: string,
  args: string[],
  options: { onStderrLine?: (line: string) => void; cwd?: string } = {},
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => {
      const textChunk = chunk.toString("utf8");
      // 진단용 stderr는 마지막 64KB만 보관한다(ffmpeg 로그가 매우 길 수 있음).
      stderr = (stderr + textChunk).slice(-65_536);
      buffer += textChunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) options.onStderrLine?.(line);
    });
    child.once("error", (error) => reject(new Error(`${path.basename(command)} 실행 실패: ${error.message}`)));
    child.once("close", (code) => {
      if (buffer) options.onStderrLine?.(buffer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function naturalKey(name: string): Array<string | number> {
  return name.split(/(\d+)/).map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()));
}

export function compareNatural(a: string, b: string): number {
  const ka = naturalKey(a);
  const kb = naturalKey(b);
  for (let index = 0; index < Math.max(ka.length, kb.length); index += 1) {
    const x = ka[index];
    const y = kb[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
}

/** 폴더 바로 아래의 촬영 파일 (숨김·macOS 리소스 포크 제외), 파일명 자연 정렬 */
export async function listVideoFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort(compareNatural);
}

/** ffprobe 없이 ffmpeg -i 출력으로 길이·fps·해상도·오디오·타임코드를 읽는다. */
export function parseFfmpegProbe(output: string) {
  const info = {
    durationSec: 0,
    fps: null as number | null,
    width: null as number | null,
    height: null as number | null,
    hasVideo: false,
    hasAudio: false,
    sampleRate: 48000,
    channels: 2,
    startTimecode: null as string | null,
  };
  const duration = output.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (duration) info.durationSec = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  for (const line of output.split(/\r?\n/)) {
    if (line.includes("Stream #") && line.includes("Video:") && !line.includes("attached pic") && !info.hasVideo) {
      info.hasVideo = true;
      const size = line.match(/,\s*(\d{2,5})x(\d{2,5})/);
      if (size) { info.width = Number(size[1]); info.height = Number(size[2]); }
      const fps = line.match(/([\d.]+)\s*fps/) ?? line.match(/([\d.]+)\s*tbr/);
      if (fps) info.fps = Number(fps[1]);
    }
    if (line.includes("Stream #") && line.includes("Audio:") && !info.hasAudio) {
      info.hasAudio = true;
      const rate = line.match(/(\d{4,6})\s*Hz/);
      if (rate) info.sampleRate = Number(rate[1]);
      if (/\bmono\b/.test(line)) info.channels = 1;
    }
    const timecode = line.match(/timecode\s*:\s*(\d\d:\d\d:\d\d[:;]\d\d)/);
    if (timecode && !info.startTimecode) info.startTimecode = timecode[1].replace(";", ":");
  }
  // 휴대폰 세로 촬영: 회전 메타데이터가 있으면 가로·세로를 바꾼다.
  if (/rotation of -?90|rotate\s*:\s*-?90|rotate\s*:\s*270/.test(output) && info.width && info.height) {
    [info.width, info.height] = [info.height, info.width];
  }
  return info;
}

export async function probeClip(absolutePath: string, relativePath: string, index: number, timelineStartSec: number): Promise<InterviewClip> {
  const result = await runProcess(ffmpegPath(), ["-hide_banner", "-i", absolutePath]);
  const info = parseFfmpegProbe(result.stderr);
  if (!(info.durationSec > 0)) throw new Error(`길이를 읽을 수 없는 파일입니다: ${path.basename(absolutePath)}`);
  return {
    index,
    name: path.basename(absolutePath),
    relativePath,
    absolutePath,
    durationSec: Math.round(info.durationSec * 1000) / 1000,
    timelineStartSec: Math.round(timelineStartSec * 1000) / 1000,
    rate: fpsToRate(info.fps),
    width: info.width,
    height: info.height,
    sampleRate: info.sampleRate,
    channels: info.channels,
    startTimecode: info.startTimecode,
    hasVideo: info.hasVideo,
    hasAudio: info.hasAudio,
  };
}

export async function runFfmpeg(args: string[]): Promise<void> {
  const result = await runProcess(ffmpegPath(), ["-hide_banner", "-nostdin", "-y", ...args]);
  if (result.code !== 0) throw new Error(`ffmpeg 오류: ${result.stderr.split(/\r?\n/).filter(Boolean).slice(-3).join(" / ")}`);
}

/** 인식용 16kHz 모노 WAV 두 벌: 원본 음량(level) / 작은 목소리를 키운 음량(asr) */
export async function extractAnalysisAudio(clip: InterviewClip, levelWav: string, asrWav: string): Promise<void> {
  const base = ["-i", clip.absolutePath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"];
  await runFfmpeg([...base, levelWav]);
  // dynaudnorm: 짧은 창 단위로 음량을 맞춰 마이크 없는 질문자 목소리도 인식되게 한다.
  // 최대 증폭(m)을 12배로 제한해 무음 구간 잡음이 과하게 커지지 않게 한다.
  await runFfmpeg([...base.slice(0, 3), "-af", "highpass=f=80,dynaudnorm=f=250:g=15:p=0.9:m=12", ...base.slice(3), asrWav]);
}

/** 편집용 음성 분리: 원본 샘플레이트·채널 유지, 24bit WAV */
export async function extractEditAudio(clip: InterviewClip, outputWav: string): Promise<void> {
  await runFfmpeg(["-i", clip.absolutePath, "-vn", "-map", "0:a:0", "-c:a", "pcm_s24le", outputWav]);
}
