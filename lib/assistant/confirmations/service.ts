import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashAssistantSecret } from "@/lib/assistant/security";

const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

export async function createAssistantConfirmation(
  db: SupabaseClient,
  input: { actionRequestId: string; ownerId: string; ttlMs?: number },
): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashAssistantSecret(`confirmation:${token}`);
  const expiresAt = new Date(
    Date.now() + Math.max(60_000, input.ttlMs ?? CONFIRMATION_TTL_MS),
  ).toISOString();

  await db
    .from("assistant_confirmations")
    .update({ status: "expired" })
    .eq("action_request_id", input.actionRequestId)
    .eq("status", "waiting");

  const { error } = await db.from("assistant_confirmations").insert({
    action_request_id: input.actionRequestId,
    owner_id: input.ownerId,
    token_hash: tokenHash,
    status: "waiting",
    expires_at: expiresAt,
  });
  if (error) throw new Error(`승인 요청 생성 실패: ${error.message}`);

  const { error: actionError } = await db
    .from("assistant_action_requests")
    .update({ status: "waiting_confirmation" })
    .eq("id", input.actionRequestId)
    .eq("owner_id", input.ownerId)
    .in("status", ["queued", "processing"]);
  if (actionError) throw new Error(`Action 승인 상태 변경 실패: ${actionError.message}`);
  return { token, expiresAt };
}

export async function claimAssistantConfirmation(
  db: SupabaseClient,
  input: {
    token: string;
    ownerId: string;
    decision: "confirm" | "cancel";
  },
) {
  const tokenHash = hashAssistantSecret(`confirmation:${input.token}`);
  const { data, error } = await db.rpc("claim_assistant_confirmation", {
    p_token_hash: tokenHash,
    p_owner_id: input.ownerId,
    p_decision: input.decision,
  });
  if (error) throw new Error(`승인 처리 실패: ${error.message}`);
  const claimed = Array.isArray(data) ? data[0] : data;
  if (!claimed) return null;

  const nextStatus = input.decision === "confirm" ? "approved" : "cancelled";
  const { data: action, error: actionError } = await db
    .from("assistant_action_requests")
    .update({ status: nextStatus })
    .eq("id", claimed.action_request_id)
    .eq("owner_id", input.ownerId)
    .eq("status", "waiting_confirmation")
    .select("*")
    .maybeSingle();
  if (actionError) throw new Error(`Action 승인 반영 실패: ${actionError.message}`);
  return action;
}
