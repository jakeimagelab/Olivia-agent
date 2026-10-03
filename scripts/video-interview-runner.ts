#!/usr/bin/env node

import { loadEnvConfig } from "@next/env";
import { runVideoAudioExtract, runVideoInterviewAnalyze } from "@/lib/video-interview/node/runVideoInterview";
import type { VideoStudioProgress } from "@/lib/video-interview/types";
import type { RemoteJobProgressStage } from "@/lib/remote-jobs/progress";

const STAGE_MAP: Record<VideoStudioProgress["stage"], RemoteJobProgressStage> = {
  probe: "PREPARING",
  audio: "PREPARING",
  extract: "COPYING",
  transcribe: "ANALYZING",
  signals: "ANALYZING",
  analyze: "SCENE_ANALYSIS",
  write: "ORGANIZING",
  done: "VERIFYING",
};

// 영상작업실 runner — Mac Studio remote bridge가 VIDEO_INTERVIEW_ANALYZE / VIDEO_AUDIO_EXTRACT 작업으로 실행한다.
// stdout 마지막 줄: 결과 JSON / stderr: OLIVIA_REMOTE_PROGRESS {json}
loadEnvConfig(process.cwd());
const PROGRESS_PREFIX = "OLIVIA_REMOTE_PROGRESS ";

function args(): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 2; index < process.argv.length; index += 1) {
    const key = process.argv[index];
    if (!key.startsWith("--")) throw new Error(`알 수 없는 인자입니다: ${key}`);
    const value = process.argv[index + 1];
    values[key.slice(2)] = value && !value.startsWith("--") ? (index += 1, value) : "true";
  }
  return values;
}

async function main() {
  const values = args();
  const action = values.action;
  const sourceRelativePath = values["source-relative-path"];
  if (!sourceRelativePath) throw new Error("--source-relative-path가 필요합니다.");
  // 서버(parseRemoteJobProgress)가 받는 진행 형식: 정해진 stage + current/total 정수 + message
  const onProgress = (progress: VideoStudioProgress) => {
    const stage = STAGE_MAP[progress.stage];
    const current = Math.max(0, Math.min(100, Math.round(progress.percent)));
    process.stderr.write(`${PROGRESS_PREFIX}${JSON.stringify({ stage, current, total: 100, message: progress.message.slice(0, 480) })}\n`);
  };

  if (action === "analyze") {
    const result = await runVideoInterviewAnalyze({ sourceRelativePath, context: values.context, onProgress });
    let serialized = JSON.stringify(result);
    // 작업 결과는 Vercel 보고 API(본문 4.5MB 제한)를 거친다. 아주 긴 촬영이면 단어 단위 시간만 빼고 보낸다.
    // (전체 데이터는 작업 디스크의 인터뷰분석/analysis.json에 그대로 남아 있다.)
    if (Buffer.byteLength(serialized, "utf8") > 3_000_000) {
      serialized = JSON.stringify({ ...result, segments: result.segments.map((segment) => ({ ...segment, words: [] })) });
    }
    process.stdout.write(`${serialized}\n`);
    return;
  }
  if (action === "extract-audio") {
    const result = await runVideoAudioExtract({ sourceRelativePath, onProgress });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  throw new Error("--action은 analyze 또는 extract-audio여야 합니다.");
}

main().catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify({ ok: false, status: "VIDEO_STUDIO_FAILED", error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
});
