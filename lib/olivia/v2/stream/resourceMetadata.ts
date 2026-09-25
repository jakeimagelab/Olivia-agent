// PHASE 4 작업 5(2026-09-25) — app/api/olivia/v2/stream/route.ts에서 그대로 옮겼다. 동작 변경 없음.
export function resourceMetadataFromTool(toolName: string, data: Record<string, unknown> | undefined, explicitType?: string, explicitId?: string) {
  if (!data) return {};
  const candidates: Array<[string, unknown]> = [
    [explicitType || "resource", explicitId],
    ["quote", data.quoteId],
    ["contract", data.contractId],
    ["conti", data.contiId],
    ["calendar", data.scheduleId],
    [toolName.replace(/^mcp_olivia_/, "").replace(/^(?:create|update|open)_/, ""), data.resourceId],
  ];
  const matched = candidates.find(([, id]) => typeof id === "string" && id.length > 0);
  if (!matched) return {};
  return {
    resourceType: matched[0],
    resourceId: matched[1],
    ...((typeof data.hospitalName === "string" && data.hospitalName) || (typeof data.title === "string" && data.title)
      ? { resourceTitle: (data.hospitalName || data.title) as string }
      : {}),
    ...(typeof data.temporaryDocumentId === "string" ? { temporaryDocumentId: data.temporaryDocumentId } : {}),
    ...(typeof data.version === "number" ? { resourceVersion: data.version } : {}),
    ...(typeof data.clientId === "string" ? { clientId: data.clientId } : {}),
    ...(typeof data.workflowRunId === "string" ? { projectId: data.workflowRunId } : {}),
  };
}
