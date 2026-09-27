export const CUSTOMER_WAIT_STEPS = new Set([
  "quote",
  "contract",
  "conti",
  "client_selection",
  "final_delivery",
  "revision",
]);

export function isWorkflowWaitingCustomer(input: {
  status: string | null | undefined;
  displayStepKey: string | null | undefined;
  waitingApprovalCount: number;
}) {
  return input.status === "active"
    && Boolean(input.displayStepKey)
    && CUSTOMER_WAIT_STEPS.has(String(input.displayStepKey))
    && input.waitingApprovalCount === 0;
}
