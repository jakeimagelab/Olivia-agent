import { useWorkspaceStore } from "@/lib/store/workspaceStore";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";

// Olivia Agent 2.0 — OliviaUiAction 하나를 실제 store 변경으로 옮긴다. 채팅 컴포넌트는
// executeOliviaAction(action)만 부르면 되고, 어떤 store를 어떻게 바꾸는지는 여기 한 곳에만
// 있다 — tool 이름별 if문을 채팅 컴포넌트에 늘어놓지 않기 위한 지점.
export function executeOliviaAction(action: OliviaUiAction) {
  const workspace = useWorkspaceStore.getState();
  const context = useOliviaContextStore.getState();

  switch (action.type) {
    case "OPEN_WORKSPACE": {
      workspace.openWorkspace(action.workspace, {
        clientId: action.clientId,
        workflowRunId: action.workflowRunId,
        resourceId: action.resourceId,
        clientName: action.clientName,
        projectName: action.projectName,
      });
      context.setWorkspace(action.workspace, action.resourceId);
      if (action.clientId) context.setClient(action.clientId, action.clientName);
      return;
    }
    case "SWITCH_WORKSPACE": {
      workspace.switchWorkspace(action.workspace, { resourceId: action.resourceId });
      context.setWorkspace(action.workspace, action.resourceId);
      return;
    }
    case "CLOSE_WORKSPACE": {
      workspace.closeWorkspace();
      context.setWorkspace(undefined, undefined);
      return;
    }
    case "ENTER_FULLSCREEN": {
      workspace.enterFullscreen();
      return;
    }
    case "EXIT_FULLSCREEN": {
      workspace.exitFullscreen();
      return;
    }
    case "UPDATE_CONTEXT": {
      if (action.clientId !== undefined || action.clientName !== undefined) context.setClient(action.clientId, action.clientName);
      if (action.projectId !== undefined || action.projectName !== undefined) context.setProject(action.projectId, action.projectName);
      return;
    }
    case "REFRESH_RESOURCE": {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("olivia-resource-refresh", { detail: { resource: action.resource } }));
      }
      return;
    }
  }
}

export function executeOliviaActions(actions: OliviaUiAction[]) {
  for (const action of actions) executeOliviaAction(action);
}
