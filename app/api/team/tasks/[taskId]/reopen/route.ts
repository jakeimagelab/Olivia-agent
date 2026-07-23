import { NextRequest } from "next/server";
import { apiError, apiOk, getTeamWorkspaceContext } from "@/lib/teamWorkspace/server";
import { performTaskAction } from "@/lib/teamWorkspace/taskActions";
import { isUuid } from "@/lib/teamWorkspace/validation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!isUuid(taskId)) return apiError("업무 ID가 올바르지 않습니다.");
  const context = await getTeamWorkspaceContext(req);
  if (!context) return apiError("로그인이 필요합니다.", 401);
  const result = await performTaskAction({ context, taskId, action: "reopen" });
  return result.ok ? apiOk({ task: result.task }) : apiError(result.error, result.status);
}
