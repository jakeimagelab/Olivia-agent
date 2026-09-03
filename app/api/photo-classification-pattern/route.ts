import { NextRequest, NextResponse } from "next/server";
import {
  getOpenAIClient, SCENE_MODEL, FOLDER_PATTERN_SYSTEM_PROMPT, folderPatternAnalysisSchema,
  FOLDER_PATTERN_WEIGHT_KEYS, type FolderPatternAnalysisOutput,
} from "@/lib/ai/openai";
import { DEFAULT_WEIGHT_PROFILE, type FolderShootingPattern, type FolderStats } from "@/lib/photo-classifier/pattern-analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type RequestBody = { department?: string; stats: FolderStats };

function buildStatsPrompt(stats: FolderStats): string {
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
      splitThreshold: typeof output.splitThreshold === "number" ? output.splitThreshold : DEFAULT_WEIGHT_PROFILE.splitThreshold,
      reviewThreshold: typeof output.reviewThreshold === "number" ? output.reviewThreshold : DEFAULT_WEIGHT_PROFILE.reviewThreshold,
      absoluteTimeGapMinutes: null,
    },
    recommendedSceneCountHint: typeof output.recommendedSceneCountHint === "number" ? output.recommendedSceneCountHint : null,
  };
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
  }
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.stats) return NextResponse.json({ ok: false, error: "stats is required" }, { status: 400 });

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: SCENE_MODEL,
      messages: [
        { role: "system", content: FOLDER_PATTERN_SYSTEM_PROMPT },
        { role: "user", content: `진료과: ${body.department || "general"}\n\n${buildStatsPrompt(body.stats)}` },
      ],
      response_format: { type: "json_schema", json_schema: folderPatternAnalysisSchema },
      max_tokens: 500,
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed: FolderPatternAnalysisOutput;
    try {
      parsed = JSON.parse(raw) as FolderPatternAnalysisOutput;
    } catch {
      return NextResponse.json({ ok: false, error: "AI 응답을 해석하지 못했습니다." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, pattern: toFolderShootingPattern(parsed) });
  } catch (err) {
    console.error("[photo-classification-pattern]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
