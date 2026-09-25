export type CoreCommandResult<T> =
  | { ok: true; value: T; idempotent?: boolean }
  | { ok: false; reason: string; code?: string };

export function coreCommandFailure(error: unknown, fallback: string, code = "COMMAND_FAILED"): CoreCommandResult<never> {
  return {
    ok: false,
    reason: error instanceof Error && error.message ? error.message : fallback,
    code,
  };
}
