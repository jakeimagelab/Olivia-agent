import { supabaseAdmin } from "./supabase";

export type ActionType =
  | "create_quote"
  | "create_conti"
  | "send_file"
  | "create_contract"
  | "create_website"
  | "open_page"
  | "olivia_chat";

export async function logActivity(
  actionType: ActionType,
  hospitalName?: string,
  details?: Record<string, any>
) {
  try {
    await supabaseAdmin.from("activity_logs").insert({
      action_type: actionType,
      hospital_name: hospitalName || null,
      details: details || null,
    });
  } catch (e) {
    // 로깅 실패는 무시 (앱 동작에 영향 없음)
    console.error("[ActivityLog]", e);
  }
}
