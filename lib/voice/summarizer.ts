import { runHermesChat } from "@/lib/hermes/client";
import { extractVoiceSummary } from "@/lib/voice/processing";
import type { VoiceSummary } from "@/lib/voice/types";

const VOICE_SUMMARY_TIMEOUT_MS = 60_000;
const VOICE_HERMES_TIMEOUT_MS = 12_000;
const VOICE_TRANSCRIPT_MAX_CHARACTERS = 120_000;

export type VoiceSummaryProvider = "hermes" | "openai";

export type VoiceSummaryResult = {
  summary: VoiceSummary;
  provider: VoiceSummaryProvider;
};

export const VOICE_SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    key_points: { type: "array", items: { type: "string" } },
    action_items: { type: "array", items: { type: "string" } },
  },
  required: ["title", "summary", "key_points", "action_items"],
} as const;

function summaryInstructions() {
  return `Olivia 음성기록의 화자별 전사문을 정리한다.

원문에 없는 사실을 추가하거나 추측하지 않는다.
반복어와 불필요한 구어 표현만 정리하되 고유명사, 병원명, 사람 이름, 숫자, 가격, 날짜는 가능한 원문 그대로 유지한다.
summary는 전체 내용을 3~5문장으로 요약한다.
key_points에는 실제 대화의 핵심 내용만 넣는다.
action_items에는 대화에서 명확히 언급된 후속 행동만 넣고, 없으면 빈 배열을 반환한다.
이 작업은 자료 정리만 수행하며 고객, 일정, 할 일 또는 다른 Olivia 데이터를 조회하거나 변경하지 않는다.`;
}

function hermesPrompt(transcriptText: string) {
  return `${summaryInstructions()}

반드시 아래 JSON 하나만 출력한다.
{
  "title": "짧고 명확한 제목",
  "summary": "전체 내용을 3~5문장으로 요약",
  "key_points": ["핵심 내용"],
  "action_items": ["대화에서 실제로 언급된 후속 행동"]
}

[음성 기록]
${transcriptText.slice(0, VOICE_TRANSCRIPT_MAX_CHARACTERS)}`;
}

export function extractOpenAIResponseText(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const response = payload as Record<string, unknown>;
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";

  for (const item of response.output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object" || Array.isArray(part)) continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text) return text;
    }
  }
  return "";
}

async function organizeWithHermes(id: string, transcriptText: string): Promise<VoiceSummary> {
  const hermes = await runHermesChat({
    conversationId: `voice-recording:${id}`,
    message: hermesPrompt(transcriptText),
    signal: AbortSignal.timeout(VOICE_HERMES_TIMEOUT_MS),
    context: {
      recentActions: [],
      revision: 0,
      activeWorkspace: "voice-recorder",
      canEdit: false,
      canFinalize: false,
    },
  });
  if (hermes.toolCalls.length > 0) {
    throw new Error("음성 정리 과정에서 허용되지 않은 도구 호출이 감지됐습니다.");
  }
  return extractVoiceSummary(hermes.message);
}

async function organizeWithOpenAI(transcriptText: string): Promise<VoiceSummary> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VOICE_SUMMARY_MODEL?.trim()
        || process.env.OPENAI_MEMO_MODEL?.trim()
        || "gpt-4.1-mini",
      instructions: summaryInstructions(),
      input: transcriptText.slice(0, VOICE_TRANSCRIPT_MAX_CHARACTERS),
      text: {
        format: {
          type: "json_schema",
          name: "olivia_voice_summary",
          strict: true,
          schema: VOICE_SUMMARY_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(VOICE_SUMMARY_TIMEOUT_MS),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { error?: { message?: unknown } }).error?.message
      : undefined;
    throw new Error(typeof detail === "string" ? detail : `OpenAI 내용 정리 실패 (${response.status})`);
  }

  const output = extractOpenAIResponseText(payload);
  if (!output) throw new Error("OpenAI 내용 정리 응답이 비어 있습니다.");
  return extractVoiceSummary(output);
}

export async function summarizeVoiceRecording(id: string, transcriptText: string): Promise<VoiceSummaryResult> {
  try {
    return {
      summary: await organizeWithHermes(id, transcriptText),
      provider: "hermes",
    };
  } catch (hermesError) {
    console.warn("[VOICE SUMMARY HERMES FALLBACK]", hermesError);
  }

  try {
    return {
      summary: await organizeWithOpenAI(transcriptText),
      provider: "openai",
    };
  } catch (openAIError) {
    console.error("[VOICE SUMMARY OPENAI FALLBACK]", openAIError);
    throw new Error("AI 정리 서비스에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
}
