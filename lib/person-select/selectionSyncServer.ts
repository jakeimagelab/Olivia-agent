import type { SupabaseClient } from "@supabase/supabase-js";

export function selectionSyncFunctionMissing(error: { code?: string | null; message?: string | null } | null | undefined) {
  return Boolean(error && /PGRST202|42883|schema cache|could not find the function/i.test(`${error.code ?? ""} ${error.message ?? ""}`));
}

export async function recordSelectionSaveFailure(input: {
  db: SupabaseClient;
  eventId: string;
  actorType: "reviewer" | "person";
  actorId: string;
  error: unknown;
  stage?: string;
}) {
  const cause = input.error as { code?: unknown; message?: unknown } | null;
  const code = typeof cause?.code === "string" ? cause.code.slice(0, 80) : "SAVE_FAILED";
  const message = (cause instanceof Error ? cause.message : typeof cause?.message === "string" ? cause.message : "사진선택 저장 실패").slice(0, 500);
  try {
    await input.db.from("person_select_selection_save_failures").insert({
      event_id: input.eventId,
      actor_type: input.actorType,
      actor_id: input.actorId,
      error_code: code,
      error_stage: (input.stage ?? "save").slice(0, 80),
      error_message: message,
    });
  } catch {
    // DB 자체가 응답하지 않는 상황에서는 실패 기록도 남길 수 없다.
  }
}
