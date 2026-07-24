import type { AssistantActionRegistry } from "@/lib/assistant/actions/types";
import { canRoleExecute } from "@/lib/assistant/permissions";
import type {
  AssistantActionContext,
  AssistantActionResult,
} from "@/lib/assistant/types";
import { AssistantValidationError } from "@/lib/assistant/validation";

export class AssistantActionNotFoundError extends Error {
  readonly code = "ACTION_NOT_FOUND";

  constructor(actionName: string) {
    super(`지원하지 않는 기능입니다: ${actionName}`);
    this.name = "AssistantActionNotFoundError";
  }
}

export class AssistantPermissionError extends Error {
  readonly code = "PERMISSION_DENIED";

  constructor() {
    super("이 기능을 실행할 권한이 없습니다.");
    this.name = "AssistantPermissionError";
  }
}

export class AssistantConfirmationRequiredError extends Error {
  readonly code = "CONFIRMATION_REQUIRED";

  constructor() {
    super("사용자 확인 후 실행할 수 있는 기능입니다.");
    this.name = "AssistantConfirmationRequiredError";
  }
}

type DispatchInput = {
  registry: AssistantActionRegistry;
  context: AssistantActionContext;
  actionName: string;
  parameters: unknown;
  confirmed?: boolean;
};

export async function dispatchAssistantAction({
  registry,
  context,
  actionName,
  parameters,
  confirmed = false,
}: DispatchInput): Promise<AssistantActionResult> {
  const definition = registry.get(actionName);
  if (!definition) throw new AssistantActionNotFoundError(actionName);
  if (!canRoleExecute(context.role, definition.requiredRole)) {
    throw new AssistantPermissionError();
  }
  if (definition.confirmationRequired && !confirmed) {
    throw new AssistantConfirmationRequiredError();
  }

  let validatedParameters: Record<string, unknown>;
  try {
    validatedParameters = definition.validate(parameters);
  } catch (error) {
    if (error instanceof AssistantValidationError) throw error;
    throw new AssistantValidationError("Action 입력값이 올바르지 않습니다.");
  }

  return definition.execute(context, validatedParameters);
}
