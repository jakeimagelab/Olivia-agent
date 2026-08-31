import { getSupabaseAdmin } from "@/lib/supabase";
import { listMailingQueue, sendMailing } from "@/lib/olivia/tools/mailing";
import {
  createAssistantEmailDraft,
  readAssistantEmail,
  searchAssistantEmail,
  summarizeAssistantEmail,
} from "@/lib/assistant/actions/email";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text, fromLegacyResult } from "./common";

export const MAILING_TOOL_NAMES = [
  "list_mailing_queue", "send_mailing", "apply_send_mailing",
  "email_search", "email_read", "email_summarize", "email_create_draft",
] as const;

export async function executeMailingTool(
  name: string,
  input: Record<string, unknown>,
  _context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();

  // ── 메일링 (발송은 승인 필요 — send_mailing은 미리보기만, apply_send_mailing이 실제 발송) ──
  if (name === "list_mailing_queue") return fromLegacyResult(name, await listMailingQueue(input));
  if (name === "send_mailing") {
    const mailingId = text(input, "mailingId");
    if (!mailingId) throw new Error("발송할 메일 ID를 확인해주세요.");
    return { tool: name, success: true, data: { mailingId, approvalRequired: true, summary: `메일(ID: ${mailingId})을 발송할까요? 실제 고객에게 전송됩니다.` } };
  }
  if (name === "apply_send_mailing") {
    return fromLegacyResult(name, await sendMailing({ mailingId: text(input, "mailingId") }));
  }

  // ── 이메일 (Gmail) ──
  if (["email_search", "email_read", "email_summarize", "email_create_draft"].includes(name)) {
    const owner = await ensurePrimaryAssistantOwner(db);
    if (name === "email_search") {
      const result = await searchAssistantEmail(db, owner.id, input);
      return { tool: name, success: true, data: result };
    }
    if (name === "email_read") {
      const result = await readAssistantEmail(db, owner.id, input);
      return { tool: name, success: true, data: result };
    }
    if (name === "email_summarize") {
      const result = await summarizeAssistantEmail(db, owner.id, input);
      return { tool: name, success: true, data: result };
    }
    const result = await createAssistantEmailDraft(db, owner.id, input);
    return { tool: name, success: true, data: result };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
