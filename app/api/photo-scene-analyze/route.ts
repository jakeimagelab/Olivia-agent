import { NextRequest, NextResponse } from "next/server";
import {
  openai,
  SCENE_MODEL,
  SCENE_MODEL_HIGH,
  COMMON_SYSTEM_PROMPT,
  photoSceneAnalysisSchema,
  needsHighModel,
} from "@/lib/ai/openai";
import { getDepartmentConfig } from "@/lib/photo-classifier/departments";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type ImageInput = { fileName: string; base64: string };

type RequestBody = {
  department: MedicalDepartment;
  sceneId: string;
  images: ImageInput[];
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
  patientPosture: "seated" | "standing" | "lying_down" | "unclear";
  hasHandpiece: boolean;
  hasTreatmentDevice: boolean;
  hasTreatmentBed: boolean;
  hasConsultationDesk: boolean;
};

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
  images: ImageInput[],
): Promise<AnalysisResult> {
  const config = getDepartmentConfig(department);

  const imageContent = images.slice(0, 6).map((img) => ({
    type: "image_url" as const,
    image_url: {
      url: img.base64.startsWith("data:") ? img.base64 : `data:image/jpeg;base64,${img.base64}`,
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
        content: COMMON_SYSTEM_PROMPT,
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

  const { department, sceneId, images, options } = body;

  if (!department || !sceneId || !Array.isArray(images) || images.length === 0) {
    return NextResponse.json(
      { ok: false, error: "department, sceneId, images are required" },
      { status: 400 },
    );
  }

  try {
    const model = options?.useHighModel ? SCENE_MODEL_HIGH : SCENE_MODEL;
    let result = await analyzeWithModel(model, department, sceneId, images);

    if (!options?.useHighModel && needsHighModel(result)) {
      result = await analyzeWithModel(SCENE_MODEL_HIGH, department, sceneId, images);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[photo-scene-analyze]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
