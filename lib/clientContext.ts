import { STEP_NAME } from "@/lib/workflow";

export type ClientContext = {
  clientId: string;
  workflowRunId?: string;
  stepKey?: string;
  clientName: string;
  hospitalName?: string;
  department?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  memo?: string;
  shootingDate?: string;
  shootingTime?: string;
  shootingLocation?: string;
  packageName?: string;
  quoteAmount?: number;
  contractStatus?: string;
  currentStepKey?: string;
  currentStepName?: string;
};

export function normalizeClientContext(client: any, workflowRun?: any): ClientContext {
  const currentStepKey = workflowRun?.current_step_key;
  return {
    clientId: client.id,
    workflowRunId: workflowRun?.id,
    stepKey: currentStepKey,
    clientName: client.name || client.hospital_name || "",
    hospitalName: client.hospital_name || client.name || "",
    department: client.specialty || client.department || "",
    contactName: client.contact_name || client.manager_name || "",
    phone: client.phone || "",
    email: client.email || "",
    address: client.address || "",
    memo: client.memo || "",
    shootingDate: workflowRun?.shoot_date || "",
    shootingTime: workflowRun?.shooting_time || "",
    shootingLocation: workflowRun?.shooting_location || "",
    packageName: workflowRun?.project_name || "",
    quoteAmount: workflowRun?.quote_amount || undefined,
    contractStatus: workflowRun?.contract_status || "",
    currentStepKey,
    currentStepName: currentStepKey ? STEP_NAME[currentStepKey] || currentStepKey : "",
  };
}
