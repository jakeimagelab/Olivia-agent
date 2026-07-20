import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "video-conti-bgm";

// Supabase Storage 오브젝트 키는 비-ASCII 문자(한글 등)를 거부하므로 업로드 원본 파일명에서 제거한다.
const safeKey = (name: string) =>
  name.trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);

const ensureBucket = async () => {
  const sb = getSupabaseAdmin();
  const { data: buckets } = await sb.storage.listBuckets();
  if (buckets?.some((b: any) => b.name === BUCKET)) return;
  await sb.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
    allowedMimeTypes: ["audio/wav", "audio/mpeg", "audio/mp3", "audio/x-wav"],
  });
};

interface BgmSection {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  energyLevel: "low" | "mid" | "high";
  rmsEnergy: number;
  suggestedTheme?: string;
  instrumentation?: string;
}

function parseWavHeader(buf: Buffer): { sampleRate: number; numChannels: number; bitsPerSample: number; dataOffset: number; dataLength: number } | null {
  if (buf.length < 44) return null;
  const riff = buf.toString("ascii", 0, 4);
  if (riff !== "RIFF") return null;

  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);

  // Find "data" chunk
  let offset = 12;
  while (offset + 8 < buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      return { sampleRate, numChannels, bitsPerSample, dataOffset: offset + 8, dataLength: chunkSize };
    }
    offset += 8 + chunkSize;
  }
  return null;
}

function analyzeWav(buf: Buffer): { sections: BgmSection[]; durationSeconds: number; estimatedBpm: number } {
  const hdr = parseWavHeader(buf);
  if (!hdr || hdr.bitsPerSample !== 16) {
    return { sections: [], durationSeconds: 0, estimatedBpm: 110 };
  }

  const { sampleRate, numChannels, dataOffset, dataLength } = hdr;
  const totalSamples = Math.floor(dataLength / (2 * numChannels));
  const durationSeconds = totalSamples / sampleRate;

  const windowSec = 0.5;
  const windowSamples = Math.floor(sampleRate * windowSec);
  const windows: number[] = [];

  // Calculate RMS per window (mono-mix for multi-channel)
  for (let w = 0; w * windowSamples < totalSamples; w++) {
    const start = w * windowSamples;
    const end = Math.min(start + windowSamples, totalSamples);
    let sumSq = 0;
    let count = 0;
    for (let s = start; s < end; s++) {
      let sample = 0;
      for (let c = 0; c < numChannels; c++) {
        const byteOffset = dataOffset + (s * numChannels + c) * 2;
        if (byteOffset + 1 < buf.length) {
          sample += buf.readInt16LE(byteOffset) / 32768;
        }
      }
      sample /= numChannels;
      sumSq += sample * sample;
      count++;
    }
    windows.push(count > 0 ? Math.sqrt(sumSq / count) : 0);
  }

  // Find section boundaries using energy inflection points
  const smoothed = windows.map((_, i) => {
    const from = Math.max(0, i - 2);
    const to = Math.min(windows.length - 1, i + 2);
    let s = 0; for (let j = from; j <= to; j++) s += windows[j];
    return s / (to - from + 1);
  });

  const boundaries: number[] = [0];
  const threshold = 0.20;
  for (let i = 2; i < smoothed.length - 2; i++) {
    const localAvg = (smoothed[i - 2] + smoothed[i - 1] + smoothed[i + 1] + smoothed[i + 2]) / 4;
    if (localAvg > 0.001) {
      const change = Math.abs(smoothed[i] - localAvg) / localAvg;
      if (change > threshold) {
        const lastBoundary = boundaries[boundaries.length - 1];
        if (i - lastBoundary > 4) boundaries.push(i); // at least 2 seconds apart
      }
    }
  }
  boundaries.push(windows.length);

  // Consolidate to 3-5 sections
  while (boundaries.length - 1 > 5) {
    let minGap = Infinity;
    let mergeIdx = 1;
    for (let i = 1; i < boundaries.length - 2; i++) {
      const gap = boundaries[i + 1] - boundaries[i];
      if (gap < minGap) { minGap = gap; mergeIdx = i; }
    }
    boundaries.splice(mergeIdx + 1, 1);
  }
  while (boundaries.length - 1 < 3 && windows.length > 6) {
    const mid = Math.floor((boundaries[boundaries.length - 2] + boundaries[boundaries.length - 1]) / 2);
    boundaries.splice(boundaries.length - 1, 0, mid);
  }

  // Compute per-section energy stats
  const allRms = windows.filter(v => v > 0);
  const globalMax = Math.max(...allRms, 0.001);
  const globalMin = Math.min(...allRms, 0);
  const range = globalMax - globalMin || 0.001;

  const sections: BgmSection[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const from = boundaries[i];
    const to = boundaries[i + 1];
    const slice = windows.slice(from, to);
    const rms = slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
    const norm = (rms - globalMin) / range;
    const energyLevel: "low" | "mid" | "high" = norm < 0.33 ? "low" : norm < 0.66 ? "mid" : "high";

    sections.push({
      index: i,
      startSec: parseFloat((from * windowSec).toFixed(2)),
      endSec: parseFloat((to * windowSec).toFixed(2)),
      durationSec: parseFloat(((to - from) * windowSec).toFixed(2)),
      energyLevel,
      rmsEnergy: parseFloat(rms.toFixed(4)),
    });
  }

  // Simple BPM via zero-crossing rate (rough estimate)
  let zeroCrossings = 0;
  const sampleBuf = buf;
  const maxSamplesToCheck = Math.min(totalSamples, sampleRate * 10); // first 10s
  let prevSign = 0;
  for (let s = 0; s < maxSamplesToCheck; s++) {
    const byteOffset = dataOffset + s * numChannels * 2;
    if (byteOffset + 1 >= sampleBuf.length) break;
    const val = sampleBuf.readInt16LE(byteOffset);
    const sign = val >= 0 ? 1 : -1;
    if (prevSign !== 0 && sign !== prevSign) zeroCrossings++;
    prevSign = sign;
  }
  const analyzedSecs = maxSamplesToCheck / sampleRate;
  const zcRate = zeroCrossings / analyzedSecs;
  // ZCR to BPM rough heuristic: musical beats are ~4-8 half-cycles per beat
  let estimatedBpm = Math.round(zcRate / 6);
  if (estimatedBpm < 60) estimatedBpm = 80;
  if (estimatedBpm > 180) estimatedBpm = 140;

  return { sections, durationSeconds, estimatedBpm };
}

async function enrichSectionsWithClaude(
  sections: BgmSection[],
  brandAnalysis: any,
  apiKey: string
): Promise<BgmSection[]> {
  const energyProfile = sections.map(s =>
    `구간 ${s.index + 1} (${s.startSec}s-${s.endSec}s): 에너지=${s.energyLevel}, RMS=${s.rmsEnergy}`
  ).join("\n");

  const brandContext = brandAnalysis
    ? `브랜드명: ${brandAnalysis.brandName ?? ""}\n한줄요약: ${brandAnalysis.oneLiner ?? ""}\n촬영방향: ${brandAnalysis.shootingDirection ?? ""}`
    : "브랜드 정보 없음";

  const prompt = `당신은 영상 음악 전문가입니다. 아래 BGM 에너지 프로파일과 브랜드 정보를 바탕으로 각 구간에 어울리는 테마와 악기 구성을 제안해주세요.

브랜드 정보:
${brandContext}

BGM 에너지 프로파일:
${energyProfile}

각 구간에 대해 JSON 배열로만 응답하세요 (다른 텍스트 없이):
[
  { "index": 0, "suggestedTheme": "오프닝 - 차분한 시작", "instrumentation": "피아노, 스트링 (약하게)" },
  ...
]`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return sections;
    const enriched: { index: number; suggestedTheme: string; instrumentation: string }[] = JSON.parse(match[0]);
    return sections.map(s => {
      const e = enriched.find(x => x.index === s.index);
      return e ? { ...s, suggestedTheme: e.suggestedTheme, instrumentation: e.instrumentation } : s;
    });
  } catch {
    return sections;
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const videoContiId = form.get("videoContiId");

    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "file 필드 없음" }, { status: 400 });
    if (!videoContiId || typeof videoContiId !== "string") return NextResponse.json({ ok: false, error: "videoContiId 필드 없음" }, { status: 400 });

    await ensureBucket();
    const sb = getSupabaseAdmin();

    const storagePath = `${videoContiId}/${safeKey(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const isWav = file.name.toLowerCase().endsWith(".wav") || file.type.includes("wav");

    const { error: uploadError } = await sb.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: file.type || (isWav ? "audio/wav" : "audio/mpeg"),
      upsert: true,
    });
    if (uploadError) throw uploadError;

    let sections: BgmSection[] = [];
    let durationSeconds = 0;
    let estimatedBpm = 110;
    let note: string | undefined;

    if (isWav) {
      const result = analyzeWav(buffer);
      sections = result.sections;
      durationSeconds = result.durationSeconds;
      estimatedBpm = result.estimatedBpm;

      const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
      if (apiKey && sections.length > 0) {
        // Fetch brand_analysis from the video_conti row
        const { data: row } = await sb.from("video_conti").select("brand_analysis").eq("id", videoContiId).single();
        sections = await enrichSectionsWithClaude(sections, row?.brand_analysis, apiKey);
      }
    } else {
      note = "WAV 파일만 상세 분석이 가능합니다";
    }

    // Save bgm fields
    const { error: updateError } = await sb.from("video_conti").update({
      bgm_filename: file.name,
      bgm_storage_path: storagePath,
      bgm_duration_seconds: durationSeconds || null,
      bgm_tempo_bpm: estimatedBpm,
      bgm_sections: sections,
      updated_at: new Date().toISOString(),
    }).eq("id", videoContiId);

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, sections, durationSeconds, estimatedBpm, note });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
