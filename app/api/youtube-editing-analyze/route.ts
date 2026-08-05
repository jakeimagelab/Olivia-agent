import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  CAMERA_OPTIONS, CAPTION_APPEARS, CAPTION_POSITIONS, CAPTION_TYPES,
  SOUND_EFFECT_OPTIONS, TEMPLATE_OPTIONS, TRANSITION_OPTIONS, VISUAL_LAYOUTS, VISUAL_STYLES, VISUAL_TYPES,
  defaultCaptionConfig, defaultVisualConfig, estimateDurationSec, splitScriptIntoSentences,
} from "@/lib/youtube-editing/constants";
import type { AiSegmentSuggestion } from "@/lib/youtube-editing/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `너는 병원 유튜브 영상 대본을 편집 콘티로 분석하는 도구야. 문장(또는 의미 단위)마다
카메라, 자막, 자료화면, 효과음, 전환 효과, 디자인 템플릿을 추천해.

규칙:
1. 원장 출연 화면(카메라가 A캠/B캠인 구간)은 전체의 60~75%를 유지한다.
2. 모든 문장에 자료화면을 넣지 않는다.
3. 같은 자료 유형이 연속되지 않도록 한다.
4. 훅, 비유, 어려운 개념, 숫자, 단계 설명에는 자료화면을 우선 추천한다.
5. 신뢰와 감정이 중요한 구간은 원장 얼굴을 유지한다.
6. A캠/B캠 전환은 문장마다 하지 않고 의미 단락 단위로 추천한다.
7. 효과 자막은 전체 문장의 15~25% 정도만 추천한다.
8. 효과음은 훅과 핵심 강조 구간에만 제한한다.
9. 의료 효과를 단정하거나 보장하는 문구를 추가하지 않는다.
10. 사용자가 실제 편집할 수 있는 구체적인 추천만 반환한다.
11. 각 추천에는 짧은 이유(aiReason)를 포함한다.
12. 결과는 아래 JSON 형식만 반환하고 다른 설명은 붙이지 마.

각 문장은 입력에서 번호로 주어진 순서를 그대로 유지해.

{"segments": [{
  "order": number,
  "text": "그 문장 원문",
  "estimatedDurationSec": number,
  "camera": ["A캠 정면" 등 배열, 1개 이상],
  "caption": {"type": "기본 자막|효과 자막|키워드 강조|자막 없음", "text": "효과 자막이면 표시 문구", "appear": "기본|팝업|확대|페이드", "position": "상단|중앙|하단"},
  "visual": {"enabled": boolean, "type": "이미지 자료 등", "description": "자료 설명", "layout": "전체 화면|좌우 분할|PIP|원형 확대", "style": "실사 사진|의료 일러스트|인포그래픽|의료 모식도|스타일 일러스트|영상 B-roll"},
  "soundEffect": "없음|팝|우시|임팩트|긴장감|타이핑|알림|기타",
  "transition": "컷|디졸브|줌인|줌아웃|흑백|흔들림|블러|없음",
  "template": "없음|질환 4분할|원인 구조도|핵심 문장 카드|강조 박스|단계형 프로세스|순환 구조|비교 화면",
  "editingNote": "간단한 편집 메모",
  "aiReason": "이 추천을 한 짧은 이유",
  "confidence": 0~1 사이 숫자
}]}`;

function coerceEnum<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

function normalizeSegment(raw: any, index: number, fallbackText: string): AiSegmentSuggestion {
  const text = typeof raw?.text === "string" && raw.text.trim() ? raw.text.trim() : fallbackText;
  const camera = Array.isArray(raw?.camera)
    ? raw.camera.filter((value: unknown) => typeof value === "string" && (CAMERA_OPTIONS as readonly string[]).includes(value))
    : [];
  const rawCaption = raw?.caption ?? {};
  const rawVisual = raw?.visual ?? {};
  return {
    order: typeof raw?.order === "number" ? raw.order : index,
    text,
    estimatedDurationSec: typeof raw?.estimatedDurationSec === "number" ? raw.estimatedDurationSec : estimateDurationSec(text),
    camera: camera.length ? camera : ["A캠 정면"],
    caption: {
      ...defaultCaptionConfig(),
      type: coerceEnum(rawCaption.type, CAPTION_TYPES, "기본 자막"),
      text: typeof rawCaption.text === "string" ? rawCaption.text : "",
      appear: coerceEnum(rawCaption.appear, CAPTION_APPEARS, "기본"),
      position: coerceEnum(rawCaption.position, CAPTION_POSITIONS, "하단"),
    },
    visual: {
      ...defaultVisualConfig(),
      enabled: Boolean(rawVisual.enabled),
      type: coerceEnum(rawVisual.type, VISUAL_TYPES, "자료 없음"),
      description: typeof rawVisual.description === "string" ? rawVisual.description : "",
      layout: coerceEnum(rawVisual.layout, VISUAL_LAYOUTS, "전체 화면"),
      style: coerceEnum(rawVisual.style, VISUAL_STYLES, "실사 사진"),
    },
    soundEffect: coerceEnum(raw?.soundEffect, SOUND_EFFECT_OPTIONS, "없음"),
    transition: coerceEnum(raw?.transition, TRANSITION_OPTIONS, "컷"),
    template: coerceEnum(raw?.template, TEMPLATE_OPTIONS, "없음"),
    editingNote: typeof raw?.editingNote === "string" ? raw.editingNote : "",
    aiReason: typeof raw?.aiReason === "string" ? raw.aiReason : "",
    confidence: typeof raw?.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.6,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    title?: string; hospitalName?: string; fullScript?: string; videoRatio?: string; preferredTone?: string;
  } | null;
  const fullScript = body?.fullScript?.trim();
  if (!fullScript) return NextResponse.json({ ok: false, error: "대본이 없습니다." }, { status: 400 });

  const sentences = splitScriptIntoSentences(fullScript);
  const numbered = sentences.map((text, index) => `${index}. ${text}`).join("\n");
  const userMessage = `제목: ${body?.title ?? ""}
병원명: ${body?.hospitalName ?? ""}
영상 비율: ${body?.videoRatio ?? "16:9"}
선호 톤: ${body?.preferredTone ?? ""}

번호가 매겨진 문장 목록(이 순서와 개수를 그대로 유지해서 각 문장마다 하나씩 분석해):
${numbered}`;

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const raw = res.content[0].type === "text" ? res.content[0].text : "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { segments: [] };
    const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
    const segments = sentences.map((text, index) => normalizeSegment(rawSegments[index], index, text));
    return NextResponse.json({ ok: true, segments });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "AI 분석 실패" }, { status: 500 });
  }
}
