import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { normalizeIdList } from "@/lib/pcrm/gallery";
import { mapGalleryRpcError, verifyPortalSelectGallery } from "@/lib/pcrm/galleryServer";
import { getPortalProjectContext, pcrmError, pcrmOk } from "@/lib/pcrm/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 링크로 다시 접속해주세요.", 401);
  const body = await req.json().catch(() => null);
  const galleryId = String(body?.galleryId ?? "");
  const verified = await verifyPortalSelectGallery(context.db, context.session, galleryId);
  if (!verified) return pcrmError("공개된 셀렉 갤러리를 찾을 수 없습니다.", 404);

  const selectedImageIds = normalizeIdList(body?.selectedImageIds);
  if (selectedImageIds.length === 0) return pcrmError("한 장 이상의 사진을 선택해주세요.", 400);
  const requestKey = String(body?.requestKey ?? randomUUID()).trim().slice(0, 100);
  const customerMemo = String(body?.customerMemo ?? "").trim().slice(0, 5_000);
  const { data, error } = await context.db.rpc("submit_pcrm_photo_selection", {
    p_client_id: context.session.clientId,
    p_workflow_run_id: context.session.workflowRunId,
    p_gallery_id: galleryId,
    p_selected_image_ids: selectedImageIds,
    p_customer_memo: customerMemo,
    p_request_key: requestKey,
  });
  if (error) {
    const mapped = mapGalleryRpcError(error.message);
    return pcrmError(mapped.message, mapped.status);
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (result?.created) {
    await recordPcrmActivitySafely(context.db, {
      clientId: context.session.clientId,
      workflowRunId: context.session.workflowRunId,
      actorType: "client",
      actorName: context.session.clientName,
      actionType: "photo_selection_submitted",
      title: `사진 ${result.selected_count}장 셀렉 제출`,
      description: customerMemo,
      relatedType: "select_gallery",
      relatedId: galleryId,
    });
  }
  return pcrmOk({ selection: result });
}
