import { NextRequest, NextResponse } from "next/server";
import {
  openai,
  SCENE_MODEL,
  SCENE_MODEL_HIGH,
  photoSceneAnalysisSchema,
  needsHighModel,
} from "@/lib/ai/openai";
import { getDepartmentConfig } from "@/lib/photo-classifier/departments";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type FrameInput = { fileName: string; base64: string };

type RequestBody = {
  department: MedicalDepartment;
  sceneId: string;
  frames: FrameInput[];
  options?: { useHighModel?: boolean };
};

type AnalysisResult = {
  department: string;
  sceneId: string;
  sceneType: string;
  displayName: string;
  suggestedFolderName: string;
  confidence: number;
  detectedCues: string[];
  negativeCues: string[];
  reason: string;
  needsReview: boolean;
};

const VIDEO_SYSTEM_PROMPT = `당신은 병원 홍보/홈페이지용 영상 촬영 Scene 분류 전문가입니다.

입력된 이미지들은 병원에서 촬영한 홍보용 영상 클립에서 추출한 스틸컷(대표 프레임) 여러 장입니다.
같은 영상(들)에서 시작/중간/끝 지점을 캡처한 것이므로, 프레임 간 흐름과 변화를 함께 고려해 하나의 장면으로 판단하세요.
선택된 진료과의 Scene Type 목록과 판단 기준에 따라 분류하세요.

분류 원칙:
- 장소만으로 판단하지 말고, 인물의 역할·행동·표정·장비·도구·복장·환자 자세·관계성을 함께 판단하세요.
- 확신이 낮으면 억지로 맞히지 말고 etc 또는 needsReview=true로 반환하세요.
- 하모니컷(harmony)은 장소가 아니라 여러 명이 함께 웃고 관계성을 보여주는 장면입니다.
- 프로필(profile)은 1인이 카메라를 정확히 응시하고 정지 포즈를 취한 경우에만 분류합니다.
- suggestedFolderName은 진료과 config의 folderName 형식을 따르세요 (예: "임플란트수술", "C-ARM시술").
- 응답은 반드시 지정된 JSON Schema를 따르세요.`;

function buildDepartmentPrompt(department: MedicalDepartment, sceneId: string): string {
  const config = getDepartmentConfig(department);

  const typeList = config.sceneTypes
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .filter((t) => t.sceneType !== "etc")
    .map(
      (t) =>
        `- ${t.sceneType} (${t.displayName}): ${t.description} | 단서: ${t.visualCues.join(", ")}`,
    )
    .join("\n");

  const priorityOrder = config.sceneTypes
    .filter((t) => t.sceneType !== "etc")
    .sort((a, b) => a.priority - b.priority)
    .map((t) => t.displayName)
    .join(" > ");

  const exampleFolder = config.sceneTypes[0]?.folderName ?? "Scene";

  return `진료과: ${config.displayName}
Scene ID: ${sceneId}

분류 가능한 장면 타입:
${typeList}
- etc (ETC_확인필요): 위 유형으로 분류 불가하거나 조명불량, 테스트컷

우선순위 (낮은 번호 = 높은 우선순위):
${priorityOrder} > ETC

응답 시 sceneType 값은 반드시 위 목록의 영문 key 중 하나를 사용하세요.
suggestedFolderName은 한국어 폴더명만 반환하세요 (예: "${exampleFolder}").
판단이 어려우면 needsReview=true 또는 sceneType="etc"로 반환하세요.`;
}

async function analyzeWithModel(
  model: string,
  department: MedicalDepartment,
  sceneId: string,
  frames: FrameInput[],
): Promise<AnalysisResult> {
  const config = getDepartmentConfig(department);

  const imageContent = frames.slice(0, 6).map((frame) => ({
    type: "image_url" as const,
    image_url: {
      url: frame.base64.startsWith("data:") ? frame.base64 : `data:image/jpeg;base64,${frame.base64}`,
      detail: "low" as const,
    },
  }));

  const textContent = {
    type: "text" as const,
    text: buildDepartmentPrompt(department, sceneId),
  };

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: VIDEO_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [...imageContent, textContent],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: photoSceneAnalysisSchema,
    },
    max_tokens: 600,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const sceneType = (parsed.sceneType as string) || "etc";
  const rule = config.sceneTypes.find((r) => r.sceneType === sceneType);
  const suggestedFolderName =
    rule?.folderName ?? (parsed.suggestedFolderName as string) ?? sceneType;

  return {
    department,
    sceneId,
    sceneType,
    displayName: (parsed.displayName as string) || rule?.displayName || sceneType,
    suggestedFolderName,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    detectedCues: Array.isArray(parsed.detectedCues) ? (parsed.detectedCues as string[]) : [],
    negativeCues: Array.isArray(parsed.negativeCues) ? (parsed.negativeCues as string[]) : [],
    reason: (parsed.reason as string) || "",
    needsReview: typeof parsed.needsReview === "boolean" ? parsed.needsReview : false,
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

  const { department, sceneId, frames, options } = body;

  if (!department || !sceneId || !Array.isArray(frames) || frames.length === 0) {
    return NextResponse.json(
      { ok: false, error: "department, sceneId, frames are required" },
      { status: 400 },
    );
  }

  try {
    const model = options?.useHighModel ? SCENE_MODEL_HIGH : SCENE_MODEL;
    let result = await analyzeWithModel(model, department, sceneId, frames);

    if (!options?.useHighModel && needsHighModel(result)) {
      result = await analyzeWithModel(SCENE_MODEL_HIGH, department, sceneId, frames);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[video-scene-analyze]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
