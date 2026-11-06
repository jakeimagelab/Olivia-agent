import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGalleryDraft, getGalleryImages, getLatestSelection } from "@/lib/selectGallery";
import { assertWrite } from "@/lib/db/assertWrite";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  try {
    const sb = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db: sb, request: req, token: shareToken, action: "gallery-read", limit: 180 });
    const { data: gallery } = await sb
      .from("select_galleries")
      .select("*")
      .eq("share_token", shareToken)
      .single();

    if (!gallery) return NextResponse.json({ ok: false, error: "링크를 찾을 수 없습니다" }, { status: 404 });

    if (gallery.status === "expired")
      return NextResponse.json({ ok: false, error: "만료된 링크입니다", expired: true }, { status: 410 });

    const now = new Date();
    const expiresAt = new Date(gallery.file_expires_at);
    const filesExpired = expiresAt < now;

    const [images, selection, draft] = await Promise.all([
      filesExpired ? [] : getGalleryImages(sb, gallery.id),
      getLatestSelection(sb, gallery.id),
      getGalleryDraft(sb, gallery.id, Number(gallery.share_token_version ?? 1)),
    ]);

    if (gallery.status === "draft" || gallery.status === "mail_sent") {
      const galleryWrite = await sb
        .from("select_galleries")
        .update({ status: "waiting_selection", updated_at: new Date().toISOString() })
        .eq("id", gallery.id);
      assertWrite(galleryWrite, "고객 셀렉 대기 상태 기록");
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
        view_mode: gallery.view_mode === "bridge" ? "bridge" : "classic",
        status: gallery.status,
        allow_web_select: gallery.allow_web_select,
        allow_download_upload: gallery.allow_download_upload,
        allow_download_zip: gallery.allow_download_zip,
        allow_resubmit: gallery.allow_resubmit,
        total_jpg_count: gallery.total_jpg_count,
        file_expires_at: gallery.file_expires_at,
        files_expired: filesExpired,
        nas_link: gallery.nas_link,
      },
      images,
      selection,
      draft: draft ? {
        revision: draft.revision,
        selectedImageIds: draft.selected_image_ids,
        ratings: draft.ratings,
        imageNotes: draft.image_notes,
        customerMemo: draft.customer_memo,
        updatedAt: draft.updated_at,
      } : null,
    });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}
