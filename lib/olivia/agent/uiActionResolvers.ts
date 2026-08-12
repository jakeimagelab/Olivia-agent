import type { OliviaUiAction } from "@/lib/olivia/agent/actionTypes";

// Olivia Agent 2.0 — /api/olivia의 create_quote 같은 도구는 "navigate" 결과만 돌려주도록 이미
// 만들어져 있고, 플로팅 위젯(components/OliviaChat.tsx)도 그 응답 형태 그대로 쓰고 있어서
// 백엔드 도구 자체는 건드리지 않는다(요청서 18절이 원하는 "tool이 uiActions를 같이 반환"하는
// 형태로 백엔드를 바꾸는 건 대화 없이 검증 못 하는 리스크가 커서 보류 — 대신 프론트에서 도구
// 이름별로 "이 도구가 오면 이런 UI 액션으로 바꿔라"를 여기 한 곳에 등록해 둔다.
// if(tool.name==='create_quote') if(tool.name==='create_conti') 식으로 채팅 컴포넌트 안에
// 계속 늘어놓지 않기 위한 지점 — 새 도구를 워크스페이스에 연결하고 싶으면 여기 한 줄만 추가한다.
export type UiActionResolver = (input: any) => Promise<OliviaUiAction | null>;

async function resolveClientWorkspaceContext(hospitalName: string): Promise<{ clientId: string; clientName: string; workflowRunId?: string } | null> {
  const name = String(hospitalName || "").trim();
  if (!name) return null;
  try {
    const searchRes = await fetch(`/api/clients?q=${encodeURIComponent(name)}`);
    const searchData = await searchRes.json();
    const client = Array.isArray(searchData?.clients) ? searchData.clients[0] : null;
    if (!client?.id) return null;

    const workspaceRes = await fetch(`/api/clients/${client.id}/workspace`);
    const workspaceData = await workspaceRes.json();
    if (!workspaceData?.ok) return null;

    return { clientId: client.id, clientName: client.hospital_name, workflowRunId: workspaceData.activeProject?.id };
  } catch {
    return null;
  }
}

export const uiActionResolvers: Record<string, UiActionResolver> = {
  create_quote: async (input) => {
    const ctx = await resolveClientWorkspaceContext(input?.hospitalName);
    if (!ctx) return null; // 등록된 고객을 못 찾으면 null — 호출부가 기존 navigate 방식으로 폴백한다.
    return { type: "OPEN_WORKSPACE", workspace: "quote", ...ctx };
  },
  create_contract: async (input) => {
    const ctx = await resolveClientWorkspaceContext(input?.hospitalName);
    if (!ctx) return null;
    return { type: "OPEN_WORKSPACE", workspace: "contract", ...ctx };
  },
  create_conti: async (input) => {
    const ctx = await resolveClientWorkspaceContext(input?.hospitalName);
    if (!ctx) return null;
    return { type: "OPEN_WORKSPACE", workspace: "conti", ...ctx };
  },
};
