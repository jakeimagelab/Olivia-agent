import { NextRequest } from "next/server";
import { createTaskAttachmentUploadSession } from "@/lib/googleDrive/roomDrive";
import { canEditTask } from "@/lib/teamWorkspace/permissions";
import { apiError, apiOk, getTeamWorkspaceContext, loadTaskPermission } from "@/lib/teamWorkspace/server";
import { isUuid } from "@/lib/teamWorkspace/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!isUuid(taskId)) return apiError("업무 ID가 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const access = await loadTaskPermission(taskId, context.actor.id);
  if (!access || !canEditTask(context.actor, access.permission)) return apiError("첨부 권한이 없습니다.", 403);
  const body = await req.json().catch(() => null);
  const fileName = String(body?.fileName ?? "").trim();
  const mimeType = String(body?.mimeType ?? "application/octet-stream");
  const fileSize = Number(body?.fileSize ?? 0);
  if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) return apiError("파일 정보가 올바르지 않습니다.");
  if (fileSize > MAX_FILE_SIZE) return apiError("파일은 2GB 이하만 업로드할 수 있습니다.");
  try {
    const session = await createTaskAttachmentUploadSession({ taskId, fileName, mimeType, fileSize });
    return apiOk(session);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "업로드 준비에 실패했습니다.", 500);
  }
}
