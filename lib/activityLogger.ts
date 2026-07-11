import { getSupabaseAdmin } from "./supabase";

export type ActionType =
  | "create_quote"
  | "create_conti"
  | "send_file"
  | "create_contract"
  | "create_website"
  | "open_page"
  | "olivia_chat"
  | "calendar_add"
  | "calendar_complete"
  | "calendar_delete"
  | "create_memo"
  | "send_workflow_mail"
  | "advance_workflow_step";

export async function logActivity(
  actionType: ActionType,
  hospitalName?: string,
  details?: Record<string, any>
) {
  try {
    const admin = getSupabaseAdmin();
    await admin.from("activity_logs").insert({
      action_type: actionType,
      hospital_name: hospitalName || null,
      details: details || null,
    });
  } catch (e) {
    console.error("[ActivityLog]", e);
  }
}
