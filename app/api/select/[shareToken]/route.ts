import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGalleryImages, getLatestSelection } from "@/lib/selectGallery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { shareToken: string } }) {
  try {
    const sb = getSupabaseAdmin();
    const { data: gallery } = await sb
      .from("select_galleries")
      .select("*")
      .eq("share_token", params.shareToken)
      .single();

    if (!gallery) return NextResponse.json({ ok: false, error: "링크를 찾을 수 없습니다" }, { status: 404 });

    if (gallery.status === "expired")
      return NextResponse.json({ ok: false, error: "만료된 링크입니다", expired: true }, { status: 410 });

    // 파일 만료 체크
    const now = new Date();
    const expiresAt = new Date(gallery.file_expires_at);
    const filesExpired = expiresAt < now;

    const [images, selection] = await Promise.all([
      filesExpired ? [] : getGalleryImages(sb, gallery.id),
      getLatestSelection(sb, gallery.id),
    ]);

    // 상태가 draft면 waiting_selection으로 자동 업데이트
    if (gallery.status === "draft" || gallery.status === "mail_sent") {
      await sb
        .from("select_galleries")
        .update({ status: "waiting_selection", updated_at: new Date().toISOString() })
        .eq("id", gallery.id);
      gallery.status = "waiting_selection";
    }

    return NextResponse.json({
      ok: true,
      gallery: {
        id: gallery.id,
        title: gallery.title,
        hospital_name: gallery.hospital_name,
        shooting_name: gallery.shooting_name,
        shooting_date: gallery.shooting_date,
        share_token: gallery.share_token,
        status: gallery.status,
        allow_web_select: gallery.allow_web_select,
        allow_download_upload: gallery.allow_download_upload,
        allow_download_zip: gallery.allow_download_zip,
        allow_resubmit: gallery.allow_resubmit,
        total_jpg_count: gallery.total_jpg_count,
        file_expires_at: gallery.file_expires_at,
        files_expired: filesExpired,
      },
      images,
      selection,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
