export type MobilePrimaryView =
  | "home"
  | "clients"
  | "calendar"
  | "person-select"
  | "chat"
  | "all-apps"
  | "memo"
  | "documents"
  | "voice"
  | "photo-workspace"
  | "video-workspace"
  | "bridge"
  | "prompter"
  | "photo-pending"
  | "conti";
export type MobileResourceType = "quote" | "contract" | "document" | "storyboard";

export type MobileOliviaTarget = {
  source: "screen" | "quote" | "contract" | "conti" | "bridge" | "photo" | "video" | "person-select";
  title: string;
  documentId?: string;
  documentType?: string;
  documentNumber?: string;
  sceneId?: string;
  clientId?: string;
  clientName?: string;
  workflowRunId?: string;
  eventId?: string;
  bridgeSelectionId?: string;
  bridgeContext?: {
    source: "local" | "nas" | "remote";
    folder: string;
    jpgCount: number;
    rawCount: number;
    selectedCount: number;
    excludedCount: number;
    completedStages: string[];
    workerOnline: boolean;
  };
};

export type MobileNavigationState =
  | { view: MobilePrimaryView; targetId?: string; workflowRunId?: string }
  | { view: "preview"; resourceType: MobileResourceType; resourceId: string; temporaryDocumentId?: string };

export function resolveMobileStartupNavigation(launch?: { appId: string; clientId?: string } | null): MobileNavigationState {
  return launch?.appId === "customer"
    ? { view: "clients", ...(launch.clientId ? { targetId: launch.clientId } : {}) }
    : { view: "home" };
}

const PRIMARY_VIEWS = new Set<MobilePrimaryView>([
  "home",
  "clients",
  "calendar",
  "person-select",
  "all-apps",
  "memo",
  "documents",
  "chat",
  "voice",
  "photo-workspace",
  "video-workspace",
  "bridge",
  "prompter",
  "photo-pending",
  "conti",
]);
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
  const targetId = params.get("mobileTargetId")?.trim() || undefined;
  const workflowRunId = params.get("mobileWorkflowRunId")?.trim() || undefined;
  return PRIMARY_VIEWS.has(view as MobilePrimaryView)
    ? { view: view as MobilePrimaryView, ...(targetId ? { targetId } : {}), ...(workflowRunId ? { workflowRunId } : {}) }
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
    url.searchParams.delete("mobileTargetId");
    url.searchParams.delete("mobileWorkflowRunId");
  } else {
    url.searchParams.delete("resourceType");
    url.searchParams.delete("resourceId");
    url.searchParams.delete("temporaryDocumentId");
    if (state.targetId) url.searchParams.set("mobileTargetId", state.targetId);
    else url.searchParams.delete("mobileTargetId");
    if (state.workflowRunId) url.searchParams.set("mobileWorkflowRunId", state.workflowRunId);
    else url.searchParams.delete("mobileWorkflowRunId");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function primaryViewForNavigation(state: MobileNavigationState): MobilePrimaryView | null {
  if (state.view === "preview") return null;
  if (state.view === "photo-pending") return "home";
  return state.view;
}
