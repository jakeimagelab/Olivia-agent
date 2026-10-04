export const OLIVIA_ROOT_APP_PARAM = "oliviaApp";

export type OliviaRootLaunch = {
  appId: "customer";
  clientId?: string;
  workflowRunId?: string;
  routeHref?: string;
};

type SearchParamValue = string | string[] | undefined;
export type ClientRouteSearchParams = Record<string, SearchParamValue>;

function firstValue(value: SearchParamValue) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim() || undefined;
}

export function buildClientOliviaRootHref(params: ClientRouteSearchParams = {}) {
  const query = new URLSearchParams();
  query.set(OLIVIA_ROOT_APP_PARAM, "customer");

  const clientId = firstValue(params.clientId) ?? firstValue(params.id);
  const workflowRunId = firstValue(params.workflowRunId) ?? firstValue(params.workflow_run_id);
  const tab = firstValue(params.tab);
  const document = firstValue(params.document);
  if (clientId) query.set("clientId", clientId);
  if (workflowRunId) query.set("workflowRunId", workflowRunId);
  if (tab) query.set("clientTab", tab);
  if (document) query.set("clientDocument", document);
  return `/?${query.toString()}`;
}

export function parseOliviaRootLaunch(search: string): OliviaRootLaunch | null {
  const query = new URLSearchParams(search);
  if (query.get(OLIVIA_ROOT_APP_PARAM) !== "customer") return null;
  const clientParams = new URLSearchParams();
  const clientId = query.get("clientId")?.trim() || undefined;
  const workflowRunId = query.get("workflowRunId")?.trim() || undefined;
  const tab = query.get("clientTab")?.trim() || undefined;
  const document = query.get("clientDocument")?.trim() || undefined;
  if (clientId) clientParams.set("clientId", clientId);
  if (workflowRunId) clientParams.set("workflowRunId", workflowRunId);
  if (tab) clientParams.set("tab", tab);
  if (document) clientParams.set("document", document);
  return {
    appId: "customer",
    clientId,
    workflowRunId,
    routeHref: clientParams.size > 0 ? `/clients?${clientParams.toString()}` : "/clients",
  };
}

export function clearOliviaRootLaunchParams(currentHref: string, options: { keepClientId?: boolean } = {}) {
  const url = new URL(currentHref, "https://olivia.local");
  url.searchParams.delete(OLIVIA_ROOT_APP_PARAM);
  url.searchParams.delete("workflowRunId");
  url.searchParams.delete("clientTab");
  url.searchParams.delete("clientDocument");
  if (!options.keepClientId) url.searchParams.delete("clientId");
  return `${url.pathname}${url.search}${url.hash}`;
}
