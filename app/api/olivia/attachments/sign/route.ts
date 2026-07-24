import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  isValidOliviaAttachmentPath,
  OLIVIA_ATTACHMENT_BUCKET,
} from "@/lib/olivia/chatAttachments";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const storagePath = String(body.storagePath || "");
    if (!isValidOliviaAttachmentPath(storagePath)) {
      return NextResponse.json({ ok: false, error: "잘못된 첨부 경로입니다." }, { status: 400 });
    }
    const { data, error } = await getSupabaseAdmin()
      .storage
      .from(OLIVIA_ATTACHMENT_BUCKET)
      .createSignedUrl(storagePath, 60 * 30);
    if (error || !data?.signedUrl) throw new Error(error?.message || "파일 링크를 만들지 못했습니다.");
    return NextResponse.json({ ok: true, downloadUrl: data.signedUrl });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "파일 링크를 만들지 못했습니다.",
    }, { status: 500 });
  }
}
