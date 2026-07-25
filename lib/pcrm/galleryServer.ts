import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalSession } from "@/lib/clientPortal";

export async function getPublishedPortalResource(
  db: SupabaseClient,
  session: PortalSession,
  relatedType: "select_gallery" | "gallery" | "final_delivery",
  relatedId?: string,
) {
  let query = db.from("pcrm_publications")
    .select("*")
    .eq("client_id", session.clientId)
    .eq("workflow_run_id", session.workflowRunId!)
    .eq("related_type", relatedType)
    .in("status", ["published", "viewed", "revision_requested", "approved", "completed"])
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (relatedId) query = query.eq("related_id", relatedId);
  const { data } = await query.limit(1).maybeSingle();
  return data;
}

export async function verifyPortalSelectGallery(
  db: SupabaseClient,
  session: PortalSession,
  galleryId: string,
) {
  if (!galleryId || !session.workflowRunId) return null;
  const [galleryResult, publication] = await Promise.all([
    db.from("select_galleries")
      .select("*")
      .eq("id", galleryId)
      .eq("client_id", session.clientId)
      .eq("workflow_run_id", session.workflowRunId)
      .maybeSingle(),
    getPublishedPortalResource(db, session, "select_gallery", galleryId),
  ]);
  return galleryResult.data && publication ? { gallery: galleryResult.data, publication } : null;
}

export async function verifyPortalPhotoGallery(
  db: SupabaseClient,
  session: PortalSession,
  galleryId: string,
  relatedType: "gallery" | "final_delivery",
) {
  if (!galleryId || !session.workflowRunId) return null;
  const [galleryResult, publication] = await Promise.all([
    db.from("photo_galleries")
      .select("*,items:photo_gallery_items(*)")
      .eq("id", galleryId)
      .eq("client_id", session.clientId)
      .eq("workflow_run_id", session.workflowRunId)
      .maybeSingle(),
    getPublishedPortalResource(db, session, relatedType, galleryId),
  ]);
  return galleryResult.data && publication ? { gallery: galleryResult.data, publication } : null;
}

export function mapGalleryRpcError(message: string) {
  if (message.includes("GALLERY_NOT_FOUND")) return { status: 404, message: "셀렉 갤러리를 찾을 수 없습니다." };
  if (message.includes("OWNERSHIP_MISMATCH")) return { status: 403, message: "이 프로젝트의 갤러리가 아닙니다." };
  if (message.includes("GALLERY_EXPIRED")) return { status: 409, message: "사진 보관 기간이 만료되었습니다. 담당자에게 문의해주세요." };
  if (message.includes("SELECTION_REQUIRED")) return { status: 400, message: "한 장 이상의 사진을 선택해주세요." };
  if (message.includes("INVALID_IMAGE_SELECTION")) return { status: 400, message: "선택 목록에 존재하지 않는 사진이 포함되어 있습니다." };
  return { status: 500, message: "사진 선택을 저장하지 못했습니다. 잠시 후 다시 시도해주세요." };
}
