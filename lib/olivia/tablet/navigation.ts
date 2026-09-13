export type TabletAppId =
  | "home"
  | "customer"
  | "calendar"
  | "conti"
  | "documents"
  | "olivia-chat"
  | "review-studio"
  | "memo"
  | "quote-contract"
  | "channel-analysis"
  | "brand-image"
  | "voice"
  | "photo-workspace";

export const TABLET_APP_IDS = new Set<TabletAppId>([
  "home",
  "customer",
  "calendar",
  "conti",
  "documents",
  "olivia-chat",
  "review-studio",
  "memo",
  "quote-contract",
  "channel-analysis",
  "brand-image",
  "voice",
  "photo-workspace",
]);

export type TabletNavigationContext = {
  resourceId?: string;
  clientId?: string;
  workflowRunId?: string;
};

export type TabletNavigationState = TabletNavigationContext & {
  app: TabletAppId;
};

export function parseTabletNavigation(search: string): TabletAppId {
  const value = new URLSearchParams(search).get("tabletApp") as TabletAppId | null;
  return value && TABLET_APP_IDS.has(value) ? value : "home";
}

export function parseTabletNavigationState(search: string): TabletNavigationState {
  const params = new URLSearchParams(search);
  return {
    app: parseTabletNavigation(search),
    resourceId: params.get("resourceId") || undefined,
    clientId: params.get("clientId") || undefined,
    workflowRunId: params.get("workflowRunId") || undefined,
  };
}

export function buildTabletNavigationUrl(
  currentHref: string,
  app: TabletAppId,
  context: TabletNavigationContext = {},
) {
  const url = new URL(currentHref, "https://olivia.local");
  if (app === "home") url.searchParams.delete("tabletApp");
  else url.searchParams.set("tabletApp", app);
  url.searchParams.delete("mobileView");
  url.searchParams.delete("resourceType");
  url.searchParams.delete("resourceId");
  url.searchParams.delete("clientId");
  url.searchParams.delete("workflowRunId");
  url.searchParams.delete("temporaryDocumentId");
  if (context.resourceId) url.searchParams.set("resourceId", context.resourceId);
  if (context.clientId) url.searchParams.set("clientId", context.clientId);
  if (context.workflowRunId) url.searchParams.set("workflowRunId", context.workflowRunId);
  return `${url.pathname}${url.search}${url.hash}`;
}
