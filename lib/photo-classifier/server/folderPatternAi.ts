import {
  FOLDER_PATTERN_SYSTEM_PROMPT,
  FOLDER_PATTERN_WEIGHT_KEYS,
  SCENE_MODEL,
  folderPatternAnalysisSchema,
  getOpenAIClient,
  type FolderPatternAnalysisOutput,
} from "@/lib/ai/openai";
import {
  DEFAULT_WEIGHT_PROFILE,
  type FolderShootingPattern,
  type FolderStats,
} from "@/lib/photo-classifier/pattern-analysis";

function statsPrompt(stats: FolderStats): string {
  const lines = [
    `총 파일 수: ${stats.time.fileCount}`,
    `촬영 간격 중간값: ${stats.time.medianIntervalSec.toFixed(1)}초`,
    `촬영 간격 p90: ${stats.time.p90IntervalSec.toFixed(1)}초`,
    `촬영 간격 p95: ${stats.time.p95IntervalSec.toFixed(1)}초`,
    `최대 간격: ${stats.time.maxIntervalSec.toFixed(1)}초`,
    `이례적으로 큰 간격(gap) 개수: ${stats.time.largeGapCount}`,
    `카메라 기종 수: ${stats.cameraModelCount}`,
  ];
  if (stats.visual) {
    lines.push(
      `연속 사진 간 평균 시각 변화도(0~1): ${stats.visual.meanChangeScore.toFixed(3)}`,
      `시각 변화도 표준편차: ${stats.visual.stdDevChangeScore.toFixed(3)}`,
      `시각 변화가 큰(0.5 초과) 구간 비율: ${(stats.visual.highChangeRatio * 100).toFixed(1)}%`,
    );
  } else {
    lines.push("시각 변화 통계: 계산 안 됨(빠른 모드)");
  }
  return lines.join("\n");
}

function toFolderShootingPattern(output: FolderPatternAnalysisOutput): FolderShootingPattern {
  const weights = { ...DEFAULT_WEIGHT_PROFILE.weights };
  for (const key of FOLDER_PATTERN_WEIGHT_KEYS) {
    const value = output.weights[key];
    if (typeof value === "number" && Number.isFinite(value)) weights[key] = value;
  }
  return {
    shootingType: output.shootingType || "일반 촬영",
    observations: Array.isArray(output.observations) ? output.observations.slice(0, 5) : [],
    profile: {
      weights,
      splitThreshold: typeof output.splitThreshold === "number"
        ? output.splitThreshold
        : DEFAULT_WEIGHT_PROFILE.splitThreshold,
      reviewThreshold: typeof output.reviewThreshold === "number"
        ? output.reviewThreshold
        : DEFAULT_WEIGHT_PROFILE.reviewThreshold,
      absoluteTimeGapMinutes: null,
    },
    recommendedSceneCountHint: typeof output.recommendedSceneCountHint === "number"
      ? output.recommendedSceneCountHint
      : null,
  };
}

export async function analyzeFolderPattern(input: {
  department: string;
  stats: FolderStats;
}): Promise<FolderShootingPattern> {
  const response = await getOpenAIClient().chat.completions.create({
    model: SCENE_MODEL,
    messages: [
      { role: "system", content: FOLDER_PATTERN_SYSTEM_PROMPT },
      { role: "user", content: `진료과: ${input.department || "general"}\n\n${statsPrompt(input.stats)}` },
    ],
    response_format: { type: "json_schema", json_schema: folderPatternAnalysisSchema },
    max_tokens: 500,
  });
  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as FolderPatternAnalysisOutput;
  return toFolderShootingPattern(parsed);
}
