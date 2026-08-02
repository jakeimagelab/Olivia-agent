import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient, SCENE_MODEL, SCENE_MODEL_HIGH } from "@/lib/ai/openai";
import { getDepartmentConfig } from "@/lib/photo-classifier/departments";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

type ImageInput = { fileName: string; base64: string };
type BoundaryRequest = {
  department: MedicalDepartment;
  boundaryIndex: number;
  before: ImageInput[];
  after: ImageInput[];
  options?: { useHighModel?: boolean };
};

const enums = {
  location: ["consultation_room", "treatment_room", "laser_room", "procedure_room", "operating_room", "lobby", "corridor", "interior", "studio", "unknown"],
  equipment: ["laser_device", "lifting_device", "injection", "skin_care_device", "bed", "consultation_desk", "camera", "none", "unknown"],
  pose: ["standing", "sitting", "lying", "closeup", "unknown"],
  distance: ["wide", "full", "medium", "closeup", "macro", "unknown"],
  scene: ["profile", "consultation", "treatment", "skin_care", "interior", "etc"],
};

const boundarySchema = {
  name: "scene_boundary_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "peopleCount", "hasDoctor", "hasPatient", "hasStaff", "dominantPersonChanged", "personChangeConfidence",
      "locationType", "locationChanged", "locationChangeConfidence", "equipmentPresent", "equipmentCategory",
      "equipmentChanged", "equipmentChangeConfidence", "handpiecePresent", "syringePresent", "treatmentBedPresent",
      "consultationDeskPresent", "patientPose", "beforePatientPose", "afterPatientPose", "shotDistance",
      "beforeShotDistance", "afterShotDistance", "sceneType", "beforeSceneType", "afterSceneType",
      "sceneTypeChanged", "confidence", "reasons",
    ],
    properties: {
      peopleCount: { type: "integer", minimum: 0, maximum: 20 },
      hasDoctor: { type: "boolean" }, hasPatient: { type: "boolean" }, hasStaff: { type: "boolean" },
      dominantPersonChanged: { type: "boolean" }, personChangeConfidence: { type: "number", minimum: 0, maximum: 1 },
      locationType: { type: "string", enum: enums.location }, locationChanged: { type: "boolean" },
      locationChangeConfidence: { type: "number", minimum: 0, maximum: 1 }, equipmentPresent: { type: "boolean" },
      equipmentCategory: { type: "string", enum: enums.equipment }, equipmentChanged: { type: "boolean" },
      equipmentChangeConfidence: { type: "number", minimum: 0, maximum: 1 }, handpiecePresent: { type: "boolean" },
      syringePresent: { type: "boolean" }, treatmentBedPresent: { type: "boolean" }, consultationDeskPresent: { type: "boolean" },
      patientPose: { type: "string", enum: enums.pose }, beforePatientPose: { type: "string", enum: enums.pose },
      afterPatientPose: { type: "string", enum: enums.pose }, shotDistance: { type: "string", enum: enums.distance },
      beforeShotDistance: { type: "string", enum: enums.distance }, afterShotDistance: { type: "string", enum: enums.distance },
      sceneType: { type: "string", enum: enums.scene }, beforeSceneType: { type: "string", enum: enums.scene },
      afterSceneType: { type: "string", enum: enums.scene }, sceneTypeChanged: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 }, reasons: { type: "array", items: { type: "string" }, maxItems: 6 },
    },
  },
} as const;

function prompt(department: MedicalDepartment) {
  const config = getDepartmentConfig(department);
  const sceneGuide = config.sceneTypes
    .filter((rule) => rule.sceneType !== "etc")
    .map((rule) => `- ${rule.displayName}: ${rule.description} / 단서 ${rule.visualCues.join(", ")}`)
    .join("\n");
  return `당신은 병원 촬영의 Scene 경계를 판정합니다. BEFORE 사진 묶음과 AFTER 사진 묶음이 실제로 다른 촬영 장면인지 비교하세요.

진료과: ${config.displayName}
장면 참고:
${sceneGuide}

판정 우선순위:
1. 주요 환자 또는 의료진 그룹이 바뀌었는지
2. 상담실·시술실·레이저실 등 장소가 바뀌었는지
3. 대형 장비·핸드피스·주사기·베드·상담 데스크가 등장하거나 종류가 바뀌었는지
4. 상담에서 시술, 앉음에서 누움 같은 의미 전환인지
5. 단순한 와이드·클로즈업 또는 반대 방향 촬영인지

사람 이름이나 신원을 추측하지 마세요. 같은 사람인지 여부는 전후 그룹의 익명 시각적 연속성만 판단하세요.
같은 사람·장소·장비에서 구도만 바뀌었으면 changed 필드를 false로 유지하세요.
reasons는 경계 판단 이유를 짧은 한국어로 반환하세요.`;
}

async function analyze(body: BoundaryRequest, highModel: boolean) {
  const imageBlock = (side: "BEFORE" | "AFTER", images: ImageInput[]) => [
    { type: "text" as const, text: `${side} (${images.length}장)` },
    ...images.map((image) => ({
      type: "image_url" as const,
      image_url: { url: image.base64.startsWith("data:") ? image.base64 : `data:image/jpeg;base64,${image.base64}`, detail: "high" as const },
    })),
  ];
  const response = await getOpenAIClient().chat.completions.create({
    model: highModel ? SCENE_MODEL_HIGH : SCENE_MODEL,
    messages: [{ role: "system", content: prompt(body.department) }, {
      role: "user",
      content: [...imageBlock("BEFORE", body.before), ...imageBlock("AFTER", body.after)],
    }],
    response_format: { type: "json_schema", json_schema: boundarySchema },
    max_tokens: 900,
  });
  return JSON.parse(response.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
  let body: BoundaryRequest;
  try { body = await request.json() as BoundaryRequest; }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }
  if (!body.department || !Number.isInteger(body.boundaryIndex) || !Array.isArray(body.before) || !Array.isArray(body.after)
      || body.before.length === 0 || body.after.length === 0 || body.before.length > 5 || body.after.length > 5) {
    return NextResponse.json({ ok: false, error: "department, boundaryIndex, before, after are required" }, { status: 400 });
  }
  try {
    let analysis = await analyze(body, Boolean(body.options?.useHighModel));
    if (!body.options?.useHighModel && Number(analysis.confidence ?? 0) < 0.65) analysis = await analyze(body, true);
    return NextResponse.json({ ok: true, boundaryIndex: body.boundaryIndex, analysis });
  } catch (error) {
    console.error("[photo-scene-boundary-analyze]", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
