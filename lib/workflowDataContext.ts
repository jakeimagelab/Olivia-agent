import type { SupabaseClient } from "@supabase/supabase-js";

type QueryResult = { data: any; error: { message: string } | null };

async function optionalOne(query: PromiseLike<QueryResult>) {
  try {
    const result = await query;
    return result.error ? null : result.data;
  } catch {
    return null;
  }
}

export type WorkflowRegisteredData = {
  client: Record<string, any> | null;
  project: Record<string, any> | null;
  consultation: Record<string, any> | null;
  quote: Record<string, any> | null;
  contract: Record<string, any> | null;
  conti: Record<string, any> | null;
  gallery: Record<string, any> | null;
};

export async function loadWorkflowRegisteredData(
  db: SupabaseClient,
  run: Record<string, any>,
): Promise<WorkflowRegisteredData> {
  const clientId = run.client_id ?? null;
  const projectId = run.project_id ?? null;
  const clientName = run.client_name ?? "";

  const [client, project, consultation, quote, contract, conti, gallery] = await Promise.all([
    clientId
      ? optionalOne(db.from("clients").select("id,name,manager_name,phone,email,department,memo,workflow_status").eq("id", clientId).maybeSingle())
      : Promise.resolve(null),
    projectId
      ? optionalOne(db.from("projects").select("*").eq("id", projectId).maybeSingle())
      : Promise.resolve(null),
    clientId
      ? optionalOne(db.from("consultation_memos").select("id,summary,raw_memo,extracted_data,recommended_package,next_action,created_at").eq("hospital_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle())
      : Promise.resolve(null),
    clientName
      ? optionalOne(db.from("quotes").select("*").eq("hospital_name", clientName).order("created_at", { ascending: false }).limit(1).maybeSingle())
      : Promise.resolve(null),
    clientName
      ? optionalOne(db.from("contracts").select("id,quote_number,hospital_name,contact_name,email,quote_data,created_at,updated_at").eq("hospital_name", clientName).order("created_at", { ascending: false }).limit(1).maybeSingle())
      : Promise.resolve(null),
    clientName
      ? optionalOne(db.from("conti_saves").select("id,hospital_name,specialties,title,result,saved_at").eq("hospital_name", clientName).order("saved_at", { ascending: false }).limit(1).maybeSingle())
      : Promise.resolve(null),
    clientId
      ? optionalOne(db.from("galleries").select("id,hospital_name,contact_name,contact_email,shoot_date,title,shooting_items,nas_link,original_link,retouched_link,gallery_link,status,updated_at").eq("hospital_id", clientId).order("updated_at", { ascending: false }).limit(1).maybeSingle())
      : Promise.resolve(null),
  ]);

  return { client, project, consultation, quote, contract, conti, gallery };
}

export function workflowContact(data: WorkflowRegisteredData, run: Record<string, any>) {
  return {
    hospitalName: data.client?.name || data.quote?.hospital_name || run.client_name || "병원",
    managerName: data.client?.manager_name || data.quote?.contact_name || data.contract?.contact_name || run.manager_name || "",
    email: data.client?.email || data.quote?.email || data.contract?.email || data.gallery?.contact_email || "",
    phone: data.client?.phone || data.quote?.phone || "",
  };
}
