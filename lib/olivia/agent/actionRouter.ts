import { useWorkspaceStore, type WorkspaceType } from "@/lib/store/workspaceStore";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";
import { useOliviaLayoutStore } from "@/lib/store/useOliviaLayoutStore";
import { navigateToFeature, syncCanonicalWorkspaceUrl } from "@/lib/olivia/features/navigationBridge";
import { workspaceRegistry } from "@/components/workspace/WorkspaceRegistry";
import { useOliviaDesktopStore, DESKTOP_DOCK_SAFE_AREA, type OpenAppInput } from "@/lib/store/useOliviaDesktopStore";
import { getOliviaApp } from "@/components/olivia-os/registry/oliviaAppRegistry";
import { resolveSnapBounds } from "@/components/olivia-os/window/snapZones";

const HOME_PREFIX = "/admin/dashboard/home";

// OLIVIA OS Chat → Desktop Window Routing Fix(P0) — OS의 canonical route에서는 채팅 명령이
// legacy full-page route로 이동하면 안 된다(대신 AppWindow open/focus). "/desktop"과 "/"만
// 대상이다 — /admin/dashboard/home은 여전히 legacy 홈이라 기존 인라인 스플릿 동작을 그대로 쓴다.
const OLIVIA_OS_PATHS = new Set(["/", "/desktop"]);

function isOliviaOsRoute() {
  return typeof window !== "undefined" && OLIVIA_OS_PATHS.has(window.location.pathname);
}

// Workspace 타입 → Desktop App. title/width/height는 oliviaAppRegistry를 단일 진실 공급원으로
// 삼아 가져온다(중복 하드코딩 방지) — registry에 없는 타입은 매핑에서 제외된다.
function desktopAppInputFor(appId: string): OpenAppInput | undefined {
  const app = getOliviaApp(appId);
  if (!app) return undefined;
  return { appId, title: app.title, width: app.defaultSize.width, height: app.defaultSize.height };
}

const WORKSPACE_TO_DESKTOP_APP_ID: Partial<Record<Exclude<WorkspaceType, null>, string>> = {
  quote: "quote",
  contract: "contract",
  conti: "conti",
  "photo-sort": "photo-workspace",
};

// OPEN_FEATURE의 href → Desktop App. navigateToFeature(action.href)가 legacy에서 쓰는 원본
// href 그대로를 key로 쓴다(getCanonicalWorkspaceHref로 정규화하지 않음 — /quote와 /photoclinic이
// 서로 다른 경로로 들어와도 둘 다 같은 quote 창으로 연결되어야 하므로 정규화 전 원본을 그대로
// 매핑한다).
const FEATURE_HREF_TO_DESKTOP_APP_ID: Record<string, string> = {
  "/clients": "customer",
  "/calendar": "calendar",
  "/photo-sorting": "photo-workspace",
  "/review-studio": "review-studio",
  "/contract": "contract",
  "/conti": "conti",
  "/quote": "quote",
  "/photoclinic": "quote",
};

// Desktop의 singleton 모델(창 id === appId) 그대로 open/focus/restore를 재사용한다 —
// components/olivia-os/DesktopDock.tsx의 handleDockClick과 동일한 규칙.
function openOrFocusDesktopApp(input: OpenAppInput) {
  const store = useOliviaDesktopStore.getState();
  const win = store.windows[input.appId];
  if (!win) { store.openApp(input); return; }
  if (win.minimized) { store.restoreWindow(input.appId); return; }
  store.focusWindow(input.appId);
}

// Olivia 2.0 Phase 1 — 채팅/카드로 워크스페이스를 열거나 바꿀 때, 지금 홈이 아니면 주소창도
// 그 워크스페이스의 canonical direct route로 맞춰준다. 홈은 이미 인라인으로 스플릿을
// 보여주므로 이동하지 않는다 — 그 외(다른 워크스페이스 직접 라우트, 미지원 페이지)에서는
// 이렇게 URL을 맞춰야 OliviaWorkspaceShell이 실제로 화면을 그린다(그 판단이 pathname
// 기준이라서다). store 갱신 → URL 갱신 순서로 호출하므로, 이동한 URL은 이미 store와 일치한
// 상태다 — OliviaWorkspaceShell의 자동 닫기 감시(pathname watcher)와 경합하지 않는다.
// OLIVIA OS(P0): OS canonical route에서는 어떤 workspace도 legacy URL로 이동시키지 않는다 —
// Desktop이 사라지면 안 되기 때문(OPEN_WORKSPACE/SWITCH_WORKSPACE가 이미 openOrFocusDesktopApp로
// 분기하므로 여기까지 도달하는 건 원래도 legacy-only 경로지만, 방어적으로 한 번 더 막는다).
function syncUrlIfNotHome(workspace: Exclude<WorkspaceType, null>) {
  if (isOliviaOsRoute()) return;
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
      // OLIVIA OS(P0): OS에서는 route navigation 대신 AppWindow open/focus. 위 workspace/context
      // 갱신은 legacy 호환을 위해 그대로 둔다(다른 코드가 이 store를 계속 읽을 수 있으므로).
      if (isOliviaOsRoute()) {
        const appId = WORKSPACE_TO_DESKTOP_APP_ID[action.workspace];
        const input = appId ? desktopAppInputFor(appId) : undefined;
        if (input) { openOrFocusDesktopApp(input); return; }
      }
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
      // OLIVIA OS(P0): OPEN_WORKSPACE와 동일한 이유 — singleton 모델이라 이미 열려 있으면
      // focus/restore만 하고, route는 그대로 "/"에 남는다.
      if (isOliviaOsRoute()) {
        const appId = WORKSPACE_TO_DESKTOP_APP_ID[action.workspace];
        const input = appId ? desktopAppInputFor(appId) : undefined;
        if (input) { openOrFocusDesktopApp(input); return; }
      }
      layout.openWorkspaceMode();
      syncUrlIfNotHome(action.workspace);
      return;
    }
    case "CLOSE_WORKSPACE": {
      workspace.closeWorkspace();
      context.setWorkspace(undefined, undefined);
      context.clearSelection();
      // OLIVIA OS(P0): legacy layout.closeWorkspaceMode()는 Desktop 레이아웃에 영향을 주지
      // 않지만(OliviaWorkspaceShell은 OS route에서 항상 chatPortal만 반환), 실제 AppWindow를
      // 닫는 건 Desktop Window Manager(Dock/헤더의 닫기 버튼)가 담당 — 이번 P0은 full-page
      // 전환 방지가 우선이라 여기서 창을 추가로 닫지는 않는다.
      if (isOliviaOsRoute()) return;
      layout.closeWorkspaceMode();
      return;
    }
    case "ENTER_FULLSCREEN": {
      // OLIVIA OS(P0): Desktop에서는 AppWindow의 maximize가 이 역할을 담당한다 — legacy
      // fullscreen(workspace.mode="fullscreen")으로 전환하지 않는다.
      if (isOliviaOsRoute()) return;
      workspace.enterFullscreen();
      layout.enterFullscreen();
      return;
    }
    case "EXIT_FULLSCREEN": {
      if (isOliviaOsRoute()) return;
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
    // START/REFINE_PHOTO_CLASSIFICATION도 같은 순환참조 회피 이유로 useOliviaConversationStore.ts가
    // 미리 가로챈다(AI 사진 분류 2.0, 스펙 §35/36) — 둘 다 비동기라 완료 후 실제 결과로 채팅
    // 응답을 만들어야 해서, RENAME/MERGE/SPLIT처럼 즉시 반환하지 않고 Promise를 기다린다.
    case "START_AI_PHOTO_CLASSIFICATION":
    case "REFINE_PHOTO_CLASSIFICATION":
      return;
    case "OPEN_FEATURE": {
      context.recordAction(`feature:open:${action.href}`);
      // OLIVIA OS(P0): href → appId 매핑이 있으면 AppWindow로, 없으면 Desktop을 유지한 채
      // 아무 것도 하지 않는다(legacy route로 절대 보내지 않는다) — legacy route에서만
      // navigateToFeature를 그대로 쓴다.
      if (isOliviaOsRoute()) {
        const appId = FEATURE_HREF_TO_DESKTOP_APP_ID[action.href];
        const input = appId ? desktopAppInputFor(appId) : undefined;
        if (input) { openOrFocusDesktopApp(input); return; }
        console.warn(`[OLIVIA OS] No desktop app mapping for ${action.href}`);
        return;
      }
      navigateToFeature(action.href);
      return;
    }
    // OLIVIA OS Phase 3 — "크게 보여줘"/"이 창 닫아줘"/"최소화해줘". legacy 라우트에는 대응하는
    // 개념이 없으므로(단일 workspace 모델) OS 라우트가 아니면 전부 no-op.
    case "MAXIMIZE_ACTIVE_WINDOW": {
      if (!isOliviaOsRoute()) return;
      const desktop = useOliviaDesktopStore.getState();
      const id = desktop.activeWindowId;
      if (!id || !desktop.windows[id]) return;
      const bounds = resolveSnapBounds("maximized", desktop.workspaceWidth, desktop.workspaceHeight, DESKTOP_DOCK_SAFE_AREA);
      desktop.snapWindow(id, "maximized", bounds);
      return;
    }
    case "CLOSE_ACTIVE_WINDOW": {
      if (!isOliviaOsRoute()) return;
      const desktop = useOliviaDesktopStore.getState();
      if (desktop.activeWindowId) desktop.closeWindow(desktop.activeWindowId);
      return;
    }
    case "MINIMIZE_ACTIVE_WINDOW": {
      if (!isOliviaOsRoute()) return;
      const desktop = useOliviaDesktopStore.getState();
      if (desktop.activeWindowId) desktop.minimizeWindow(desktop.activeWindowId);
      return;
    }
  }
}

export function executeOliviaActions(actions: OliviaUiAction[]) {
  for (const action of actions) executeOliviaAction(action);
}
