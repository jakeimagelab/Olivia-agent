import type { OliviaToolResult, OliviaToolVerification } from "@/lib/olivia/v2/types";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";

export type ToolExecutionMode = "read" | "mutation" | "approval" | "ui";

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

export function assertToolResultVerified(result: OliviaToolResult, mode: ToolExecutionMode) {
  if (!result.success || mode === "read" || mode === "ui") return;
  if (result.verification?.executed !== true) {
    throw new OliviaToolError("Olivia Tool 실행 여부를 검증하지 못했어요.", "VERIFICATION_FAILED", { mode, field: "executed" });
  }
  if (mode === "mutation" && result.verification.persisted !== true) {
    throw new OliviaToolError("Olivia가 실제 저장을 검증하지 못했어요.", "VERIFICATION_FAILED", { mode, field: "persisted" });
  }
  if (mode === "approval" && result.verification.persisted === true) {
    throw new OliviaToolError("승인 요청 Tool이 승인 전에 변경을 실행했어요.", "APPROVAL_MODE_VIOLATION", { mode, field: "persisted" });
  }
}
