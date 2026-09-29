import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Worker가 명시적으로 보고한 "키 없음"만 자동 분류 시작 전에 막는다.
 * 오래된 설치본처럼 진단 컬럼을 아직 못 읽는 경우에는 여기서 거짓 음성으로 작업을
 * 막지 않고, 실제 Worker runner의 두 번째 guard가 안전하게 실패시킨다.
 */
export async function isPhotoAutomationAvailable(db: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("remote_workers")
      .select("openai_api_key_configured")
      .eq("worker_id", process.env.OLIVIA_WORKER_ID || "jake-macstudio-01")
      .maybeSingle();
    if (error) return true;
    return data?.openai_api_key_configured !== false;
  } catch {
    return true;
  }
}
