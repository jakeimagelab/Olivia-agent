export const OLIVIA_ROOT_APP_PARAM = "oliviaApp";

export type OliviaRootLaunch = {
  appId: "customer";
  clientId?: string;
  workflowRunId?: string;
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
  if (clientId) query.set("clientId", clientId);
  if (workflowRunId) query.set("workflowRunId", workflowRunId);
  return `/?${query.toString()}`;
}

export function parseOliviaRootLaunch(search: string): OliviaRootLaunch | null {
  const query = new URLSearchParams(search);
  if (query.get(OLIVIA_ROOT_APP_PARAM) !== "customer") return null;
  return {
    appId: "customer",
    clientId: query.get("clientId")?.trim() || undefined,
    workflowRunId: query.get("workflowRunId")?.trim() || undefined,
  };
}

export function clearOliviaRootLaunchParams(currentHref: string, options: { keepClientId?: boolean } = {}) {
  const url = new URL(currentHref, "https://olivia.local");
  url.searchParams.delete(OLIVIA_ROOT_APP_PARAM);
  url.searchParams.delete("workflowRunId");
  if (!options.keepClientId) url.searchParams.delete("clientId");
  return `${url.pathname}${url.search}${url.hash}`;
}
