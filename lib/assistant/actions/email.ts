import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAssistantGmailDraft,
  readAssistantGmail,
  searchAssistantGmail,
} from "@/lib/assistant/oauth/google";
import { optionalText, requireText } from "@/lib/assistant/validation";

export async function searchAssistantEmail(
  db: SupabaseClient,
  ownerId: string,
  input: unknown,
) {
  const value = (input || {}) as Record<string, unknown>;
  const query =
    optionalText(value.query, "검색어", 500) || "newer_than:7d";
  const limit = Math.min(Math.max(Number(value.limit) || 10, 1), 20);
  const messages = await searchAssistantGmail(db, ownerId, query, limit);
  return {
    message: messages.length
      ? messages
          .map(
            (item, index) =>
              `${index + 1}. ${item.subject}\n보낸 사람: ${item.from}\n${item.snippet}\nID: ${item.id}`,
          )
          .join("\n\n")
      : "조건에 맞는 이메일이 없습니다.",
    messages,
  };
}

export async function readAssistantEmail(
  db: SupabaseClient,
  ownerId: string,
  input: unknown,
) {
  const value = (input || {}) as Record<string, unknown>;
  const messageId = requireText(value.messageId, "이메일 ID", { max: 200 });
  const email = await readAssistantGmail(db, ownerId, messageId);
  return {
    message: `**${email.subject}**\n보낸 사람: ${email.from}\n받은 시각: ${email.date}\n첨부: ${email.hasAttachments ? "있음" : "없음"}\n\n${email.content}`,
    email,
  };
}

export async function summarizeAssistantEmail(
  db: SupabaseClient,
  ownerId: string,
  input: unknown,
) {
  const value = (input || {}) as Record<string, unknown>;
  const messageId = requireText(value.messageId, "이메일 ID", { max: 200 });
  const email = await readAssistantGmail(db, ownerId, messageId);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 미설정");
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    system:
      "대표자용 이메일 비서입니다. 메일을 한국어로 간결하게 요약하고, 요청사항·기한·금액·위험 요소·필요한 다음 행동을 구분하세요. 원문에 없는 내용은 추측하지 마세요.",
    messages: [
      {
        role: "user",
        content: `제목: ${email.subject}\n보낸 사람: ${email.from}\n받은 시각: ${email.date}\n\n${email.content.slice(0, 40_000)}`,
      },
    ],
  });
  const summary = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return {
    message: summary || "이메일을 요약하지 못했습니다.",
    email: {
      id: email.id,
      subject: email.subject,
      from: email.from,
      date: email.date,
      hasAttachments: email.hasAttachments,
    },
  };
}

export async function createAssistantEmailDraft(
  db: SupabaseClient,
  ownerId: string,
  input: unknown,
) {
  const value = (input || {}) as Record<string, unknown>;
  const to = requireText(value.to, "받는 사람", { max: 320 });
  const subject = requireText(value.subject, "제목", { max: 500 });
  const body = requireText(value.body, "본문", { max: 20_000 });
  const draft = await createAssistantGmailDraft(db, ownerId, {
    to,
    subject,
    body,
    threadId: optionalText(value.threadId, "스레드 ID", 200),
    inReplyTo: optionalText(value.inReplyTo, "회신 메시지 ID", 500),
  });
  return {
    message:
      "Gmail 답장 초안을 만들었습니다. 실제 발송 전 Gmail 또는 Olivia 승인함에서 내용을 확인해 주세요.",
    draft,
  };
}
