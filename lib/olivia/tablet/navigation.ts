export type TabletAppId =
  | "home"
  | "customer"
  | "calendar"
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

export function parseTabletNavigation(search: string): TabletAppId {
  const value = new URLSearchParams(search).get("tabletApp") as TabletAppId | null;
  return value && TABLET_APP_IDS.has(value) ? value : "home";
}

export function buildTabletNavigationUrl(currentHref: string, app: TabletAppId) {
  const url = new URL(currentHref, "https://olivia.local");
  if (app === "home") url.searchParams.delete("tabletApp");
  else url.searchParams.set("tabletApp", app);
  url.searchParams.delete("mobileView");
  url.searchParams.delete("resourceType");
  url.searchParams.delete("resourceId");
  url.searchParams.delete("temporaryDocumentId");
  return `${url.pathname}${url.search}${url.hash}`;
}
