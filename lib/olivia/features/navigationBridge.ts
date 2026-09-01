// executeOliviaAction(actionRouter.ts)과 openOliviaFeature(executor.ts)는 훅이 아닌 평범한
// 함수라서 useRouter()를 직접 쓸 수 없다. 루트 레이아웃에 항상 떠 있는 OliviaWorkspaceShell이
// 마운트 시 실제 라우터를 여기 등록해두면, 그 아래 어디서든 SPA 네비게이션을 쓸 수 있다.
// 등록 전(마운트 직후 극초반)이면 풀 페이지 이동으로 안전하게 폴백한다.
type RouterLike = { push: (href: string) => void };

let registeredRouter: RouterLike | null = null;

export function registerOliviaRouter(router: RouterLike) {
  registeredRouter = router;
}

export function navigateToFeature(href: string) {
  if (registeredRouter) {
    registeredRouter.push(href);
    return;
  }
  if (typeof window !== "undefined") window.location.href = href;
}
