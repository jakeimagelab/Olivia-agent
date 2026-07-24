import type {
  AssistantActionDefinition,
  AssistantActionRegistry,
} from "@/lib/assistant/actions/types";
import { requireActionName } from "@/lib/assistant/validation";

export function createAssistantActionRegistry(
  definitions: AssistantActionDefinition[],
): AssistantActionRegistry {
  const byName = new Map<string, AssistantActionDefinition>();

  for (const definition of definitions) {
    const actionName = requireActionName(definition.actionName);
    if (byName.has(actionName)) {
      throw new Error(`중복된 Assistant Action입니다: ${actionName}`);
    }
    byName.set(actionName, Object.freeze({ ...definition, actionName }));
  }

  return {
    get: (actionName) => byName.get(actionName),
    has: (actionName) => byName.has(actionName),
    list: () => [...byName.values()],
  };
}
