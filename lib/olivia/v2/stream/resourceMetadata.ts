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
    // document executor는 canonical 고객명을 hospitalName으로 반환한다. 이 값을 함께 저장해야
    // 다음 턴이 화면의 오래된 고객이 아니라 방금 연 문서의 고객을 식별할 수 있다.
    ...(typeof data.clientName === "string"
      ? { clientName: data.clientName }
      : typeof data.hospitalName === "string"
        ? { clientName: data.hospitalName }
        : {}),
    ...(typeof data.workflowRunId === "string" ? { projectId: data.workflowRunId } : {}),
  };
}
