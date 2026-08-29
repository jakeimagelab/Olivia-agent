import type { WorkspaceType } from "@/lib/store/workspaceStore";

// Olivia Agent 2.0 Agent Action Protocol(개편 요청서 17절) — AI 응답을 해석해 나온 "UI를
// 이렇게 바꿔라"라는 명령을 하나의 공통 포맷으로 표현한다. OliviaHeroChat 같은 채팅 컴포넌트는
// 이 타입만 만들어서 executeOliviaAction에 넘기면 되고, 워크스페이스를 어떻게 열고 어떤 store를
// 바꾸는지는 몰라도 된다(actionRouter.ts가 담당).
export type OliviaUiAction =
  | {
      type: "OPEN_WORKSPACE";
      workspace: Exclude<WorkspaceType, null>;
      clientId?: string;
      workflowRunId?: string;
      resourceId?: string;
      clientName?: string;
      projectName?: string;
    }
  | {
      type: "SWITCH_WORKSPACE";
      workspace: Exclude<WorkspaceType, null>;
      resourceId?: string;
      clientId?: string;
      workflowRunId?: string;
      clientName?: string;
      projectName?: string;
      startInPreview?: boolean;
    }
  | { type: "CLOSE_WORKSPACE" }
  | { type: "ENTER_FULLSCREEN" }
  | { type: "EXIT_FULLSCREEN" }
  | {
      type: "UPDATE_CONTEXT";
      clientId?: string;
      clientName?: string;
      projectId?: string;
      projectName?: string;
    }
  | { type: "REFRESH_RESOURCE"; resourceId: string; resource?: string; changedEntityId?: string; before?: unknown; after?: unknown }
  | { type: "SET_SELECTION"; entityType: string; entityId: string }
  | { type: "PREVIEW_QUOTE"; resourceId: string }
  // 현재 마운트된 QuoteBuilder 인스턴스가 useQuoteStore에 등록해 둔 pdfHandler를 호출한다 —
  // 사람이 누르는 다운로드 버튼과 정확히 같은 downloadPdf() 함수다. 서버 tool은 DB를 건드리지
  // 않으므로(PDF는 브라우저 DOM 캡처로만 만들 수 있다) 실제 성공/실패는 이 액션이 클라이언트에서
  // 실행된 뒤에만 확정된다(actionRouter.ts 참고).
  | { type: "DOWNLOAD_QUOTE_PDF"; resourceId: string }
  // 위 DOWNLOAD_QUOTE_PDF와 정확히 같은 이유(2026-08-30, PHASE 3) — ContractBuilder가
  // useContractPdfHandlerStore에 등록해 둔 pdfHandler를 호출한다.
  | { type: "DOWNLOAD_CONTRACT_PDF"; resourceId: string }
  // 지금 마운트된 PhotoSortingWorkspace 인스턴스가 usePhotoClassificationActionsStore에 등록해
  // 둔 renameScene/mergeScenes/splitScene을 그대로 호출한다(PHASE 4, 2026-08-30) — 씬 편집
  // 함수가 컴포넌트 로컬 state에 묶여 있어 서버 tool이 직접 실행할 수 없기 때문에, 위
  // DOWNLOAD_*_PDF와 같은 이유로 useOliviaConversationStore.ts가 미리 가로챈다.
  | { type: "RENAME_PHOTO_SCENE"; sceneIndex: number; newName: string }
  | { type: "MERGE_PHOTO_SCENES"; sceneIndexA: number; sceneIndexB: number }
  | { type: "SPLIT_PHOTO_SCENE"; sceneIndex: number; offset: number }
  | { type: "OPEN_FEATURE"; href: string }
  | {
      type: "REQUEST_APPROVAL";
      approvalId: string;
      summary: string;
      confirmLabel: string;
      toolName: string;
      toolInput: Record<string, unknown>;
    }
  // task는 Inline Tool Registry(lib/olivia/inline-tools)의 등록 id를 가리키는 opaque 문자열이다
  // — 새 도구가 추가돼도 이 파일을 다시 열 필요가 없도록 리터럴 유니온으로 제한하지 않는다.
  | { type: "OPEN_CLIENT_TASK"; task: string; flowId: string };
