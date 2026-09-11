export class OliviaToolError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OliviaToolError";
  }
}

export function normalizeToolError(error: unknown) {
  if (error instanceof OliviaToolError) {
    return { error: error.message, code: error.code, details: error.details };
  }
  return {
    error: error instanceof Error ? error.message : "요청을 처리하지 못했어요.",
    code: "TOOL_EXECUTION_FAILED",
  };
}
