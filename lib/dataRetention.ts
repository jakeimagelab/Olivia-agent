export type RetentionAsset = "original" | "retouched";
export type RetentionMilestone = "30d" | "7d" | "expired";

export const RETENTION_POLICY = {
  original: { label: "원본", years: 1 },
  retouched: { label: "보정본", years: 3 },
} as const;

export function addYearsIso(base: Date, years: number) {
  const next = new Date(base);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next.toISOString();
}

export function getRetentionMilestone(expiresAt: string, now = new Date()): RetentionMilestone | null {
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return null;
  const days = Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return "expired";
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  return null;
}

export function retentionTaskType(asset: RetentionAsset, milestone: RetentionMilestone) {
  return `data_retention_${asset}_${milestone}`;
}

export function retentionMessage(asset: RetentionAsset, milestone: RetentionMilestone, expiresAt: string) {
  const label = RETENTION_POLICY[asset].label;
  const date = new Date(expiresAt).toLocaleDateString("ko-KR");
  if (milestone === "expired") return `${label} 보관 기한이 만료되었습니다. 백업 또는 삭제 여부를 확인하세요.`;
  const days = milestone === "7d" ? 7 : 30;
  return `${label} 보관 기한이 ${days}일 이내입니다. (${date}) 고객 안내와 백업 여부를 확인하세요.`;
}
