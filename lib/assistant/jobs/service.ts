import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildKakaoConfirmationResponse,
  buildKakaoTextResponse,
} from "@/lib/assistant/channels/kakao/messageBuilder";
import { sendKakaoCallback } from "@/lib/assistant/channels/kakao/client";
import {
  listAssistantMessages,
  saveAssistantMessage,
} from "@/lib/assistant/conversations/service";
import { processOliviaChannelMessage } from "@/lib/assistant/core/oliviaCore";
import { decryptAssistantSecret } from "@/lib/assistant/security";

type AssistantJob = {
  id: string;
  owner_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
};

async function completeJob(
  db: SupabaseClient,
  jobId: string,
  result: Record<string, unknown>,
) {
  const { error } = await db
    .from("assistant_jobs")
    .update({
      status: "completed",
      payload: result,
      completed_at: new Date().toISOString(),
      lease_expires_at: null,
      worker_id: null,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("id", jobId)
    .eq("status", "processing");
  if (error) throw new Error(error.message);
}

async function failJob(
  db: SupabaseClient,
  job: AssistantJob,
  error: unknown,
) {
  const message =
    error instanceof Error ? error.message : "비동기 작업에 실패했습니다.";
  const terminal = job.attempt_count >= job.max_attempts;
  const retrySeconds = Math.min(5 * 2 ** Math.max(0, job.attempt_count - 1), 300);
  await db
    .from("assistant_jobs")
    .update({
      status: "failed",
      available_at: terminal
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString()
        : new Date(Date.now() + retrySeconds * 1_000).toISOString(),
      lease_expires_at: null,
      worker_id: null,
      last_error_code: terminal ? "MAX_ATTEMPTS" : "RETRYABLE_FAILURE",
      last_error_message: message.slice(0, 2_000),
    })
    .eq("id", job.id)
    .eq("status", "processing");
}

async function processKakaoMessageJob(
  db: SupabaseClient,
  req: NextRequest,
  job: AssistantJob,
) {
  const ownerId = String(job.payload.ownerId || "");
  const conversationId = String(job.payload.conversationId || "");
  const messageId = String(job.payload.messageId || "");
  const requestId = String(job.payload.requestId || "");
  const encryptedCallback = String(job.payload.callbackUrlEncrypted || "");
  if (
    !ownerId ||
    !conversationId ||
    !messageId ||
    !requestId ||
    !encryptedCallback
  ) {
    throw new Error("카카오 작업 정보가 올바르지 않습니다.");
  }

  const history = await listAssistantMessages(db, ownerId, conversationId, 20);
  const result = await processOliviaChannelMessage({
    db,
    req,
    ownerId,
    conversationId,
    messageId,
    channel: "kakao",
    requestId,
    messages: history.map((message: any) => ({
      role: message.role,
      content: message.content,
    })),
  });
  const assistantMessage = await saveAssistantMessage(db, {
    ownerId,
    conversationId,
    role: "assistant",
    content: result.text,
    channel: "kakao",
    parentMessageId: messageId,
    metadata:
      result.kind === "confirmation"
        ? {
            messageType: "confirmation",
            actionRequestId: result.actionRequestId,
          }
        : {},
  });
  const callbackResponse =
    result.kind === "confirmation"
      ? buildKakaoConfirmationResponse({
          text: result.text,
          token: result.token,
        })
      : buildKakaoTextResponse(result.text);
  const callback = await sendKakaoCallback(
    decryptAssistantSecret(encryptedCallback),
    callbackResponse,
  );
  await db.from("assistant_delivery_attempts").insert({
    owner_id: ownerId,
    conversation_id: conversationId,
    message_id: assistantMessage.message.id,
    channel: "kakao",
    external_request_id: callback.taskId || null,
    status: "accepted",
    attempt_count: job.attempt_count,
    response_metadata: { callbackStatus: callback.status },
    sent_at: new Date().toISOString(),
  });
  return {
    ownerId,
    conversationId,
    messageId: assistantMessage.message.id,
    callbackTaskId: callback.taskId,
  };
}

export async function processAssistantJobs(input: {
  db: SupabaseClient;
  req: NextRequest;
  workerId: string;
  limit?: number;
}) {
  const { data, error } = await input.db.rpc("claim_assistant_jobs", {
    p_worker_id: input.workerId,
    p_limit: Math.min(Math.max(input.limit ?? 5, 1), 20),
    p_lease_seconds: 55,
  });
  if (error) throw new Error(`비동기 작업 claim 실패: ${error.message}`);
  const jobs = (data ?? []) as AssistantJob[];
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const job of jobs) {
    try {
      let result: Record<string, unknown>;
      if (job.job_type === "kakao_message") {
        result = await processKakaoMessageJob(input.db, input.req, job);
      } else {
        throw new Error(`지원하지 않는 비동기 작업입니다: ${job.job_type}`);
      }
      await completeJob(input.db, job.id, {
        original: job.payload,
        result,
      });
      results.push({ id: job.id, ok: true });
    } catch (jobError) {
      await failJob(input.db, job, jobError);
      results.push({
        id: job.id,
        ok: false,
        error:
          jobError instanceof Error ? jobError.message : "작업 처리 실패",
      });
    }
  }
  return results;
}
