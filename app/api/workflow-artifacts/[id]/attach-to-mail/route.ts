import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "workflow-artifacts";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getSupabaseAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const mailingId = body?.mailingId as string | undefined;
  if (!mailingId) return NextResponse.json({ ok: false, error: "mailingId가 필요합니다." }, { status: 400 });

  const { data: artifact, error: artifactError } = await db.from("workflow_artifacts")
    .select("storage_path,file_name,mime_type,status")
    .eq("id", id)
    .maybeSingle();
  if (artifactError || !artifact || artifact.status !== "ready") {
    return NextResponse.json({ ok: false, error: "원본 파일을 찾지 못했습니다." }, { status: 404 });
  }

  const { data: mailing, error: mailingError } = await db.from("mailing_queue")
    .select("id,attachments")
    .eq("id", mailingId)
    .maybeSingle();
  if (mailingError || !mailing) {
    return NextResponse.json({ ok: false, error: "메일 초안을 찾지 못했습니다." }, { status: 404 });
  }

  const { data: fileBlob, error: downloadError } = await db.storage.from(BUCKET).download(artifact.storage_path);
  if (downloadError || !fileBlob) {
    return NextResponse.json({ ok: false, error: "원본 파일 다운로드에 실패했습니다." }, { status: 500 });
  }
  const content = Buffer.from(await fileBlob.arrayBuffer()).toString("base64");

  const existing = (mailing.attachments ?? []) as { filename: string; content_type: string; content: string }[];
  const withoutDuplicate = existing.filter((a) => a.filename !== artifact.file_name);
  const attachments = [
    ...withoutDuplicate,
    { filename: artifact.file_name, content_type: artifact.mime_type || "application/pdf", content },
  ];

  const { data: updated, error: updateError } = await db.from("mailing_queue")
    .update({ attachments, updated_at: new Date().toISOString() })
    .eq("id", mailingId)
    .select()
    .single();
  if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, item: updated });
}
