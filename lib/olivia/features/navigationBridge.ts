import { getCanonicalWorkspaceHref } from "@/lib/workspaceGroups";

// executeOliviaAction(actionRouter.ts)과 openOliviaFeature(executor.ts)는 훅이 아닌 평범한
// 함수라서 useRouter()를 직접 쓸 수 없다. 루트 레이아웃에 항상 떠 있는 OliviaWorkspaceShell이
// 마운트 시 실제 라우터를 여기 등록해두면, 그 아래 어디서든 SPA 네비게이션을 쓸 수 있다.
// 등록 전(마운트 직후 극초반)이면 풀 페이지 이동으로 안전하게 폴백한다.
type RouterLike = { push: (href: string) => void; replace: (href: string) => void };

let registeredRouter: RouterLike | null = null;

export function registerOliviaRouter(router: RouterLike) {
  registeredRouter = router;
}

export function navigateToFeature(href: string) {
  const targetHref = getCanonicalWorkspaceHref(href);
  if (registeredRouter) {
    registeredRouter.push(targetHref);
    return;
  }
  if (typeof window !== "undefined") window.location.href = targetHref;
}

// Olivia 2.0 Phase 1 — 채팅이 SWITCH_WORKSPACE로 워크스페이스를 바꾸면(예: "콘티로 넘어가자"),
// 직접 URL로도 그 워크스페이스가 열리게 하려면 주소창도 같이 맞춰야 한다. push가 아니라
// replace를 쓴다 — 채팅 안에서의 전환은 사용자가 "이동"했다고 인지하지 않으므로 브라우저
// 히스토리를 쌓지 않는다. store 갱신 → 이 함수 호출 순서로 actionRouter.ts가 호출하므로,
// 이동한 URL은 이미 store와 일치한 상태라 OliviaWorkspaceShell의 자동 닫기 감시(pathname
// watcher)와 경합하지 않는다.
export function syncCanonicalWorkspaceUrl(
  canonicalPath: string,
  ctx: { clientId?: string; workflowRunId?: string },
) {
  if (!registeredRouter) return;
  const params = new URLSearchParams();
  if (ctx.clientId) params.set("clientId", ctx.clientId);
  if (ctx.workflowRunId) params.set("workflowRunId", ctx.workflowRunId);
  registeredRouter.replace(params.size ? `${canonicalPath}?${params.toString()}` : canonicalPath);
}
