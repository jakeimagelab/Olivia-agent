import type {
  AssistantActionContext,
  AssistantActionResult,
  AssistantRole,
} from "@/lib/assistant/types";

export type AssistantActionDefinition<TInput = Record<string, unknown>> = {
  actionName: string;
  description: string;
  requiredRole: AssistantRole;
  confirmationRequired: boolean;
  audit: boolean;
  validate(input: unknown): TInput;
  execute(
    context: AssistantActionContext,
    input: TInput,
  ): Promise<AssistantActionResult>;
  rollback?: (
    context: AssistantActionContext,
    result: AssistantActionResult,
  ) => Promise<void>;
};

export type AssistantActionRegistry = {
  get(actionName: string): AssistantActionDefinition | undefined;
  has(actionName: string): boolean;
  list(): AssistantActionDefinition[];
};
