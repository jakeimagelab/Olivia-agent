import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { strToU8, zipSync } from "fflate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const sb = getSupabaseAdmin();
    const token = new URL(req.url).searchParams.get("token");

    const { data: gallery } = await sb
      .from("select_galleries")
      .select("id, share_token, title, hospital_name, file_expires_at, status, allow_download_zip")
      .eq("id", id)
      .single();

    if (!gallery) return NextResponse.json({ ok: false, error: "갤러리 없음" }, { status: 404 });
    if (token && gallery.share_token !== token)
      return NextResponse.json({ ok: false, error: "인증 오류" }, { status: 403 });
    if (!gallery.allow_download_zip)
      return NextResponse.json({ ok: false, error: "ZIP 다운로드가 허용되지 않습니다" }, { status: 403 });
    if (new Date(gallery.file_expires_at) < new Date())
      return NextResponse.json({ ok: false, error: "파일 보관 기간이 만료되었습니다" }, { status: 410 });

    const { data: images } = await sb
      .from("select_gallery_images")
      .select("original_file_name, image_url, scene_name, folder_name, sort_order")
      .eq("gallery_id", id)
      .order("sort_order");

    if (!images || images.length === 0)
      return NextResponse.json({ ok: false, error: "이미지가 없습니다" }, { status: 404 });

    // 씬 폴더별로 파일 그룹화
    const zipFiles: Record<string, Uint8Array> = {};
    const hospitalName = gallery.hospital_name ?? gallery.title ?? "선택용";
    const zipFolderBase = `${hospitalName}_보정사진선택용_JPG`;

    const results = await Promise.allSettled(
      images.map(async (img) => {
        if (!img.image_url) return;
        const res = await fetch(img.image_url);
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        const scenePath = img.folder_name ?? img.scene_name ?? "기타";
        const zipPath = `${zipFolderBase}/${scenePath}/${img.original_file_name}`;
        zipFiles[zipPath] = new Uint8Array(buf);
      })
    );

    const successCount = results.filter(r => r.status === "fulfilled").length;
    if (successCount === 0)
      return NextResponse.json({ ok: false, error: "파일을 가져올 수 없습니다" }, { status: 500 });

    // README 파일 추가
    const readmeText = [
      `${hospitalName} 보정 사진 선택용 JPG 파일 묶음`,
      "",
      "안내:",
      "- 보정을 원하시는 사진만 골라 원본 페이지에 다시 업로드해주세요.",
      "- 파일명은 절대 변경하지 말아주세요. (RAW 원본 매칭에 사용됩니다)",
      "- 카카오톡으로 전달 시 파일명·화질·메타데이터가 변경될 수 있습니다.",
      "",
      `생성일: ${new Date().toLocaleString("ko-KR")}`,
    ].join("\n");
    zipFiles[`${zipFolderBase}/README.txt`] = strToU8(readmeText);

    const zipped = zipSync(zipFiles, { level: 0 }); // level 0 = store only (JPG already compressed)
    const filename = `${hospitalName}_JPG.zip`;

    return new NextResponse(zipped, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(zipped.byteLength),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
