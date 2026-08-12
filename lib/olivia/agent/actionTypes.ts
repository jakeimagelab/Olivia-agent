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
  | { type: "REFRESH_RESOURCE"; resource: string };
