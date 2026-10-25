import type { ShootType } from "@/lib/shootSetup/rules";

export type ContiShotType = ShootType | "video";

const ALLOWED = new Set<ContiShotType>(["scene", "group", "profile", "interior", "video"]);

export function isContiShotType(value: unknown): value is ContiShotType {
  return typeof value === "string" && ALLOWED.has(value as ContiShotType);
}

export function inferContiShotType(input: { name?: string | null; groupName?: string | null }): ShootType {
  const text = `${input.groupName ?? ""} ${input.name ?? ""}`;
  if (/단체|하모니/.test(text)) return "group";
  if (/프로필/.test(text)) return "profile";
  if (/인테리어|공간|외관/.test(text)) return "interior";
  return "scene";
}

export function resolveContiShotType(input: { shotType?: unknown; name?: string | null; groupName?: string | null }): ContiShotType {
  return isContiShotType(input.shotType) ? input.shotType : inferContiShotType(input);
}
