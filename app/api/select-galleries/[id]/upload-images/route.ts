import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { toAsciiStorageSegment } from "@/lib/storageKey";
import { assertWrite } from "@/lib/db/assertWrite";
import { normalizeSelectionCategory } from "@/lib/select-core";

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
    const relativePaths = formData.getAll("relative_paths").map((value) => String(value));
    const sceneName = (formData.get("scene_name") as string) ?? "";
    const sceneType = (formData.get("scene_type") as string) ?? "";
    const folderName = (formData.get("folder_name") as string) ?? "";

    if (!files.length) return NextResponse.json({ ok: false, error: "파일 없음" }, { status: 400 });

    const inserted: any[] = [];
    let sortBase = Date.now();

    for (const [fileIndex, file] of files.entries()) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const basename = file.name.replace(/\.[^.]+$/, "");
      const safeFileName = `${sortBase}-${toAsciiStorageSegment(file.name, `image.${ext}`)}`;
      const storagePath = `${id}/${safeFileName}`;
      const requestedRelativePath = relativePaths[fileIndex] || (folderName ? `${folderName}/${file.name}` : "");
      const relativeParts = requestedRelativePath.normalize("NFC").replace(/\\/g, "/").split("/").filter(Boolean);
      const relativePath = requestedRelativePath
        && requestedRelativePath.length <= 1_000
        && !requestedRelativePath.startsWith("/")
        && !relativeParts.some((part) => part === "." || part === "..")
        ? relativeParts.join("/")
        : null;

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
        relative_path: relativePath,
        basename,
        extension: ext,
        scene_name: normalizeSelectionCategory(sceneType || sceneName, folderName),
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
    const galleryWrite = await sb
      .from("select_galleries")
      .update({ total_jpg_count: count ?? 0, status: "ready", updated_at: now })
      .eq("id", id)
      .in("status", ["draft", "uploading_images"]);
    assertWrite(galleryWrite, "셀렉 갤러리 이미지 업로드 상태 기록");

    return NextResponse.json({ ok: true, uploaded: inserted.length, images: inserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
