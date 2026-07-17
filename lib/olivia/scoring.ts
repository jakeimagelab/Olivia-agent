export type OliviaScoreInput = {
  urgencyScore: number;
  impactScore: number;
  customerRiskScore?: number;
  revenueScore?: number;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

export function calculatePriorityScore(input: OliviaScoreInput) {
  return Math.round(
    clamp(input.urgencyScore) * 0.35
      + clamp(input.impactScore) * 0.3
      + clamp(input.customerRiskScore ?? 0) * 0.2
      + clamp(input.revenueScore ?? 0) * 0.15,
  );
}

export function getPriorityLevel(score: number): "urgent" | "high" | "normal" | "low" {
  if (score >= 80) return "urgent";
  if (score >= 60) return "high";
  if (score >= 40) return "normal";
  return "low";
}

export function getNotificationPolicy(score: number): "immediate" | "daily" | "weekly" | "record_only" {
  if (score >= 80) return "immediate";
  if (score >= 60) return "daily";
  if (score >= 40) return "weekly";
  return "record_only";
}
