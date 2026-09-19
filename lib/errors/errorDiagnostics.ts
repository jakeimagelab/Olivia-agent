import { getErrorMessage } from "@/lib/errors";

export type OliviaErrorDiagnostic = {
  name: string;
  message: string;
  digest?: string;
  stack?: string;
};

export function getOliviaErrorDiagnostic(error: unknown): OliviaErrorDiagnostic {
  if (error instanceof Error) {
    const digest = "digest" in error && typeof error.digest === "string" ? error.digest : undefined;
    return {
      name: error.name || "Error",
      message: error.message || getErrorMessage(error),
      digest,
      stack: error.stack,
    };
  }

  return {
    name: "UnknownError",
    message: getErrorMessage(error),
  };
}

export function formatOliviaErrorDetails(error: unknown): string {
  const diagnostic = getOliviaErrorDiagnostic(error);
  return [
    `${diagnostic.name}: ${diagnostic.message}`,
    diagnostic.digest ? `digest: ${diagnostic.digest}` : "",
    diagnostic.stack || "",
  ].filter(Boolean).join("\n\n");
}

export function logOliviaError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  const diagnostic = getOliviaErrorDiagnostic(error);
  console.error(`[olivia-error] ${scope}`, {
    scope,
    ...diagnostic,
    context: context ?? null,
    error,
  });
}
