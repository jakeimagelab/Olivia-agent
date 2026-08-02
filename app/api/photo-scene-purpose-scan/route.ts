import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient, SCENE_MODEL } from "@/lib/ai/openai";
import { getDepartmentConfig } from "@/lib/photo-classifier/departments";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ImageInput = { fileName: string; base64: string; index: number };
type RequestBody = {
  department: MedicalDepartment;
  images: ImageInput[];
};

const PURPOSE_ENUM = ["profile", "consultation", "treatment", "skin_care", "interior", "etc"] as const;

const purposeScanSchema = {
  name: "purpose_scan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["labels"],
    properties: {
      labels: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["index", "purpose", "confidence", "reason"],
          properties: {
            index: { type: "integer" },
            purpose: { type: "string", enum: PURPOSE_ENUM },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reason: { type: "string" },
          },
        },
      },
    },
  },
} as const;

function prompt(department: MedicalDepartment, indices: number[]): string {
  const config = getDepartmentConfig(department);
  const sceneGuide = config.sceneTypes
    .filter((rule) => rule.sceneType !== "etc")
    .map((rule) => `- ${rule.sceneType} (${rule.displayName}): ${rule.description} | 단서: ${rule.visualCues.join(", ")}`)
    .join("\n");
  return `당신은 병원 촬영 현장에서 하나의 임시 Scene(같은 시간대 묶음) 안에 촬영목적이 바뀌는 구간이
있는지 찾는 전문가입니다. 아래 이미지들은 index 순서(촬영 시간순)대로 제공됩니다.
각 이미지마다 촬영목적을 딱 하나씩 판정하세요.

진료과: ${config.displayName}
장면 참고:
${sceneGuide}

카테고리는 profile/consultation/treatment/skin_care/interior/etc 6개뿐입니다.
프로필 여부를 가장 먼저 검토하세요 — 사람 1명 이상(단독이든 여러 명이든 무관) + 환자 없음 +
카메라를 의식한 포즈 + 시술/상담/의료행위 행동이 없으면 profile입니다.

이미지 순서(index): ${indices.join(", ")}
labels 배열에는 위 index 각각에 대해 정확히 하나씩, 총 ${indices.length}개를 반환하세요.
목적이 애매하면 확신도를 낮게, 그래도 가장 근접한 카테고리로 답하세요.`;
}

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 500 });
  let body: RequestBody;
  try { body = await request.json() as RequestBody; }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  if (!body.department || !Array.isArray(body.images) || body.images.length === 0 || body.images.length > 30) {
    return NextResponse.json({ ok: false, error: "department, images(1~30장)가 필요합니다" }, { status: 400 });
  }

  const indices = body.images.map((image) => image.index);
  const imageContent = body.images.map((image) => ({
    type: "image_url" as const,
    image_url: {
      url: image.base64.startsWith("data:") ? image.base64 : `data:image/jpeg;base64,${image.base64}`,
      detail: "low" as const,
    },
  }));

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: SCENE_MODEL,
      messages: [{
        role: "user",
        content: [...imageContent, { type: "text", text: prompt(body.department, indices) }],
      }],
      response_format: { type: "json_schema", json_schema: purposeScanSchema },
      max_tokens: 200 * body.images.length,
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed: { labels?: { index: number; purpose: string; confidence: number; reason: string }[] };
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    return NextResponse.json({ ok: true, labels: parsed.labels ?? [] });
  } catch (error) {
    console.error("[photo-scene-purpose-scan]", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
