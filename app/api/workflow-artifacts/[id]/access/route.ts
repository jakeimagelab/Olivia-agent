import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getSupabaseAdmin();
  const { id } = await params;
  const mode = new URL(req.url).searchParams.get("mode") === "download" ? "download" : "view";
  const { data: artifact, error } = await db.from("workflow_artifacts")
    .select("storage_path,file_name,status")
    .eq("id", id)
    .maybeSingle();
  if (error || !artifact || artifact.status !== "ready") {
    return NextResponse.json({ ok: false, error: "원본 파일을 찾지 못했습니다." }, { status: 404 });
  }

  const options = mode === "download" ? { download: artifact.file_name } : undefined;
  const { data, error: signError } = await db.storage.from("workflow-artifacts").createSignedUrl(artifact.storage_path, 120, options);
  if (signError || !data?.signedUrl) {
    return NextResponse.json({ ok: false, error: "파일 접근 주소를 만들지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, url: data.signedUrl, fileName: artifact.file_name });
}
