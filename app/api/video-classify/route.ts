import { NextRequest, NextResponse } from "next/server";
import { openai, SCENE_MODEL } from "@/lib/ai/openai";
import { VIDEO_CATEGORY_ORDER, type VideoCategory } from "@/lib/video-classifier/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type FrameInput = { fileName: string; base64: string };
type RequestBody = { frames: FrameInput[] };

const SYSTEM_PROMPT =
  "너는 병원, 피부과, 웰니스 촬영 영상의 대표 프레임을 보고 영상을 분류하는 전문가다. " +
  "파일명은 절대 고려하지 말고 이미지 내용만 보고 판단한다. " +
  "반드시 JSON 객체 하나만 응답한다. 마크다운, 코드블록, 추가 설명은 금지한다.";

const USER_PROMPT = `아래 기준으로 영상 하나를 정확히 분류해라. 여러 프레임은 같은 영상에서 균등 추출된 대표 프레임이다.

분류 기준:
1. SPACE_ONLY = 01_공간만_있는_영상
- 사람이 거의 없거나, 사람이 있어도 주제가 공간인 영상
- 로비, 복도, 상담실, 시술실, 병실, 인테리어, 조명, 가구, 공간 동선
- 병원 공간 스케치 영상

2. PEOPLE_CONSULTING = 02_사람있음_상담대화중심
- 사람이 등장하고 상담/대화/설명/안내 느낌이 중심인 영상
- 의료진 또는 직원이 고객/환자와 마주 앉거나 설명하는 장면
- 시술보다 커뮤니케이션이 핵심인 영상

3. TREATMENT_SCENE = 03_진료시술_연출영상
- 진료, 시술, 케어, 검사 장면이 중심인 영상
- 고객/환자가 누워 있거나 앉아 있고 의료진이 직접 케어/시술/검사하는 장면
- 장비 사용, 얼굴/피부 체크, 시술 준비 포함
- 단, 아주 가까운 클로즈업이 중심이면 CLOSEUP_DETAIL로 분류

4. CLOSEUP_DETAIL = 04_얼굴손장비_클로즈업
- 얼굴, 피부, 손, 장비, 소품, 기구, 문패, 조명 등 디테일이 크게 보이는 영상
- 전체 상황보다 부분 디테일이 중심인 영상
- 피부 클로즈업, 손동작, 장비 끝부분, 얼굴 시술 부위 클로즈업 포함
- 사람의 얼굴(표정)이 화면에 보이지 않고 손이나 특정 신체 부위·장비만 보이는 영상은 상담/시술 상황이라도 무조건 CLOSEUP_DETAIL로 분류

5. NEED_CHECK = 99_확인필요
- AI 판단이 애매하거나 위 4개 중 하나로 분류하기 어려운 경우

중요한 분류 우선순위:
1. 화면이 공간 중심이면 사람이 조금 보여도 SPACE_ONLY
2. 얼굴이 보이지 않고 손/특정 부위/장비만 화면에 보이면 다른 조건과 상관없이 CLOSEUP_DETAIL
3. 사람끼리 마주보고 대화/설명하는 느낌이면 PEOPLE_CONSULTING
4. 환자가 누워 있거나 의료진이 시술/케어/검사를 하는 장면이면 TREATMENT_SCENE
5. 얼굴, 피부, 손, 장비, 소품, 문패처럼 부분 디테일이 크게 보이면 CLOSEUP_DETAIL
6. 애매하면 NEED_CHECK

반드시 아래 JSON 형식으로만 응답:
{
  "category": "SPACE_ONLY | PEOPLE_CONSULTING | TREATMENT_SCENE | CLOSEUP_DETAIL | NEED_CHECK",
  "category_ko": "한글 분류명",
  "confidence": 0.0,
  "scene_description": "영상 장면 설명",
  "reason": "왜 이 분류인지 설명"
}`;

const videoClassificationSchema = {
  name: "video_classification",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["category", "category_ko", "confidence", "scene_description", "reason"],
    properties: {
      category: { type: "string", enum: VIDEO_CATEGORY_ORDER as string[] },
      category_ko: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      scene_description: { type: "string" },
      reason: { type: "string" },
    },
  },
};

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

  const { frames } = body;
  if (!Array.isArray(frames) || frames.length === 0) {
    return NextResponse.json({ ok: false, error: "frames are required" }, { status: 400 });
  }

  const imageContent = frames.map((frame) => ({
    type: "image_url" as const,
    image_url: {
      url: frame.base64.startsWith("data:") ? frame.base64 : `data:image/jpeg;base64,${frame.base64}`,
      detail: "low" as const,
    },
  }));

  try {
    const response = await openai.chat.completions.create({
      model: SCENE_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: [...imageContent, { type: "text" as const, text: USER_PROMPT }] },
      ],
      response_format: {
        type: "json_schema",
        json_schema: videoClassificationSchema,
      },
      max_tokens: 500,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = {};
    }

    const category: VideoCategory = VIDEO_CATEGORY_ORDER.includes(parsed.category as VideoCategory)
      ? (parsed.category as VideoCategory)
      : "NEED_CHECK";
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;

    return NextResponse.json({
      ok: true,
      category,
      categoryKo: (parsed.category_ko as string) || "",
      confidence,
      sceneDescription: (parsed.scene_description as string) || "",
      reason: (parsed.reason as string) || "",
    });
  } catch (err) {
    console.error("[video-classify]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
