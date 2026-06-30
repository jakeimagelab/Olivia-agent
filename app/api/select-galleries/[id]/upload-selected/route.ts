import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EXTS = new Set(["jpg", "jpeg", "heic", "heif", "tif", "tiff", "png"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const sb = getSupabaseAdmin();
    const formData = await req.formData();
    const share_token = formData.get("share_token") as string;
    const customer_memo = (formData.get("customer_memo") as string) ?? "";
    const files = formData.getAll("files") as File[];

    if (!files.length) return NextResponse.json({ ok: false, error: "파일 없음" }, { status: 400 });

    const { data: gallery } = await sb
      .from("select_galleries")
      .select("id, share_token, status, allow_resubmit, allow_download_upload, client_id, workflow_run_id")
      .eq("id", id)
      .single();

    if (!gallery) return NextResponse.json({ ok: false, error: "갤러리 없음" }, { status: 404 });
    if (gallery.share_token !== share_token)
      return NextResponse.json({ ok: false, error: "인증 오류" }, { status: 403 });
    if (!gallery.allow_download_upload)
      return NextResponse.json({ ok: false, error: "업로드가 허용되지 않는 갤러리입니다" }, { status: 403 });
    if (gallery.status === "selection_submitted" && !gallery.allow_resubmit)
      return NextResponse.json({ ok: false, error: "이미 제출이 완료되었습니다" }, { status: 409 });

    const selectedFiles: string[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ALLOWED_EXTS.has(ext)) { rejected.push(file.name); continue; }
      if (!selectedFiles.includes(file.name)) selectedFiles.push(file.name);
    }

    if (!selectedFiles.length)
      return NextResponse.json({ ok: false, error: "유효한 이미지 파일이 없습니다", rejected }, { status: 400 });

    const now = new Date().toISOString();

    if (gallery.allow_resubmit) {
      await sb.from("client_photo_selections").delete().eq("gallery_id", id);
    }

    const { data: selection, error: selErr } = await sb
      .from("client_photo_selections")
      .insert({
        gallery_id: id,
        client_id: gallery.client_id,
        workflow_run_id: gallery.workflow_run_id,
        method: "download_upload",
        selected_files: selectedFiles,
        selected_count: selectedFiles.length,
        customer_memo: customer_memo || null,
        submitted_at: now,
      })
      .select()
      .single();

    if (selErr) throw selErr;

    await sb
      .from("select_galleries")
      .update({ status: "selection_submitted", selected_count: selectedFiles.length, submitted_at: now, updated_at: now })
      .eq("id", id);

    return NextResponse.json({ ok: true, selection, selected_files: selectedFiles, rejected });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
