import type { AiTrustProviderKey, AiTrustProviderStatus } from "./types";

export type AiTrustProviderRequest = { question: string; region: string; department: string; model?: string };

export type AiTrustProviderResponse = {
  provider: AiTrustProviderKey;
  model: string;
  raw_response: string;
  citations: unknown[];
  source_urls: string[];
  input_tokens: number;
  output_tokens: number;
  web_search_count: number;
  reported_cost_usd?: number;
  request_parameters: Record<string, unknown>;
};

type JsonObject = Record<string, unknown>;
const REQUEST_TIMEOUT_MS = 60_000;
const PROVIDERS: Array<{ provider: AiTrustProviderKey; label: string; envKey: string; modelEnvKey: string }> = [
  { provider: "openai", label: "ChatGPT", envKey: "OPENAI_API_KEY", modelEnvKey: "AI_TRUST_OPENAI_MODEL" },
  { provider: "gemini", label: "Gemini", envKey: "GEMINI_API_KEY", modelEnvKey: "AI_TRUST_GEMINI_MODEL" },
  { provider: "anthropic", label: "Claude", envKey: "ANTHROPIC_API_KEY", modelEnvKey: "AI_TRUST_ANTHROPIC_MODEL" },
  { provider: "perplexity", label: "Perplexity", envKey: "PERPLEXITY_API_KEY", modelEnvKey: "AI_TRUST_PERPLEXITY_MODEL" },
];

function env(name: string) { return process.env[name]?.trim() || ""; }

export function getAiTrustProviderStatuses(): AiTrustProviderStatus[] {
  return PROVIDERS.map((item) => ({
    provider: item.provider,
    label: item.label,
    status: env(item.envKey) ? "CONNECTED" : "NOT_CONNECTED",
    envKey: item.envKey,
    note: env(item.envKey) ? "연결됨" : "키 없음",
  }));
}

export function getAiTrustModel(provider: AiTrustProviderKey, configuredModel?: string) {
  const definition = PROVIDERS.find((item) => item.provider === provider);
  const model = configuredModel?.trim() || (definition ? env(definition.modelEnvKey) : "");
  if (!model) throw new Error(`${definition?.modelEnvKey || "AI model"} 설정이 필요합니다.`);
  return model;
}

export async function runAiTrustProvider(provider: AiTrustProviderKey, request: AiTrustProviderRequest): Promise<AiTrustProviderResponse> {
  if (provider === "openai") return runOpenAI(request);
  if (provider === "gemini") return runGemini(request);
  if (provider === "anthropic") return runAnthropic(request);
  if (provider === "perplexity") return runPerplexity(request);
  throw new Error(`지원하지 않는 Provider입니다: ${provider}`);
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" }); }
  finally { clearTimeout(timer); }
}

async function runOpenAI(request: AiTrustProviderRequest): Promise<AiTrustProviderResponse> {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY가 없습니다.");
  const model = getAiTrustModel("openai", request.model);
  const location = { country: "KR", city: "Seoul", region: "Seoul", timezone: "Asia/Seoul" };
  const requestParameters = { web_search: true, tool_choice: "required", user_location: location };
  const res = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: request.question.trim(),
      tools: [{ type: "web_search", user_location: { type: "approximate", ...location } }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      store: false,
    }),
  });
  const data = await readJsonOrThrow(res, "OpenAI");
  const output = Array.isArray(data.output) ? data.output as JsonObject[] : [];
  const parts = output.flatMap((item) => item.type === "message" && Array.isArray(item.content) ? item.content as JsonObject[] : []);
  const raw = parts.map((part) => typeof part.text === "string" ? part.text : "").filter(Boolean).join("\n");
  const annotations = parts.flatMap((part) => Array.isArray(part.annotations) ? part.annotations : []);
  const searchSources = output.flatMap((item) => {
    const action = item.action as JsonObject | undefined;
    return item.type === "web_search_call" && Array.isArray(action?.sources) ? action.sources : [];
  });
  return {
    provider: "openai", model: String(data.model || model), raw_response: raw,
    citations: [...annotations, ...searchSources],
    source_urls: uniqueUrls([...annotations.map((item) => (item as JsonObject)?.url), ...searchSources.map((item) => (item as JsonObject)?.url), ...extractUrls(raw)]),
    input_tokens: numberValue((data.usage as JsonObject | undefined)?.input_tokens),
    output_tokens: numberValue((data.usage as JsonObject | undefined)?.output_tokens),
    web_search_count: output.filter((item) => item.type === "web_search_call").length,
    request_parameters: requestParameters,
  };
}

async function runGemini(request: AiTrustProviderRequest): Promise<AiTrustProviderResponse> {
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY가 없습니다.");
  const model = getAiTrustModel("gemini", request.model);
  const requestParameters = {
    google_search: true,
    explicit_location: false,
    location_note: "Gemini Google Search 요청에는 별도 사용자 위치 필드를 보내지 않으며 질문의 지역어를 사용",
  };
  const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: request.question.trim() }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
    }),
  });
  const data = await readJsonOrThrow(res, "Gemini");
  const candidate = Array.isArray(data.candidates) ? data.candidates[0] as JsonObject | undefined : undefined;
  const parts = Array.isArray((candidate?.content as JsonObject | undefined)?.parts) ? (candidate?.content as JsonObject).parts as JsonObject[] : [];
  const raw = parts.map((part) => typeof part.text === "string" ? part.text : "").filter(Boolean).join("\n");
  const grounding = (candidate?.groundingMetadata || {}) as JsonObject;
  const chunks = Array.isArray(grounding.groundingChunks) ? grounding.groundingChunks as JsonObject[] : [];
  const searchQueries = Array.isArray(grounding.webSearchQueries) ? grounding.webSearchQueries : [];
  return {
    provider: "gemini", model, raw_response: raw, citations: chunks,
    source_urls: uniqueUrls([...chunks.map((chunk) => (chunk.web as JsonObject | undefined)?.uri), ...extractUrls(raw)]),
    input_tokens: numberValue((data.usageMetadata as JsonObject | undefined)?.promptTokenCount),
    output_tokens: numberValue((data.usageMetadata as JsonObject | undefined)?.candidatesTokenCount),
    web_search_count: searchQueries.length || (chunks.length ? 1 : 0), request_parameters: requestParameters,
  };
}

async function runAnthropic(request: AiTrustProviderRequest): Promise<AiTrustProviderResponse> {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY가 없습니다.");
  const model = getAiTrustModel("anthropic", request.model);
  const location = { country: "KR", city: "Seoul", region: "Seoul", timezone: "Asia/Seoul" };
  const requestParameters = { web_search: true, tool_version: "web_search_20250305", user_location: location };
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 1200, temperature: 0.2,
      messages: [{ role: "user", content: request.question.trim() }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5, user_location: { type: "approximate", ...location } }],
    }),
  });
  const data = await readJsonOrThrow(res, "Anthropic");
  const content = Array.isArray(data.content) ? data.content as JsonObject[] : [];
  const raw = content.filter((item) => item.type === "text").map((item) => String(item.text || "")).join("\n");
  const citations = content.flatMap((item) => Array.isArray(item.citations) ? item.citations : []);
  const usage = (data.usage || {}) as JsonObject;
  const serverToolUse = (usage.server_tool_use || {}) as JsonObject;
  return {
    provider: "anthropic", model: String(data.model || model), raw_response: raw, citations,
    source_urls: uniqueUrls([...citations.map((item) => (item as JsonObject)?.url), ...extractUrls(raw)]),
    input_tokens: numberValue(usage.input_tokens),
    output_tokens: numberValue(usage.output_tokens),
    web_search_count: numberValue(serverToolUse.web_search_requests)
      || content.filter((item) => item.type === "server_tool_use" && item.name === "web_search").length,
    request_parameters: requestParameters,
  };
}

async function runPerplexity(request: AiTrustProviderRequest): Promise<AiTrustProviderResponse> {
  const apiKey = env("PERPLEXITY_API_KEY");
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY가 없습니다.");
  const model = getAiTrustModel("perplexity", request.model);
  const requestParameters = {
    api: "Agent API",
    web_search: true,
    explicit_location: false,
    location_note: "Perplexity Agent API 요청에는 별도 사용자 위치 필드를 보내지 않으며 질문의 지역어를 사용",
  };
  const res = await fetchWithTimeout("https://api.perplexity.ai/v1/agent", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input: request.question.trim(),
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      language_preference: "ko",
    }),
  });
  const data = await readJsonOrThrow(res, "Perplexity");
  const output = Array.isArray(data.output) ? data.output as JsonObject[] : [];
  const messageParts = output.flatMap((item) => item.type === "message" && Array.isArray(item.content) ? item.content as JsonObject[] : []);
  const raw = messageParts.map((item) => typeof item.text === "string" ? item.text : "").filter(Boolean).join("\n") || String(data.output_text || "");
  const searchResults = output.flatMap((item) => item.type === "search_results" && Array.isArray(item.results) ? item.results as JsonObject[] : []);
  const annotations = messageParts.flatMap((item) => Array.isArray(item.annotations) ? item.annotations : []);
  const usage = (data.usage || {}) as JsonObject;
  const usageCost = (usage.cost || {}) as JsonObject;
  return {
    provider: "perplexity", model: String(data.model || model), raw_response: raw, citations: [...annotations, ...searchResults],
    source_urls: uniqueUrls([...annotations.map((item) => (item as JsonObject)?.url), ...searchResults.map((item) => item.url), ...extractUrls(raw)]),
    input_tokens: numberValue(usage.input_tokens),
    output_tokens: numberValue(usage.output_tokens),
    web_search_count: output.filter((item) => item.type === "search_results").length, request_parameters: requestParameters,
    reported_cost_usd: positiveNumberOrUndefined(usageCost.total_cost),
  };
}

async function readJsonOrThrow(res: Response, provider: string): Promise<JsonObject> {
  const data = await res.json().catch(() => ({})) as JsonObject;
  if (!res.ok) {
    const detail = data.error as JsonObject | undefined;
    const message = typeof detail?.message === "string" ? detail.message : `${provider} 요청 실패 (${res.status})`;
    const error = new Error(message) as Error & { retryable?: boolean; status?: number };
    error.status = res.status;
    error.retryable = res.status === 429 || res.status >= 500;
    throw error;
  }
  return data;
}

function numberValue(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function positiveNumberOrUndefined(value: unknown) {
  const number = numberValue(value);
  return number >= 0 && typeof value === "number" ? number : undefined;
}
function extractUrls(text: string) { return text.match(/https?:\/\/[^\s)\]]+/g) || []; }
function uniqueUrls(values: unknown[]) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && /^https?:\/\//.test(value))));
}
