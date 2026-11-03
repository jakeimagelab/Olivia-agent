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

export function inferWindowContextScope(context?: WindowContext): NonNullable<WindowContext["contextScope"]> {
  if (context?.contextScope) return context.contextScope;
  if (context?.documentId || (context?.documentType && context?.resourceId)) return "document";
  if (context?.clientId || context?.workflowRunId || context?.projectId) return "client";
  return "none";
}

export function withWindowContextScope(context: WindowContext): WindowContext {
  return { ...context, contextScope: inferWindowContextScope(context) };
}

let launchSequence = 0;

export function createWindowLaunchRequestId() {
  launchSequence += 1;
  return `${Date.now().toString(36)}-${launchSequence.toString(36)}`;
}

const TARGET_PARAMS = [
  "clientId", "client_id", "projectId", "workflowRunId", "workflow_run_id",
  "resourceId", "documentId", "sourceQuoteId", "quoteId", "reviewId", "contentId",
  "memoId", "galleryId",
];

/** 일반 실행 URL에서 이전 고객·촬영 건·문서 대상만 제거하고 기능 탭/도구 쿼리는 보존한다. */
export function normalizeGeneralRouteHref(href?: string) {
  if (!href) return undefined;
  const url = new URL(href, "https://olivia.local");
  TARGET_PARAMS.forEach((key) => url.searchParams.delete(key));
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}

export function createGeneralWindowContext(routeHref?: string, extra?: Pick<WindowContext, "featureItemId">): WindowContext {
  return {
    contextScope: "none",
    launchIntent: "new",
    launchRequestId: createWindowLaunchRequestId(),
    targetVerified: false,
    routeHref: normalizeGeneralRouteHref(routeHref),
    featureItemId: extra?.featureItemId,
  };
}

/** URL/호출자가 명시한 대상을 launch intent와 함께 정규화한다. */
export function prepareWindowContextForLaunch(context: WindowContext, documentType?: string): WindowContext {
  const documentId = context.documentId ?? (documentType ? context.resourceId : undefined);
  const hasDocument = Boolean(documentId || context.resourceId || context.sourceQuoteId);
  const hasClientTarget = Boolean(context.clientId || context.workflowRunId || context.projectId);
  if (!hasDocument && !hasClientTarget) {
    return createGeneralWindowContext(context.routeHref, { featureItemId: context.featureItemId });
  }
  return {
    ...context,
    ...(documentType ? { documentType, documentId } : {}),
    contextScope: hasDocument ? "document" : "client",
    launchIntent: hasDocument ? "document" : "client-new",
    launchRequestId: createWindowLaunchRequestId(),
    targetVerified: false,
  };
}
