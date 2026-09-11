import { NextRequest } from "next/server";
import { isHermesFallbackSafe, runHermesChat } from "@/lib/hermes/client";
import type { HermesChatContext } from "@/lib/hermes/types";
import { isAdminSession } from "@/lib/passkey";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function isInternalServerRequest(request: NextRequest): boolean {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return false;
  return request.headers.get("x-internal-key") === key;
}

export async function POST(request: NextRequest) {
  // 관리자 세션(브라우저 쿠키) 또는 내부 서버 호출(Telegram webhook 등, app/api/telegram/route.ts와
  // 동일한 x-internal-key 패턴) 둘 중 하나만 통과하면 된다 — Telegram은 브라우저 쿠키가 없다.
  if (!isAdminSession(request) && !isInternalServerRequest(request)) {
    return Response.json({ success: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ success: false, error: "메시지를 입력해주세요." }, { status: 400 });

  const rawContext = body.context && typeof body.context === "object" && !Array.isArray(body.context)
    ? body.context as Record<string, unknown>
    : {};
  const context: HermesChatContext = {
    recentActions: Array.isArray(rawContext.recentActions) ? rawContext.recentActions as HermesChatContext["recentActions"] : [],
    recentEntities: Array.isArray(rawContext.recentEntities) ? rawContext.recentEntities as HermesChatContext["recentEntities"] : undefined,
    aliases: rawContext.aliases && typeof rawContext.aliases === "object" && !Array.isArray(rawContext.aliases) ? rawContext.aliases as HermesChatContext["aliases"] : undefined,
    revision: typeof rawContext.revision === "number" ? rawContext.revision : 0,
    pathname: typeof rawContext.pathname === "string" ? rawContext.pathname : undefined,
    today: typeof rawContext.today === "string" ? rawContext.today : undefined,
    channel: (["web", "telegram", "kakao", "voice"] as const).find((channel) => channel === rawContext.channel),
    activeClientId: typeof rawContext.activeClientId === "string" ? rawContext.activeClientId : undefined,
    activeClientName: typeof rawContext.activeClientName === "string" ? rawContext.activeClientName : undefined,
    activeProjectId: typeof rawContext.activeProjectId === "string" ? rawContext.activeProjectId : undefined,
    activeProjectName: typeof rawContext.activeProjectName === "string" ? rawContext.activeProjectName : undefined,
    activeWorkspace: typeof rawContext.activeWorkspace === "string" ? rawContext.activeWorkspace : undefined,
    activeResourceId: typeof rawContext.activeResourceId === "string" ? rawContext.activeResourceId : undefined,
    currentDocumentId: typeof rawContext.currentDocumentId === "string" ? rawContext.currentDocumentId : undefined,
    currentDocumentType: typeof rawContext.currentDocumentType === "string" ? rawContext.currentDocumentType : undefined,
    currentDocumentTitle: typeof rawContext.currentDocumentTitle === "string" ? rawContext.currentDocumentTitle : undefined,
    currentDocumentTotal: typeof rawContext.currentDocumentTotal === "number" ? rawContext.currentDocumentTotal : undefined,
    currentDocumentDirty: typeof rawContext.currentDocumentDirty === "boolean" ? rawContext.currentDocumentDirty : undefined,
    selectedEntityType: typeof rawContext.selectedEntityType === "string" ? rawContext.selectedEntityType : undefined,
    selectedEntityId: typeof rawContext.selectedEntityId === "string" ? rawContext.selectedEntityId : undefined,
    documentStatus: typeof rawContext.documentStatus === "string" ? rawContext.documentStatus : undefined,
    canEdit: typeof rawContext.canEdit === "boolean" ? rawContext.canEdit : undefined,
    canFinalize: typeof rawContext.canFinalize === "boolean" ? rawContext.canFinalize : undefined,
    capabilities: Array.isArray(rawContext.capabilities) ? rawContext.capabilities.filter((item): item is string => typeof item === "string") : undefined,
    todayDate: typeof rawContext.todayDate === "string" ? rawContext.todayDate : undefined,
    focusDate: typeof rawContext.focusDate === "string" ? rawContext.focusDate : undefined,
    activeClient: rawContext.activeClient && typeof rawContext.activeClient === "object" ? rawContext.activeClient as HermesChatContext["activeClient"] : undefined,
    activeProject: rawContext.activeProject && typeof rawContext.activeProject === "object" ? rawContext.activeProject as HermesChatContext["activeProject"] : undefined,
    activeResource: rawContext.activeResource && typeof rawContext.activeResource === "object" ? rawContext.activeResource as HermesChatContext["activeResource"] : undefined,
    selectedEntity: rawContext.selectedEntity && typeof rawContext.selectedEntity === "object" ? rawContext.selectedEntity as HermesChatContext["selectedEntity"] : undefined,
    selectedRowId: typeof rawContext.selectedRowId === "string" ? rawContext.selectedRowId : undefined,
    selectedSceneId: typeof rawContext.selectedSceneId === "string" ? rawContext.selectedSceneId : undefined,
    selectedScheduleId: typeof rawContext.selectedScheduleId === "string" ? rawContext.selectedScheduleId : undefined,
    brand: typeof rawContext.brand === "string" ? rawContext.brand : undefined,
    permissions: rawContext.permissions && typeof rawContext.permissions === "object" ? rawContext.permissions as HermesChatContext["permissions"] : undefined,
    workSession: rawContext.workSession && typeof rawContext.workSession === "object" ? rawContext.workSession as HermesChatContext["workSession"] : undefined,
  };

  try {
    const result = await runHermesChat({
      message,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      context,
      signal: request.signal,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hermes Agent 요청에 실패했습니다.";
    return Response.json({ success: false, error: message, fallbackSafe: isHermesFallbackSafe(error) }, { status: 502 });
  }
}
