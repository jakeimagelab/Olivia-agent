export function hasFinalSelectionConfirmation(body: unknown) {
  return Boolean(body && typeof body === "object" && !Array.isArray(body) && (body as Record<string, unknown>).confirmed === true);
}
