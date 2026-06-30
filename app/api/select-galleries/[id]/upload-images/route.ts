import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getFileExpiresAt } from "@/lib/selectGallery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 갤러리에 JPG 이미지 업로드 (Supabase Storage → DB 등록)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = getSupabaseAdmin();

    // 갤러리 존재 확인
    const { data: gallery, error: gErr } = await sb
      .from("select_galleries")
      .select("id, file_expires_at")
      .eq("id", params.id)
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
      const storagePath = `${params.id}/${file.name}`;

      // Supabase Storage 업로드
      const arrayBuffer = await file.arrayBuffer();
      const { error: upErr } = await sb.storage
        .from("select-galleries")
        .upload(storagePath, arrayBuffer, {
          contentType: file.type || "image/jpeg",
          upsert: true,
        });
      if (upErr) { console.error("Upload error:", upErr.message); continue; }

      // 퍼블릭 URL
      const { data: urlData } = sb.storage.from("select-galleries").getPublicUrl(storagePath);
      const imageUrl = urlData.publicUrl;

      // 썸네일 경로 (클라이언트 사이드에서 생성하므로 원본 URL 사용)
      const thumbnailUrl = imageUrl;

      const row = {
        gallery_id: params.id,
        original_file_name: file.name,
        basename,
        extension: ext,
        scene_name: sceneName || null,
        folder_name: folderName || null,
        image_url: imageUrl,
        thumbnail_url: thumbnailUrl,
        preview_url: imageUrl,
        file_size: file.size,
        expires_at: gallery.file_expires_at,
        sort_order: sortBase++,
      };

      const { data: imgRow, error: dbErr } = await sb
        .from("select_gallery_images")
        .insert(row)
        .select()
        .single();
      if (dbErr) { console.error("DB error:", dbErr.message); continue; }
      inserted.push(imgRow);
    }

    // 총 이미지 수 업데이트
    const { count } = await sb
      .from("select_gallery_images")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", params.id);

    await sb
      .from("select_galleries")
      .update({ total_jpg_count: count ?? 0, updated_at: new Date().toISOString() })
      .eq("id", params.id);

    return NextResponse.json({ ok: true, uploaded: inserted.length, images: inserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
