import type { OliviaProgressStep } from "@/lib/olivia/v2/types";

export function appendProgressStep(
  steps: OliviaProgressStep[],
  step: OliviaProgressStep,
): OliviaProgressStep[] {
  return [
    ...steps.map((current) => current.state === "active" && !current.toolCallId
      ? { ...current, state: "done" as const }
      : current),
    step,
  ];
}

export function attachProgressToolCall(
  steps: OliviaProgressStep[],
  input: { toolCallId: string; fallbackId: string; fallbackLabel: string },
): OliviaProgressStep[] {
  const reverseIndex = [...steps].reverse()
    .findIndex((step) => step.state === "active" && !step.toolCallId);
  if (reverseIndex === -1) {
    return [...steps, {
      id: input.fallbackId,
      label: input.fallbackLabel,
      state: "active",
      toolCallId: input.toolCallId,
    }];
  }
  const index = steps.length - 1 - reverseIndex;
  const next = [...steps];
  next[index] = { ...next[index], toolCallId: input.toolCallId };
  return next;
}

export function resolveProgressToolCall(
  steps: OliviaProgressStep[],
  toolCallId: string,
  success: boolean,
): OliviaProgressStep[] {
  return steps.map((step) => step.toolCallId === toolCallId
    ? { ...step, state: success ? "done" as const : "error" as const }
    : step);
}

export function finalizeProgressSteps(
  steps: OliviaProgressStep[],
  outcome: "complete" | "error",
): OliviaProgressStep[] {
  return steps.map((step) => {
    if (step.state !== "active") return step;
    if (outcome === "error" || step.toolCallId) return { ...step, state: "error" as const };
    return { ...step, state: "done" as const };
  });
}
