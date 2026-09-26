export type ExecutedToolEvidence = {
  name: string;
  success: boolean;
  resourceType?: string;
};

function metadataRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/**
 * The assistant message metadata is the canonical execution ledger for a turn.
 * `executedTools` is preferred; `toolCalls` keeps old messages readable.
 */
export function executedToolsFromMetadata(value: unknown): ExecutedToolEvidence[] {
  const metadata = metadataRecord(value);
  if (!metadata) return [];
  const source = Array.isArray(metadata.executedTools)
    ? metadata.executedTools
    : Array.isArray(metadata.toolCalls)
      ? metadata.toolCalls
      : [];

  return source.flatMap((entry) => {
    const row = metadataRecord(entry);
    if (!row) return [];
    const rawName = typeof row.name === "string"
      ? row.name
      : typeof row.toolName === "string"
        ? row.toolName
        : typeof row.tool === "string"
          ? row.tool
          : "";
    const name = rawName.replace(/^mcp_olivia_/, "").replaceAll(".", "_").trim();
    const resourceType = typeof row.resourceType === "string" && row.resourceType.trim()
      ? row.resourceType.trim()
      : undefined;
    return name ? [{ name, success: row.success === true, ...(resourceType ? { resourceType } : {}) }] : [];
  });
}

export function withExecutedToolsMetadata(metadata: Record<string, unknown>): Record<string, unknown> & {
  executedTools: ExecutedToolEvidence[];
} {
  return {
    ...metadata,
    executedTools: executedToolsFromMetadata(metadata),
  };
}

export function buildExecutedToolsContext(
  rows: Array<{ role?: string; metadata?: unknown }>,
): string | null {
  const lastAssistant = [...rows].reverse().find((row) => row.role === "assistant");
  if (!lastAssistant) return null;
  const tools = executedToolsFromMetadata(lastAssistant.metadata);
  const summary = tools.length
    ? tools.map((tool) => `${tool.name}(${tool.success ? "성공" : "실패"})`).join(", ")
    : "없음 (0개)";
  return `<executed_tools>\n직전 턴에서 실제로 실행된 도구: ${summary}\n</executed_tools>`;
}
