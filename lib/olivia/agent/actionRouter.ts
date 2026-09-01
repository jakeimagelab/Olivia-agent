import { useWorkspaceStore } from "@/lib/store/workspaceStore";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";
import { useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import { navigateToFeature, syncCanonicalWorkspaceUrl } from "@/lib/olivia/features/navigationBridge";
import { workspaceRegistry } from "@/components/workspace/WorkspaceRegistry";

const HOME_PREFIX = "/admin/dashboard/home";

// Olivia 2.0 Phase 1 — 채팅/카드로 워크스페이스를 열거나 바꿀 때, 지금 홈이 아니면 주소창도
// 그 워크스페이스의 canonical direct route로 맞춰준다. 홈은 이미 인라인으로 스플릿을
// 보여주므로 이동하지 않는다 — 그 외(다른 워크스페이스 직접 라우트, 미지원 페이지)에서는
// 이렇게 URL을 맞춰야 OliviaWorkspaceShell이 실제로 화면을 그린다(그 판단이 pathname
// 기준이라서다). store 갱신 → URL 갱신 순서로 호출하므로, 이동한 URL은 이미 store와 일치한
// 상태다 — OliviaWorkspaceShell의 자동 닫기 감시(pathname watcher)와 경합하지 않는다.
function syncUrlIfNotHome(workspace: Exclude<OliviaUiAction extends { workspace: infer W } ? W : never, undefined>) {
  if (typeof window !== "undefined" && window.location.pathname.startsWith(HOME_PREFIX)) return;
  const canonical = workspaceRegistry[workspace]?.directRoutes?.[0];
  if (!canonical) return;
  const context = useOliviaContextStore.getState();
  syncCanonicalWorkspaceUrl(canonical, { clientId: context.activeClientId, workflowRunId: context.activeProjectId });
}

// Olivia Agent 2.0 — OliviaUiAction 하나를 실제 store 변경으로 옮긴다. 채팅 컴포넌트는
// executeOliviaAction(action)만 부르면 되고, 어떤 store를 어떻게 바꾸는지는 여기 한 곳에만
// 있다 — tool 이름별 if문을 채팅 컴포넌트에 늘어놓지 않기 위한 지점.
export function executeOliviaAction(action: OliviaUiAction) {
  const workspace = useWorkspaceStore.getState();
  const context = useOliviaContextStore.getState();
  const layout = useOliviaLayoutStore.getState();

  switch (action.type) {
    case "OPEN_WORKSPACE": {
      workspace.openWorkspace(action.workspace, {
        clientId: action.clientId,
        workflowRunId: action.workflowRunId,
        resourceId: action.resourceId,
        clientName: action.clientName,
        projectName: action.projectName,
        // 카드 클릭과 채팅 명령이 모두 이 함수를 거치므로(§1-3 규칙), 여기서 여는 워크스페이스는
        // "명시적 사용자 요청"이다 — 페이지 이동만으로 자동으로 닫히면 안 된다(openedBy:"route"만
        // 자동으로 닫힌다, WorkspaceRegistry.ts의 shouldAutoCloseWorkspace 참고).
        openedBy: "chat",
      });
      context.setWorkspace(action.workspace, action.resourceId);
      if (action.clientId) context.setClient(action.clientId, action.clientName);
      if (action.workflowRunId || action.projectName) context.setProject(action.workflowRunId, action.projectName);
      context.recordAction(`open:${action.workspace}`);
      layout.openWorkspaceMode();
      syncUrlIfNotHome(action.workspace);
      return;
    }
    case "SWITCH_WORKSPACE": {
      workspace.switchWorkspace(action.workspace, {
        resourceId: action.resourceId,
        clientId: action.clientId,
        workflowRunId: action.workflowRunId,
        clientName: action.clientName,
        projectName: action.projectName,
        startInPreview: action.startInPreview,
        openedBy: "chat",
      });
      context.setWorkspace(action.workspace, action.resourceId);
      if (action.clientId) context.setClient(action.clientId, action.clientName);
      if (action.workflowRunId || action.projectName) context.setProject(action.workflowRunId, action.projectName);
      context.recordAction(`switch:${action.workspace}`);
      layout.openWorkspaceMode();
      syncUrlIfNotHome(action.workspace);
      return;
    }
    case "CLOSE_WORKSPACE": {
      workspace.closeWorkspace();
      context.setWorkspace(undefined, undefined);
      context.clearSelection();
      layout.closeWorkspaceMode();
      return;
    }
    case "ENTER_FULLSCREEN": {
      workspace.enterFullscreen();
      layout.enterFullscreen();
      return;
    }
    case "EXIT_FULLSCREEN": {
      workspace.exitFullscreen();
      layout.exitFullscreen();
      return;
    }
    case "UPDATE_CONTEXT": {
      if (action.clientId !== undefined || action.clientName !== undefined) context.setClient(action.clientId, action.clientName);
      if (action.projectId !== undefined || action.projectName !== undefined) context.setProject(action.projectId, action.projectName);
      context.recordAction("context:update");
      return;
    }
    case "REFRESH_RESOURCE": {
      context.setResource(action.resourceId);
      context.pushRecentAction({ type: `refresh:${action.resource || "resource"}`, at: new Date().toISOString(), entityId: action.changedEntityId || action.resourceId, before: action.before, after: action.after });
      if (typeof window !== "undefined") {
        // before/after/changedEntityId를 실어 보낸다 — QuoteBuilder.tsx는 after(견적 mutation
        // tool이 저장한 DB row)가 있으면 다시 fetch하지 않고 그 값으로 dirty하지 않은 필드만
        // 바로 patch한다(useQuoteStore.patchFromAgent, Phase 3). resource/resourceId만 읽는
        // 다른 리스너(ContractBuilder.tsx, ContiBuilder.tsx)는 그대로 무시하므로 추가만 해도
        // 안전하다.
        window.dispatchEvent(new CustomEvent("olivia-resource-refresh", {
          detail: { resource: action.resource, resourceId: action.resourceId, changedEntityId: action.changedEntityId, before: action.before, after: action.after },
        }));
      }
      return;
    }
    case "SET_SELECTION": {
      context.setSelection(action.entityType, action.entityId);
      context.recordAction(`select:${action.entityType}:${action.entityId}`);
      return;
    }
    case "PREVIEW_QUOTE": {
      context.setResource(action.resourceId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("olivia-quote-preview", { detail: { resourceId: action.resourceId } }));
      }
      return;
    }
    case "REQUEST_APPROVAL":
      return;
    // OPEN_CLIENT_TASK는 useOliviaConversationStore.ts의 ui_action 분기가 REQUEST_APPROVAL과
    // 동일하게 미리 가로채(메시지에 client_task 블록 추가 + 플로우 스토어 시딩) 처리하므로
    // 여기까지 도달하지 않는다 — exhaustive switch를 통과시키기 위한 no-op.
    case "OPEN_CLIENT_TASK":
      return;
    // DOWNLOAD_QUOTE_PDF도 같은 이유로 useOliviaConversationStore.ts가 미리 가로챈다 — 여기서
    // useQuoteStore.pdfHandler를 부르면 그 결과(성공/실패)를 채팅 메시지로 남겨야 하는데,
    // 이 파일이 useOliviaConversationStore를 다시 import하면 그쪽이 이미 actionRouter.ts를
    // import하고 있어 순환 참조가 된다.
    case "DOWNLOAD_QUOTE_PDF":
      return;
    // DOWNLOAD_CONTRACT_PDF도 같은 순환참조 회피 이유로 useOliviaConversationStore.ts가
    // 미리 가로챈다(2026-08-30, PHASE 3).
    case "DOWNLOAD_CONTRACT_PDF":
      return;
    // RENAME/MERGE/SPLIT_PHOTO_SCENE도 같은 순환참조 회피 이유로 useOliviaConversationStore.ts가
    // 미리 가로채 usePhotoClassificationActionsStore에 등록된 함수를 직접 호출한다(PHASE 4,
    // 2026-08-30).
    case "RENAME_PHOTO_SCENE":
    case "MERGE_PHOTO_SCENES":
    case "SPLIT_PHOTO_SCENE":
      return;
    case "OPEN_FEATURE": {
      context.recordAction(`feature:open:${action.href}`);
      navigateToFeature(action.href);
      return;
    }
  }
}

export function executeOliviaActions(actions: OliviaUiAction[]) {
  for (const action of actions) executeOliviaAction(action);
}
