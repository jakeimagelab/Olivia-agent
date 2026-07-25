import { NextRequest } from "next/server";
import { normalizeIdList, normalizeImageNotes } from "@/lib/pcrm/gallery";
import { getPublishedPortalResource, verifyPortalSelectGallery } from "@/lib/pcrm/galleryServer";
import { getPortalProjectContext, pcrmError, pcrmOk } from "@/lib/pcrm/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 링크로 다시 접속해주세요.", 401);
  const { db, session } = context;

  const [selectPublication, retouchedPublication, finalPublication] = await Promise.all([
    getPublishedPortalResource(db, session, "select_gallery"),
    getPublishedPortalResource(db, session, "gallery"),
    getPublishedPortalResource(db, session, "final_delivery"),
  ]);

  const selectGalleryId = selectPublication?.related_id;
  const retouchedGalleryId = retouchedPublication?.related_id;
  const finalGalleryId = finalPublication?.related_id;

  const [
    selectGalleryResult,
    imagesResult,
    draftResult,
    selectionsResult,
    retouchedResult,
    finalResult,
    annotationsResult,
    confirmationResult,
  ] = await Promise.all([
    selectGalleryId
      ? db.from("select_galleries").select("*").eq("id", selectGalleryId).eq("client_id", session.clientId).eq("workflow_run_id", session.workflowRunId!).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    selectGalleryId
      ? db.from("select_gallery_images").select("*").eq("gallery_id", selectGalleryId).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
    selectGalleryId
      ? db.from("pcrm_selection_drafts").select("*").eq("workflow_run_id", session.workflowRunId!).eq("gallery_id", selectGalleryId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    selectGalleryId
      ? db.from("client_photo_selections").select("*").eq("gallery_id", selectGalleryId).order("submitted_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    retouchedGalleryId
      ? db.from("photo_galleries").select("*,items:photo_gallery_items(*)").eq("id", retouchedGalleryId).eq("client_id", session.clientId).eq("workflow_run_id", session.workflowRunId!).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    finalGalleryId
      ? db.from("photo_galleries").select("*,items:photo_gallery_items(*)").eq("id", finalGalleryId).eq("client_id", session.clientId).eq("workflow_run_id", session.workflowRunId!).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    retouchedGalleryId
      ? db.from("pcrm_photo_annotations").select("*").eq("workflow_run_id", session.workflowRunId!).eq("gallery_id", retouchedGalleryId).order("image_id").order("marker_number")
      : Promise.resolve({ data: [], error: null }),
    finalPublication
      ? db.from("pcrm_delivery_confirmations").select("*").eq("workflow_run_id", session.workflowRunId!).eq("publication_id", finalPublication.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const firstError = [
    selectGalleryResult.error,
    imagesResult.error,
    draftResult.error,
    selectionsResult.error,
    retouchedResult.error,
    finalResult.error,
    annotationsResult.error,
    confirmationResult.error,
  ].find(Boolean);
  if (firstError) return pcrmError(firstError.message, 500);

  return pcrmOk({
    workspace: {
      selection: {
        publication: selectPublication,
        gallery: selectGalleryResult.data,
        images: imagesResult.data ?? [],
        draft: draftResult.data,
        submissions: selectionsResult.data ?? [],
      },
      retouched: {
        publication: retouchedPublication,
        gallery: retouchedResult.data,
        annotations: annotationsResult.data ?? [],
      },
      finalDelivery: {
        publication: finalPublication,
        gallery: finalResult.data,
        confirmation: confirmationResult.data,
      },
    },
  });
}

export async function PUT(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 링크로 다시 접속해주세요.", 401);
  const body = await req.json().catch(() => null);
  const galleryId = String(body?.galleryId ?? "");
  const verified = await verifyPortalSelectGallery(context.db, context.session, galleryId);
  if (!verified) return pcrmError("공개된 셀렉 갤러리를 찾을 수 없습니다.", 404);
  if (new Date(verified.gallery.file_expires_at).getTime() <= Date.now()) {
    return pcrmError("사진 보관 기간이 만료되었습니다. 담당자에게 문의해주세요.", 409);
  }

  const { data: imageRows, error: imageError } = await context.db.from("select_gallery_images")
    .select("id")
    .eq("gallery_id", galleryId);
  if (imageError) return pcrmError(imageError.message, 500);
  const allowedIds = new Set((imageRows ?? []).map((row) => row.id));
  const selectedImageIds = normalizeIdList(body?.selectedImageIds).filter((id) => allowedIds.has(id));
  const favoriteImageIds = normalizeIdList(body?.favoriteImageIds).filter((id) => allowedIds.has(id));
  if (normalizeIdList(body?.selectedImageIds).length !== selectedImageIds.length) {
    return pcrmError("선택 목록에 존재하지 않는 사진이 포함되어 있습니다.", 400);
  }
  const imageNotes = normalizeImageNotes(body?.imageNotes, allowedIds);
  const customerMemo = String(body?.customerMemo ?? "").trim().slice(0, 5_000);
  const { data, error } = await context.db.from("pcrm_selection_drafts").upsert({
    client_id: context.session.clientId,
    workflow_run_id: context.session.workflowRunId,
    gallery_id: galleryId,
    selected_image_ids: selectedImageIds,
    favorite_image_ids: favoriteImageIds,
    image_notes: imageNotes,
    customer_memo: customerMemo,
  }, { onConflict: "workflow_run_id,gallery_id" }).select().single();
  if (error) return pcrmError(error.message, 500);
  return pcrmOk({ draft: data });
}
