const OPTIONAL_CONTI_SCENE_COLUMNS = new Set([
  "preparation_text",
  "scene_code",
  "completed",
  "repeat_scope",
  "media",
]);

type SchemaError = { code?: string; message?: string } | null;

export function removeUnsupportedContiSceneColumn(
  row: Record<string, unknown>,
  error: SchemaError,
): Record<string, unknown> | null {
  if (!error || (error.code !== "PGRST204" && !/schema cache|does not exist/i.test(error.message ?? ""))) return null;

  const message = error.message ?? "";
  const column = message.match(/Could not find the ['"]([^'"]+)['"] column/i)?.[1]
    ?? message.match(/column\s+(?:[a-z_][\w]*\.)?["']?([a-z_][\w]*)["']?\s+does not exist/i)?.[1];
  if (!column || !OPTIONAL_CONTI_SCENE_COLUMNS.has(column) || !(column in row)) return null;

  const next = { ...row };
  delete next[column];
  return next;
}
