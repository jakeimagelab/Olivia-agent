export type MobilePrimaryView = "home" | "calendar" | "memo" | "documents" | "chat" | "voice";
export type MobileResourceType = "quote" | "contract" | "document" | "storyboard";

export type MobileNavigationState =
  | { view: MobilePrimaryView }
  | { view: "preview"; resourceType: MobileResourceType; resourceId: string; temporaryDocumentId?: string };

const PRIMARY_VIEWS = new Set<MobilePrimaryView>(["home", "calendar", "memo", "documents", "chat", "voice"]);
const RESOURCE_TYPES = new Set<MobileResourceType>(["quote", "contract", "document", "storyboard"]);

export function parseMobileNavigation(search: string): MobileNavigationState {
  const params = new URLSearchParams(search);
  const view = params.get("mobileView");
  if (view === "preview") {
    const resourceType = params.get("resourceType") as MobileResourceType | null;
    const resourceId = params.get("resourceId")?.trim();
    if (resourceType && RESOURCE_TYPES.has(resourceType) && resourceId) {
      const temporaryDocumentId = params.get("temporaryDocumentId")?.trim() || undefined;
      return { view, resourceType, resourceId, ...(temporaryDocumentId ? { temporaryDocumentId } : {}) };
    }
  }
  return PRIMARY_VIEWS.has(view as MobilePrimaryView)
    ? { view: view as MobilePrimaryView }
    : { view: "home" };
}

export function buildMobileNavigationUrl(currentHref: string, state: MobileNavigationState) {
  const url = new URL(currentHref, "https://olivia.local");
  if (state.view === "home") url.searchParams.delete("mobileView");
  else url.searchParams.set("mobileView", state.view);

  if (state.view === "preview") {
    url.searchParams.set("resourceType", state.resourceType);
    url.searchParams.set("resourceId", state.resourceId);
    if (state.temporaryDocumentId) url.searchParams.set("temporaryDocumentId", state.temporaryDocumentId);
    else url.searchParams.delete("temporaryDocumentId");
  } else {
    url.searchParams.delete("resourceType");
    url.searchParams.delete("resourceId");
    url.searchParams.delete("temporaryDocumentId");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function primaryViewForNavigation(state: MobileNavigationState): MobilePrimaryView | null {
  return state.view === "preview" ? null : state.view;
}
