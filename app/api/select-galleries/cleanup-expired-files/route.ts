import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 보안: 내부 호출만 허용 (cron 헤더 또는 secret key)
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const sb = getSupabaseAdmin();
    const now = new Date().toISOString();

    // 파일 만료된 갤러리 조회 (status가 files_expired 아닌 것)
    const { data: expiredGalleries, error: galErr } = await sb
      .from("select_galleries")
      .select("id, title, hospital_name")
      .lt("file_expires_at", now)
      .not("status", "in", '("files_expired","expired","completed")');

    if (galErr) throw galErr;
    if (!expiredGalleries || expiredGalleries.length === 0) {
      return NextResponse.json({ ok: true, cleaned: 0, message: "만료된 갤러리 없음" });
    }

    const results: { galleryId: string; deletedFiles: number; errors: string[] }[] = [];

    for (const gallery of expiredGalleries) {
      const deletedFiles: number[] = [];
      const errors: string[] = [];

      // Storage 파일 목록 조회 및 삭제
      const prefixes = ["originals", "previews", "thumbs"];
      for (const prefix of prefixes) {
        const storagePath = `${gallery.id}/${prefix}`;
        const { data: files } = await sb.storage.from("select-galleries").list(storagePath);
        if (files && files.length > 0) {
          const paths = files.map(f => `${storagePath}/${f.name}`);
          const { error: delErr } = await sb.storage.from("select-galleries").remove(paths);
          if (delErr) errors.push(`${prefix} 삭제 오류: ${delErr.message}`);
          else deletedFiles.push(paths.length);
        }
      }

      // 루트 레벨 파일도 삭제 (이전 방식 호환)
      const { data: rootFiles } = await sb.storage.from("select-galleries").list(gallery.id);
      if (rootFiles && rootFiles.length > 0) {
        const filePaths = rootFiles.filter(f => !f.id || !f.name.endsWith("/")).map(f => `${gallery.id}/${f.name}`);
        if (filePaths.length > 0) {
          const { error: delErr } = await sb.storage.from("select-galleries").remove(filePaths);
          if (delErr) errors.push(`루트 파일 삭제 오류: ${delErr.message}`);
          else deletedFiles.push(filePaths.length);
        }
      }

      // 갤러리 상태를 files_expired로 변경 (선택 정보는 유지)
      await sb
        .from("select_galleries")
        .update({ status: "files_expired", updated_at: now })
        .eq("id", gallery.id);

      results.push({
        galleryId: gallery.id,
        deletedFiles: deletedFiles.reduce((a, b) => a + b, 0),
        errors,
      });
    }

    return NextResponse.json({
      ok: true,
      cleaned: results.length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// GET: Vercel cron 지원
export async function GET(req: NextRequest) {
  return POST(req);
}
