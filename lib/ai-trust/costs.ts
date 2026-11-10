import type { AiTrustProviderKey } from "./types";

export type ProviderPricing = {
  input_per_million: number;
  output_per_million: number;
  web_search: number;
};

export type PricingTable = Record<AiTrustProviderKey, ProviderPricing>;

export const EMPTY_PRICING: PricingTable = {
  openai: { input_per_million: 0, output_per_million: 0, web_search: 0 },
  gemini: { input_per_million: 0, output_per_million: 0, web_search: 0 },
  anthropic: { input_per_million: 0, output_per_million: 0, web_search: 0 },
  perplexity: { input_per_million: 0, output_per_million: 0, web_search: 0 },
};

/**
 * Schema seed and pre-schema preview fallback.
 * Token rates are conservative planning values for the model configured by the
 * operator; the settings table remains the source of truth. Tool rates follow
 * the official provider price pages checked on 2026-11-11. Perplexity's Agent
 * API reported total cost supersedes this estimate in the ledger.
 */
export const DEFAULT_PRICING: PricingTable = {
  openai: { input_per_million: 4, output_per_million: 20, web_search: 0.01 },
  gemini: { input_per_million: 2, output_per_million: 12, web_search: 0.014 },
  anthropic: { input_per_million: 2, output_per_million: 10, web_search: 0.01 },
  perplexity: { input_per_million: 1, output_per_million: 5, web_search: 0.01 },
};

export function calculateAiTrustCost(input: {
  inputTokens: number;
  outputTokens: number;
  webSearchCount: number;
  pricing: ProviderPricing;
}) {
  const tokenCost = input.inputTokens / 1_000_000 * input.pricing.input_per_million
    + input.outputTokens / 1_000_000 * input.pricing.output_per_million;
  return roundUsd(tokenCost + input.webSearchCount * input.pricing.web_search);
}

export function estimateAiTrustRunCost(input: {
  requestCount: number;
  providers: AiTrustProviderKey[];
  pricing: PricingTable;
}) {
  if (!input.providers.length) return 0;
  const perRequest = input.providers.reduce((sum, provider) => {
    const price = input.pricing[provider] || EMPTY_PRICING[provider];
    return sum + (price.input_per_million * 800 + price.output_per_million * 1000) / 1_000_000 + price.web_search;
  }, 0) / input.providers.length;
  return roundUsd(input.requestCount * perRequest);
}

function roundUsd(value: number) { return Math.round(value * 1_000_000) / 1_000_000; }

