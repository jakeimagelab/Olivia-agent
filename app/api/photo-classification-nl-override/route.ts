import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient, SCENE_MODEL, NL_OVERRIDE_SYSTEM_PROMPT, nlOverrideSchema, type NlOverrideOutput } from "@/lib/ai/openai";
import type { ClassificationOverrides } from "@/lib/photo-classifier/pattern-analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

type RequestBody = { message: string; context?: string };

function toOverrides(output: NlOverrideOutput): { overrides: ClassificationOverrides; granularity: "coarser" | "finer" | null } {
  const overrides: ClassificationOverrides = {};
  if (output.timeGapMode) overrides.timeGapMode = output.timeGapMode;
  if (typeof output.absoluteTimeGapMinutes === "number") overrides.absoluteTimeGapMinutes = output.absoluteTimeGapMinutes;
  if (output.locationSensitivity) overrides.locationSensitivity = output.locationSensitivity;
  if (output.personSensitivity) overrides.personSensitivity = output.personSensitivity;
  if (output.backgroundSensitivity) overrides.backgroundSensitivity = output.backgroundSensitivity;
  if (output.compositionSensitivity) overrides.compositionSensitivity = output.compositionSensitivity;
  if (typeof output.splitOnPersonChange === "boolean") overrides.splitOnPersonChange = output.splitOnPersonChange;
  if (typeof output.splitOnLocationChange === "boolean") overrides.splitOnLocationChange = output.splitOnLocationChange;
  if (typeof output.minSceneSize === "number") overrides.minSceneSize = output.minSceneSize;
  return { overrides, granularity: output.granularity };
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
  const message = (body?.message || "").trim();
  if (!message) return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: SCENE_MODEL,
      messages: [
        { role: "system", content: NL_OVERRIDE_SYSTEM_PROMPT },
        { role: "user", content: body.context ? `[이전 맥락]\n${body.context}\n\n[새 요청]\n${message}` : message },
      ],
      response_format: { type: "json_schema", json_schema: nlOverrideSchema },
      max_tokens: 300,
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed: NlOverrideOutput;
    try {
      parsed = JSON.parse(raw) as NlOverrideOutput;
    } catch {
      return NextResponse.json({ ok: false, error: "AI 응답을 해석하지 못했습니다." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ...toOverrides(parsed) });
  } catch (err) {
    console.error("[photo-classification-nl-override]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
