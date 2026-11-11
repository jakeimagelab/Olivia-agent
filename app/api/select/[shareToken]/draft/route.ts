import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  enforcePublicSelectionRateLimit,
  getOwnedSelectionImageIds,
  parsePublicSelectionDraft,
  publicSelectionErrorResponse,
  readPublicSelectionJson,
} from "@/lib/select-gallery/publicSelection";
import { assertPublicGalleryAvailable, getPublicSelectGallery } from "@/lib/select-gallery/publicServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function draftResponse(draft: any | null) {
  return {
    revision: Number(draft?.revision ?? 0),
    selectedImageIds: Array.isArray(draft?.selected_image_ids) ? draft.selected_image_ids : [],
    ratings: draft?.ratings && typeof draft.ratings === "object" ? draft.ratings : {},
    imageNotes: draft?.image_notes && typeof draft.image_notes === "object" ? draft.image_notes : {},
    customerMemo: typeof draft?.customer_memo === "string" ? draft.customer_memo : "",
    updatedAt: draft?.updated_at ?? null,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "draft-read", limit: 120 });
    const gallery = await getPublicSelectGallery(db, shareToken);
    assertPublicGalleryAvailable(gallery);
    if (!gallery.allow_web_select) return Response.json({ ok: false, error: "웹 사진 선택이 허용되지 않았습니다." }, { status: 403 });
    const { data, error } = await db
      .from("select_gallery_drafts")
      .select("*")
      .eq("gallery_id", gallery.id)
      .eq("token_version", gallery.share_token_version)
      .maybeSingle();
    if (error) throw error;
    return Response.json({ ok: true, draft: draftResponse(data) });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "draft-write", limit: 90 });
    const gallery = await getPublicSelectGallery(db, shareToken);
    assertPublicGalleryAvailable(gallery);
    if (!gallery.allow_web_select) return Response.json({ ok: false, error: "웹 사진 선택이 허용되지 않았습니다." }, { status: 403 });

    const { data: existing, error: draftError } = await db
      .from("select_gallery_drafts")
      .select("*")
      .eq("gallery_id", gallery.id)
      .maybeSingle();
    if (draftError) throw draftError;
    const body = await readPublicSelectionJson(request);
    const ownedImageIds = await getOwnedSelectionImageIds(db, {
      table: "select_gallery_images",
      ownerColumn: "gallery_id",
      ownerId: gallery.id,
    }, body);
    const parsed = parsePublicSelectionDraft(body, ownedImageIds);

    const current = existing?.token_version === gallery.share_token_version ? existing : null;
    if (parsed.revision !== Number(current?.revision ?? 0)) {
      return Response.json({ ok: false, error: "다른 화면에서 선택 내용이 변경되었습니다.", draft: draftResponse(current) }, { status: 409 });
    }

    const ratings = Object.fromEntries(parsed.items.filter((item) => item.rating !== null).map((item) => [item.imageId, item.rating]));
    const imageNotes = Object.fromEntries(parsed.items.filter((item) => item.memo).map((item) => [item.imageId, item.memo]));
    const nextRevision = parsed.revision + 1;
    const values = {
      token_version: gallery.share_token_version,
      revision: nextRevision,
      selected_image_ids: parsed.items.map((item) => item.imageId),
      ratings,
      image_notes: imageNotes,
      customer_memo: parsed.customerMemo,
      updated_at: new Date().toISOString(),
    };

    let saved: any;
    if (!existing) {
      const { data, error } = await db
        .from("select_gallery_drafts")
        .insert({ gallery_id: gallery.id, ...values })
        .select("*")
        .single();
      if (error) throw error;
      saved = data;
    } else {
      let update = db.from("select_gallery_drafts")
        .update(values)
        .eq("gallery_id", gallery.id);
      if (current) update = update.eq("revision", parsed.revision).eq("token_version", gallery.share_token_version);
      else update = update.eq("token_version", existing.token_version);
      const { data, error } = await update.select("*").maybeSingle();
      if (error) throw error;
      if (!data) {
        return Response.json({ ok: false, error: "다른 화면에서 선택 내용이 변경되었습니다." }, { status: 409 });
      }
      saved = data;
    }
    return Response.json({ ok: true, draft: draftResponse(saved) });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}
