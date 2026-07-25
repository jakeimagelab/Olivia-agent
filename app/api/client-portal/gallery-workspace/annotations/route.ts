import { NextRequest } from "next/server";
import { validatePhotoAnnotation } from "@/lib/pcrm/gallery";
import { verifyPortalPhotoGallery } from "@/lib/pcrm/galleryServer";
import { getPortalProjectContext, pcrmError, pcrmOk } from "@/lib/pcrm/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 링크로 다시 접속해주세요.", 401);
  const body = await req.json().catch(() => null);
  const galleryId = String(body?.galleryId ?? "");
  const validation = validatePhotoAnnotation(body);
  if (!validation.ok) return pcrmError(validation.error, 400);
  const verified = await verifyPortalPhotoGallery(context.db, context.session, galleryId, "gallery");
  if (!verified) return pcrmError("공개된 보정 갤러리를 찾을 수 없습니다.", 404);
  const image = (verified.gallery.items ?? []).find((item: { id: string }) => item.id === validation.value.imageId);
  if (!image) return pcrmError("이 갤러리에 포함된 사진이 아닙니다.", 400);

  const { data: latest } = await context.db.from("pcrm_photo_annotations")
    .select("marker_number")
    .eq("workflow_run_id", context.session.workflowRunId!)
    .eq("image_id", validation.value.imageId)
    .order("marker_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await context.db.from("pcrm_photo_annotations").insert({
    client_id: context.session.clientId,
    workflow_run_id: context.session.workflowRunId,
    gallery_id: galleryId,
    image_id: validation.value.imageId,
    marker_number: (latest?.marker_number ?? 0) + 1,
    x_ratio: validation.value.xRatio,
    y_ratio: validation.value.yRatio,
    content: validation.value.content,
    status: "draft",
  }).select().single();
  if (error) return pcrmError(error.message, 500);
  return pcrmOk({ annotation: data }, 201);
}
