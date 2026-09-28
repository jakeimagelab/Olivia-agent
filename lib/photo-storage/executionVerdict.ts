export type ExecutionVerdict = "started" | "not_started" | "unknown";

export type ProjectProbe = { found: boolean; updatedAt?: string | null };

export function resolveTimeoutVerdict(input: {
  requestedAt: string;
  probe: ProjectProbe | null;
  lookupFailed: boolean;
}): ExecutionVerdict {
  if (input.lookupFailed) return "unknown";
  if (!input.probe?.found) return "not_started";
  const updatedAt = input.probe.updatedAt;
  // 갱신 시각을 모르면 "있으니 시작됐다"고 단정하지 않는다. 이전 실행일 수 있다.
  if (!updatedAt) return "unknown";
  const updated = Date.parse(updatedAt);
  const requested = Date.parse(input.requestedAt);
  if (!Number.isFinite(updated) || !Number.isFinite(requested)) return "unknown";
  return updated >= requested ? "started" : "not_started";
}

export type FailureContext =
  | { kind: "certain" }
  | { kind: "timeout"; verdict: ExecutionVerdict };

// "원본은 변경하지 않았어요"는 실행되지 않은 것이 확실할 때만 붙인다.
// 이 함수 밖에서 그 문장을 직접 이어 붙이지 말 것 — 그게 이번 사고의 형태였다.
export function buildFailureReport(input: {
  label: string;
  error?: string;
  failure: FailureContext;
}): string {
  const label = input.label;
  const reason = input.error?.trim();
  if (input.failure.kind === "certain") {
    return `${label} — 실패 (${reason || "작업을 시작하지 못했어요."}) 원본은 변경하지 않았어요.`;
  }
  switch (input.failure.verdict) {
    case "started":
      return `${label} — 응답은 늦었지만 작업은 시작됐어요. 진행 상황은 사진 작업 상태에서 볼 수 있어요.`;
    case "not_started":
      return `${label} — 시작되지 않았어요. (${reason || "잡 생성 응답이 오지 않았어요."}) 원본은 변경하지 않았어요.`;
    case "unknown":
    default:
      return `${label} — 시작됐는지 확인하지 못했어요. 다시 실행하기 전에 사진 작업 상태를 확인해주세요.`;
  }
}

export function requiresRerunConfirmation(verdict: ExecutionVerdict): boolean {
  return verdict === "unknown";
}

export function rerunConfirmationPrompt(label: string): string {
  return [
    `${label} — 아까 요청이 시작됐는지 확인하지 못했어요.`,
    "지금 다시 실행하면 같은 원본에 작업이 두 번 걸릴 수 있어요.",
    "사진 작업 상태를 확인한 뒤에도 실행할까요?",
  ].join("\n");
}
