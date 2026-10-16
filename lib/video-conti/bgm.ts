import { getSupabaseAdmin } from "@/lib/supabase";

export const VIDEO_CONTI_BGM_BUCKET = "video-conti-bgm";
export const VIDEO_CONTI_BGM_MAX_BYTES = 50 * 1024 * 1024;
export const UNSUPPORTED_WAV_NOTE = "이 WAV 형식은 분석할 수 없습니다(16/24/32bit PCM만 지원)";

export interface BgmSection {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  energyLevel: "low" | "mid" | "high";
  rmsEnergy: number;
  suggestedTheme?: string;
  instrumentation?: string;
}

export const safeBgmStorageKey = (name: string) => name.trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);

export function validateBgmUpload(fileName: string, size: number): { extension: "wav" | "mp3"; contentType: string } {
  const extension = fileName.trim().toLowerCase().match(/\.([^.]+)$/)?.[1];
  if (extension !== "wav" && extension !== "mp3") throw new Error("WAV 또는 MP3 파일만 올릴 수 있습니다");
  if (!Number.isFinite(size) || size <= 0 || size > VIDEO_CONTI_BGM_MAX_BYTES) throw new Error("50MB 이하 파일만 올릴 수 있습니다");
  return { extension, contentType: extension === "wav" ? "audio/wav" : "audio/mpeg" };
}

export async function ensureBgmBucket(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (buckets?.some((bucket) => bucket.name === VIDEO_CONTI_BGM_BUCKET)) return;
  const { error: createError } = await supabase.storage.createBucket(VIDEO_CONTI_BGM_BUCKET, {
    public: false,
    fileSizeLimit: VIDEO_CONTI_BGM_MAX_BYTES,
    allowedMimeTypes: ["audio/wav", "audio/mpeg", "audio/mp3", "audio/x-wav"],
  });
  if (createError) throw createError;
}

type WavHeader = { format: number; sampleRate: number; numChannels: number; bitsPerSample: number; dataOffset: number; dataLength: number };

function parseWavHeader(buffer: Buffer): WavHeader | null {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") return null;
  let format: Pick<WavHeader, "format" | "sampleRate" | "numChannels" | "bitsPerSample"> | null = null;
  let data: Pick<WavHeader, "dataOffset" | "dataLength"> | null = null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + chunkSize > buffer.length) break;
    if (chunkId === "fmt " && chunkSize >= 16) {
      format = { format: buffer.readUInt16LE(body), numChannels: buffer.readUInt16LE(body + 2), sampleRate: buffer.readUInt32LE(body + 4), bitsPerSample: buffer.readUInt16LE(body + 14) };
    }
    if (chunkId === "data") data = { dataOffset: body, dataLength: Math.min(chunkSize, buffer.length - body) };
    offset = body + chunkSize + (chunkSize % 2);
  }
  return format && data ? { ...format, ...data } : null;
}

function sampleAt(buffer: Buffer, offset: number, format: number, bits: number): number {
  if (format === 3 && bits === 32) return Math.max(-1, Math.min(1, buffer.readFloatLE(offset)));
  if (bits === 16) return buffer.readInt16LE(offset) / 32768;
  if (bits === 24) {
    const raw = buffer.readUIntLE(offset, 3);
    return (raw & 0x800000 ? raw - 0x1000000 : raw) / 8388608;
  }
  return buffer.readInt32LE(offset) / 2147483648;
}

export function analyzeWav(buffer: Buffer): { sections: BgmSection[]; durationSeconds: number; estimatedBpm: null; note?: string } {
  const header = parseWavHeader(buffer);
  const supported = header && ((header.format === 1 && [16, 24, 32].includes(header.bitsPerSample)) || (header.format === 3 && header.bitsPerSample === 32));
  if (!header || !supported || header.numChannels < 1 || header.sampleRate < 1) return { sections: [], durationSeconds: 0, estimatedBpm: null, note: UNSUPPORTED_WAV_NOTE };

  const bytesPerSample = header.bitsPerSample / 8;
  const frameBytes = bytesPerSample * header.numChannels;
  const totalSamples = Math.floor(header.dataLength / frameBytes);
  const durationSeconds = totalSamples / header.sampleRate;
  const windowSec = 0.5;
  const windowSamples = Math.floor(header.sampleRate * windowSec);
  const windows: number[] = [];
  for (let window = 0; window * windowSamples < totalSamples; window++) {
    const start = window * windowSamples;
    const end = Math.min(start + windowSamples, totalSamples);
    let sumSq = 0;
    let count = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
      let sample = 0;
      for (let channel = 0; channel < header.numChannels; channel++) {
        const byteOffset = header.dataOffset + (sampleIndex * header.numChannels + channel) * bytesPerSample;
        if (byteOffset + bytesPerSample <= buffer.length) sample += sampleAt(buffer, byteOffset, header.format, header.bitsPerSample);
      }
      sample /= header.numChannels;
      sumSq += sample * sample;
      count++;
    }
    windows.push(count ? Math.sqrt(sumSq / count) : 0);
  }

  const smoothed = windows.map((_, index) => {
    const from = Math.max(0, index - 2);
    const to = Math.min(windows.length - 1, index + 2);
    let sum = 0;
    for (let cursor = from; cursor <= to; cursor++) sum += windows[cursor];
    return sum / (to - from + 1);
  });
  const boundaries = [0];
  for (let index = 2; index < smoothed.length - 2; index++) {
    const localAverage = (smoothed[index - 2] + smoothed[index - 1] + smoothed[index + 1] + smoothed[index + 2]) / 4;
    if (localAverage > 0.001 && Math.abs(smoothed[index] - localAverage) / localAverage > 0.2 && index - boundaries[boundaries.length - 1] > 4) boundaries.push(index);
  }
  boundaries.push(windows.length);
  while (boundaries.length - 1 > 5) {
    let minimumGap = Infinity;
    let mergeIndex = 1;
    for (let index = 1; index < boundaries.length - 2; index++) {
      const gap = boundaries[index + 1] - boundaries[index];
      if (gap < minimumGap) { minimumGap = gap; mergeIndex = index; }
    }
    boundaries.splice(mergeIndex + 1, 1);
  }
  while (boundaries.length - 1 < 3 && windows.length > 6) {
    const middle = Math.floor((boundaries[boundaries.length - 2] + boundaries[boundaries.length - 1]) / 2);
    boundaries.splice(boundaries.length - 1, 0, middle);
  }
  const nonZero = windows.filter((value) => value > 0);
  const globalMax = Math.max(...nonZero, 0.001);
  const globalMin = Math.min(...nonZero, 0);
  const range = globalMax - globalMin || 0.001;
  const sections = boundaries.slice(0, -1).map((from, index): BgmSection => {
    const to = boundaries[index + 1];
    const slice = windows.slice(from, to);
    const rms = slice.reduce((sum, value) => sum + value, 0) / (slice.length || 1);
    const normalized = (rms - globalMin) / range;
    return { index, startSec: Number((from * windowSec).toFixed(2)), endSec: Number((to * windowSec).toFixed(2)), durationSec: Number(((to - from) * windowSec).toFixed(2)), energyLevel: normalized < 0.33 ? "low" : normalized < 0.66 ? "mid" : "high", rmsEnergy: Number(rms.toFixed(4)) };
  });
  return { sections, durationSeconds, estimatedBpm: null };
}
