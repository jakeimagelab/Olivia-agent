import { NextRequest } from "next/server";
import { validatePhotoAnnotation } from "@/lib/pcrm/gallery";
import { getPortalProjectContext, pcrmError, pcrmOk } from "@/lib/pcrm/server";
import { isPcrmUuid } from "@/lib/pcrm/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ annotationId: string }> }) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 링크로 다시 접속해주세요.", 401);
  const { annotationId } = await params;
  if (!isPcrmUuid(annotationId)) return pcrmError("수정 표시 ID가 올바르지 않습니다.", 400);
  const body = await req.json().catch(() => null);
  const validation = validatePhotoAnnotation(body);
  if (!validation.ok) return pcrmError(validation.error, 400);
  const { data, error } = await context.db.from("pcrm_photo_annotations").update({
    x_ratio: validation.value.xRatio,
    y_ratio: validation.value.yRatio,
    content: validation.value.content,
  })
    .eq("id", annotationId)
    .eq("client_id", context.session.clientId)
    .eq("workflow_run_id", context.session.workflowRunId!)
    .eq("image_id", validation.value.imageId)
    .eq("status", "draft")
    .select()
    .maybeSingle();
  if (error) return pcrmError(error.message, 500);
  if (!data) return pcrmError("제출된 수정 표시는 변경할 수 없습니다.", 409);
  return pcrmOk({ annotation: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ annotationId: string }> }) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 링크로 다시 접속해주세요.", 401);
  const { annotationId } = await params;
  if (!isPcrmUuid(annotationId)) return pcrmError("수정 표시 ID가 올바르지 않습니다.", 400);
  const { data, error } = await context.db.from("pcrm_photo_annotations").delete()
    .eq("id", annotationId)
    .eq("client_id", context.session.clientId)
    .eq("workflow_run_id", context.session.workflowRunId!)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error) return pcrmError(error.message, 500);
  if (!data) return pcrmError("제출된 수정 표시는 삭제할 수 없습니다.", 409);
  return pcrmOk();
}
