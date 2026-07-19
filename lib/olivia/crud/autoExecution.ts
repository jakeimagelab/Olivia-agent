type OliviaToolRequestLike = {
  name?: unknown;
  input?: unknown;
} | null | undefined;

export function isAutoExecutableClientCreate(tool: OliviaToolRequestLike) {
  if (tool?.name !== "create_feature_record") return false;
  if (!tool.input || typeof tool.input !== "object" || Array.isArray(tool.input)) return false;
  return (tool.input as Record<string, unknown>).domain === "client";
}
