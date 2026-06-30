export type ClientAppKey =
  | "clients"
  | "quote"
  | "contract"
  | "conti"
  | "mailing"
  | "gallery"
  | "review"
  | "calendar"
  | "per"
  | "consultation"
  | "shooting"
  | "original-delivery"
  | "photo-retouching"
  | "photo-sorting"
  | "select-galleries";

export const STEP_APP_LINKS: Record<string, ClientAppKey> = {
  consult_meeting: "consultation",
  quote: "quote",
  contract: "contract",
  conti: "conti",
  shooting: "shooting",
  backup_sorting: "photo-sorting",
  original_delivery: "original-delivery",
  client_selection: "select-galleries",
  raw_matching: "select-galleries",
  retouching: "photo-retouching",
  revision: "mailing",
  final_delivery: "gallery",
  review_content: "review",
  reward: "per",
  customer_care: "mailing",
  content_planning: "calendar",
};

export function buildClientAppLink({
  app,
  clientId,
  workflowRunId,
  stepKey,
}: {
  app: ClientAppKey;
  clientId: string;
  workflowRunId?: string;
  stepKey?: string;
}) {
  const params = new URLSearchParams();
  params.set("clientId", clientId);
  params.set("client_id", clientId);
  if (workflowRunId) params.set("workflowRunId", workflowRunId);
  if (stepKey) params.set("stepKey", stepKey);
  return `/${app}?${params.toString()}`;
}

export function buildStepAppLink({
  stepKey,
  clientId,
  workflowRunId,
}: {
  stepKey: string;
  clientId: string;
  workflowRunId?: string;
}) {
  return buildClientAppLink({
    app: STEP_APP_LINKS[stepKey] || "clients",
    clientId,
    workflowRunId,
    stepKey,
  });
}
