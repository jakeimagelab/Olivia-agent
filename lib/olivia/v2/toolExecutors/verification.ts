import type { OliviaToolVerification } from "@/lib/olivia/v2/types";

// 구조 개편(2026-08-31) §19 — verification 객체 생성/병합을 한 곳에서만 한다. helper를
// 과도하게 늘리지 않는다(스펙 명시) — 이 두 개면 모든 domain executor의 필요를 충족한다.
export function createVerification(partial: OliviaToolVerification = {}): OliviaToolVerification {
  return { verifiedAt: new Date().toISOString(), ...partial };
}

export function mergeVerification(
  base: OliviaToolVerification | undefined,
  patch: OliviaToolVerification,
): OliviaToolVerification {
  return {
    ...base,
    ...patch,
    details: base?.details || patch.details ? { ...base?.details, ...patch.details } : undefined,
    verifiedAt: patch.verifiedAt ?? base?.verifiedAt ?? new Date().toISOString(),
  };
}
