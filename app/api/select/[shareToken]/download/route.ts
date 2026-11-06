import { NextRequest, NextResponse } from "next/server";
import { strToU8, zipSync } from "fflate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";
import { assertPublicGalleryAvailable, getPublicSelectGallery } from "@/lib/select-gallery/publicServer";
import { getGalleryImages } from "@/lib/selectGallery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "zip-download", limit: 4, windowSeconds: 300 });
    const gallery = await getPublicSelectGallery(db, shareToken);
    assertPublicGalleryAvailable(gallery);
    if (!gallery.allow_download_zip) return Response.json({ ok: false, error: "ZIP 다운로드가 허용되지 않았습니다." }, { status: 403 });
    const [{ data: detail, error: detailError }, images] = await Promise.all([
      db.from("select_galleries").select("title,hospital_name").eq("id", gallery.id).single(),
      getGalleryImages(db, gallery.id),
    ]);
    if (detailError) throw detailError;
    if (!images?.length) return Response.json({ ok: false, error: "이미지가 없습니다." }, { status: 404 });

    const hospitalName = detail.hospital_name ?? detail.title ?? "선택용";
    const zipFolderBase = `${hospitalName}_보정사진선택용_JPG`;
    const zipFiles: Record<string, Uint8Array> = {};
    const results = await Promise.allSettled(images.map(async (image) => {
      if (!image.image_url) throw new Error("이미지 주소 없음");
      const response = await fetch(image.image_url);
      if (!response.ok) throw new Error(`이미지 다운로드 실패: ${response.status}`);
      const relativePath = String(image.relative_path || "").replace(/^[\\/]+/, "").replace(/\.\.(?:[\\/]|$)/g, "");
      const fallbackFolder = image.folder_name ?? image.scene_name ?? "기타";
      const zipPath = relativePath
        ? `${zipFolderBase}/${relativePath}`
        : `${zipFolderBase}/${fallbackFolder}/${image.original_file_name}`;
      zipFiles[zipPath] = new Uint8Array(await response.arrayBuffer());
    }));
    if (!results.some((result) => result.status === "fulfilled")) {
      return Response.json({ ok: false, error: "파일을 가져올 수 없습니다." }, { status: 502 });
    }
    zipFiles[`${zipFolderBase}/README.txt`] = strToU8([
      `${hospitalName} 보정 사진 선택용 JPG 파일 묶음`,
      "",
      "- 보정을 원하는 사진만 골라 선택 페이지에 다시 올려주세요.",
      "- RAW 매칭을 위해 파일명을 변경하지 마세요.",
      "- 카카오톡 일반 전송은 파일명과 화질을 바꿀 수 있습니다.",
    ].join("\n"));
    const zipped = zipSync(zipFiles, { level: 0 });
    return new NextResponse(zipped, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${hospitalName}_JPG.zip`)}`,
        "Content-Length": String(zipped.byteLength),
      },
    });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}
