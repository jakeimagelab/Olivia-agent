import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";

export function contextFromHref(href: string): WindowContext {
  const url = new URL(href, "https://olivia.local");
  const params = url.searchParams;
  const galleryMatch = url.pathname.replace(/\/$/, "").match(/^\/select-galleries\/([^/]+)$/);
  return {
    clientId: params.get("clientId") ?? params.get("client_id") ?? params.get("id") ?? undefined,
    projectId: params.get("projectId") ?? params.get("workflowRunId") ?? params.get("workflow_run_id") ?? undefined,
    workflowRunId: params.get("workflowRunId") ?? params.get("workflow_run_id") ?? undefined,
    sourceQuoteId: params.get("sourceQuoteId") ?? params.get("quoteId") ?? undefined,
    resourceId:
      params.get("resourceId")
      ?? params.get("reviewId")
      ?? params.get("contentId")
      ?? params.get("memoId")
      ?? params.get("galleryId")
      ?? (galleryMatch ? decodeURIComponent(galleryMatch[1]) : null)
      ?? undefined,
  };
}

// 호출부가 `{ resourceId: undefined }`를 넘겨도 URL에서 해석한 문서 ID를 지우지 않는다.
// null/빈 문자열 등 명시적으로 전달된 값은 그대로 존중하고, undefined만 제외한다.
export function mergeDefinedWindowContext(base: WindowContext, override?: WindowContext): WindowContext {
  if (!override) return { ...base };
  const merged = { ...base };
  for (const [key, value] of Object.entries(override) as Array<[keyof WindowContext, WindowContext[keyof WindowContext]]>) {
    if (value !== undefined) Object.assign(merged, { [key]: value });
  }
  return merged;
}
