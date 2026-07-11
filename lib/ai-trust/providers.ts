import type { AiTrustProviderStatus } from "./types";

export type AiTrustProviderRequest = {
  question: string;
  region: string;
  department: string;
};

export type AiTrustProviderResponse = {
  provider: string;
  model: string;
  raw_response: string;
  citations: unknown[];
  source_urls: string[];
};

export function getAiTrustProviderStatuses(): AiTrustProviderStatus[] {
  return [
    {
      provider: "openai",
      label: "OpenAI",
      status: process.env.OPENAI_API_KEY ? "CONNECTED" : "NOT_CONNECTED",
      envKey: "OPENAI_API_KEY",
      note: "MVP 1차 실행 Provider",
    },
    {
      provider: "gemini",
      label: "Gemini",
      status: process.env.GEMINI_API_KEY ? "CONNECTED" : "NOT_CONNECTED",
      envKey: "GEMINI_API_KEY",
      note: "MVP 1차 실행 Provider",
    },
    {
      provider: "anthropic",
      label: "Claude",
      status: process.env.ANTHROPIC_API_KEY ? "CONNECTED" : "NOT_CONNECTED",
      envKey: "ANTHROPIC_API_KEY",
      note: "2차 연결 대상. 인터페이스 준비",
    },
    {
      provider: "perplexity",
      label: "Perplexity",
      status: process.env.PERPLEXITY_API_KEY ? "CONNECTED" : "NOT_CONNECTED",
      envKey: "PERPLEXITY_API_KEY",
      note: "2차 연결 대상. 인터페이스 준비",
    },
  ];
}

export async function runAiTrustProvider(
  provider: string,
  request: AiTrustProviderRequest,
): Promise<AiTrustProviderResponse> {
  if (provider === "openai") return runOpenAI(request);
  if (provider === "gemini") return runGemini(request);
  throw new Error(`${provider} provider is not enabled for MVP execution`);
}

async function runOpenAI(request: AiTrustProviderRequest): Promise<AiTrustProviderResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const model = process.env.AI_TRUST_OPENAI_MODEL || "gpt-4.1-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "너는 현재 AI 검색/추천 환경에서 병원이 어떻게 추천되는지 확인하는 감사 도구다. 병원명을 추천할 때는 가능한 한 실제 병원명과 근거 출처를 함께 제시하되, 모르면 모른다고 답한다. 의료효과를 과장하지 않는다.",
        },
        {
          role: "user",
          content: `지역: ${request.region}\n진료과: ${request.department}\n질문: ${request.question}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 900,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI request failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  return {
    provider: "openai",
    model,
    raw_response: raw,
    citations: [],
    source_urls: extractUrls(raw),
  };
}

async function runGemini(request: AiTrustProviderRequest): Promise<AiTrustProviderResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const model = process.env.AI_TRUST_GEMINI_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "너는 현재 AI 검색/추천 환경에서 병원이 어떻게 추천되는지 확인하는 감사 도구다. 병원명을 추천할 때는 가능한 한 실제 병원명과 근거 출처를 함께 제시하되, 모르면 모른다고 답한다. 의료효과를 과장하지 않는다.\n\n" +
                `지역: ${request.region}\n진료과: ${request.department}\n질문: ${request.question}`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 900 },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini request failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = (data.candidates?.[0]?.content?.parts || []).map((part: { text?: string }) => part.text || "").join("\n");
  return {
    provider: "gemini",
    model,
    raw_response: raw,
    citations: data.candidates?.[0]?.citationMetadata?.citationSources || [],
    source_urls: extractUrls(raw),
  };
}

function extractUrls(text: string) {
  return Array.from(new Set(text.match(/https?:\/\/[^\s)\]]+/g) || []));
}
