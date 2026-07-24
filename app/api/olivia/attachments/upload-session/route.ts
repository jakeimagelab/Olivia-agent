import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { toAsciiStorageSegment } from "@/lib/storageKey";
import {
  OLIVIA_ATTACHMENT_BUCKET,
  validateOliviaAttachmentInput,
} from "@/lib/olivia/chatAttachments";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = validateOliviaAttachmentInput({
      fileName: String(body.fileName || ""),
      mimeType: String(body.mimeType || "application/octet-stream"),
      fileSize: Number(body.fileSize),
    });
    if (!validated.ok) {
      return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
    }

    const id = randomUUID();
    const extension = validated.value.fileName.split(".").pop()?.toLowerCase() || "file";
    const storageName = toAsciiStorageSegment(validated.value.fileName, `attachment.${extension}`).slice(0, 180);
    const storagePath = `uploads/${new Date().toISOString().slice(0, 10)}/${id}/${storageName}`;
    const { data, error } = await getSupabaseAdmin()
      .storage
      .from(OLIVIA_ATTACHMENT_BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });
    if (error || !data?.token) throw new Error(error?.message || "업로드 세션을 만들지 못했습니다.");

    return NextResponse.json({
      ok: true,
      bucket: OLIVIA_ATTACHMENT_BUCKET,
      id,
      storagePath,
      token: data.token,
      fileName: validated.value.fileName,
      mimeType: validated.value.mimeType,
      sizeBytes: validated.value.fileSize,
      kind: validated.value.kind,
      analysisStatus: validated.value.analysisStatus,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "업로드 세션을 만들지 못했습니다.",
    }, { status: 500 });
  }
}
