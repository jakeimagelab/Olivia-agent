import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { toAsciiStorageSegment } from "@/lib/storageKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const sb = getSupabaseAdmin();

    const { data: gallery, error: gErr } = await sb
      .from("select_galleries")
      .select("id, file_expires_at")
      .eq("id", id)
      .single();
    if (gErr || !gallery) return NextResponse.json({ ok: false, error: "갤러리 없음" }, { status: 404 });

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const sceneName = (formData.get("scene_name") as string) ?? "";
    const folderName = (formData.get("folder_name") as string) ?? "";

    if (!files.length) return NextResponse.json({ ok: false, error: "파일 없음" }, { status: 400 });

    const inserted: any[] = [];
    let sortBase = Date.now();

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const basename = file.name.replace(/\.[^.]+$/, "");
      const safeFileName = `${sortBase}-${toAsciiStorageSegment(file.name, `image.${ext}`)}`;
      const storagePath = `${id}/${safeFileName}`;

      const arrayBuffer = await file.arrayBuffer();
      const { error: upErr } = await sb.storage
        .from("select-galleries")
        .upload(storagePath, arrayBuffer, { contentType: file.type || "image/jpeg", upsert: true });
      if (upErr) { console.error("Upload error:", upErr.message); continue; }

      const { data: urlData } = sb.storage.from("select-galleries").getPublicUrl(storagePath);
      const imageUrl = urlData.publicUrl;

      const row = {
        gallery_id: id,
        original_file_name: file.name,
        basename,
        extension: ext,
        scene_name: sceneName || null,
        folder_name: folderName || null,
        image_url: imageUrl,
        thumbnail_url: imageUrl,
        preview_url: imageUrl,
        file_size: file.size,
        expires_at: gallery.file_expires_at,
        sort_order: sortBase++,
      };

      const { data: imgRow, error: dbErr } = await sb
        .from("select_gallery_images").insert(row).select().single();
      if (dbErr) { console.error("DB error:", dbErr.message); continue; }
      inserted.push(imgRow);
    }

    const { count } = await sb
      .from("select_gallery_images")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", id);

    // 업로드 후 상태를 ready로 변경 (draft/uploading_images → ready)
    const now = new Date().toISOString();
    await sb
      .from("select_galleries")
      .update({ total_jpg_count: count ?? 0, status: "ready", updated_at: now })
      .eq("id", id)
      .in("status", ["draft", "uploading_images"]);

    return NextResponse.json({ ok: true, uploaded: inserted.length, images: inserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
