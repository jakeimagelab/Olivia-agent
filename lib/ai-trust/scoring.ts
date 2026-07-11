export type AiTrustScoreInput = {
  evidenceCount: number;
  sourceDiversity: number;
  sourceReliability: number;
  consistency: "LOW" | "MEDIUM" | "HIGH";
  freshness: number;
  recommendationCorrelation: number;
};

export function calculateAiTrustScore(input: AiTrustScoreInput) {
  const breakdown = [
    { label: "Evidence Count", value: Math.min(input.evidenceCount * 8, 28) },
    { label: "Source Diversity", value: Math.min(input.sourceDiversity * 7, 21) },
    { label: "Source Reliability", value: Math.min(input.sourceReliability, 18) },
    { label: "Information Consistency", value: input.consistency === "HIGH" ? 15 : input.consistency === "MEDIUM" ? 8 : 0 },
    { label: "Freshness", value: Math.min(input.freshness, 10) },
    { label: "Recommendation Correlation", value: Math.min(input.recommendationCorrelation, 8) },
  ];
  const score = Math.max(0, Math.min(100, breakdown.reduce((sum, item) => sum + item.value, 0)));
  return { score, breakdown };
}
