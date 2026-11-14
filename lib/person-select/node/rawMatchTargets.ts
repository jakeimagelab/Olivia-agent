import { loadIndividualRawMatchTargets } from "@/lib/person-select/node/individualRawMatchTargetLoader";
import type { LoadRawMatchTargetsInput } from "@/lib/person-select/node/rawMatchTargetRows";
import { loadSharedRawMatchTargets } from "@/lib/person-select/node/sharedRawMatchTargetLoader";

export async function loadPersonSelectRawMatchTargets(input: LoadRawMatchTargetsInput) {
  return input.accessMode === "project_shared"
    ? loadSharedRawMatchTargets(input)
    : loadIndividualRawMatchTargets(input);
}

export * from "@/lib/person-select/node/rawMatchTargetRows";
