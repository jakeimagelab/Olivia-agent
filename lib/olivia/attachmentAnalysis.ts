import type Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  OLIVIA_ATTACHMENT_BUCKET,
  sanitizeOliviaAttachments,
  type OliviaChatAttachment,
} from "@/lib/olivia/chatAttachments";

const MAX_TEXT_CHARS_PER_FILE = 40_000;

function clippedText(value: string) {
  return value.replace(/\u0000/g, "").slice(0, MAX_TEXT_CHARS_PER_FILE);
}

function spreadsheetToText(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", dense: true });
  return clippedText(workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return `[시트: ${sheetName}]\n${XLSX.utils.sheet_to_csv(sheet, { blankrows: false })}`;
  }).join("\n\n"));
}

async function prepareOne(attachment: OliviaChatAttachment): Promise<Anthropic.ContentBlockParam[]> {
  if (attachment.analysisStatus === "stored_only") {
    return [{
      type: "text",
      text: `[첨부파일: ${attachment.fileName}] 이 형식은 보관과 다운로드만 지원하며 내용은 직접 분석하지 못합니다.`,
    }];
  }
  const { data, error } = await getSupabaseAdmin()
    .storage
    .from(OLIVIA_ATTACHMENT_BUCKET)
    .download(attachment.storagePath);
  if (error || !data) throw new Error(error?.message || "파일을 읽지 못했습니다.");
  const buffer = Buffer.from(await data.arrayBuffer());

  if (attachment.kind === "image") {
    return [{
      type: "image",
      source: {
        type: "base64",
        media_type: attachment.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: buffer.toString("base64"),
      },
    }];
  }
  if (attachment.kind === "pdf") {
    return [{
      type: "document",
      title: attachment.fileName,
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: buffer.toString("base64"),
      },
    }];
  }
  const text = attachment.kind === "spreadsheet"
    ? spreadsheetToText(buffer)
    : clippedText(buffer.toString("utf8"));
  return [{
    type: "document",
    title: attachment.fileName,
    source: { type: "text", media_type: "text/plain", data: text || "(내용 없음)" },
  }];
}

export async function prepareOliviaAttachmentBlocks(value: unknown) {
  const attachments = sanitizeOliviaAttachments(value);
  const results = await Promise.all(attachments.map(async (attachment) => {
    try {
      return await prepareOne(attachment);
    } catch (error) {
      return [{
        type: "text" as const,
        text: `[첨부파일: ${attachment.fileName}] 분석 실패: ${error instanceof Error ? error.message : "파일을 읽지 못했습니다."}`,
      }];
    }
  }));
  return results.flat();
}
