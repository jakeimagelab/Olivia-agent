import { NextRequest } from "next/server";
import { verifyAndRecordTaskAttachment } from "@/lib/googleDrive/roomDrive";
import { canEditTask } from "@/lib/teamWorkspace/permissions";
import { apiError, apiOk, getTeamWorkspaceContext, loadTaskPermission } from "@/lib/teamWorkspace/server";
import { recordTaskEvent } from "@/lib/teamWorkspace/taskEvents";
import { isUuid } from "@/lib/teamWorkspace/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!isUuid(taskId)) return apiError("업무 ID가 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const access = await loadTaskPermission(taskId, context.actor.id);
  if (!access || !canEditTask(context.actor, access.permission)) return apiError("첨부 권한이 없습니다.", 403);
  const body = await req.json().catch(() => null);
  const driveFileId = String(body?.driveFileId ?? "");
  const fileName = String(body?.fileName ?? "").trim();
  if (!driveFileId || !fileName) return apiError("첨부파일 정보가 올바르지 않습니다.");
  try {
    const attachment = await verifyAndRecordTaskAttachment({
      taskId,
      uploadedBy: context.actor.id,
      driveFileId,
      fileName,
      mimeType: body?.mimeType,
      sizeBytes: Number(body?.sizeBytes) || undefined,
    });
    await recordTaskEvent({
      taskId,
      actorId: context.actor.id,
      eventType: "attachment_added",
      toValue: driveFileId,
      note: fileName,
    });
    return apiOk({ attachment }, 201);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "첨부파일 등록에 실패했습니다.", 500);
  }
}
