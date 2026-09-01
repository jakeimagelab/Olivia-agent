import { describe, expect, it } from "vitest";
import { getWorkspaceTypeForPathname, shouldAutoCloseWorkspace, workspaceRegistry } from "@/components/workspace/WorkspaceRegistry";

describe("getWorkspaceTypeForPathname", () => {
  it("resolves every registered direct route to its workspace type", () => {
    expect(getWorkspaceTypeForPathname("/contract")).toBe("contract");
    expect(getWorkspaceTypeForPathname("/conti")).toBe("conti");
    expect(getWorkspaceTypeForPathname("/photo-sorting")).toBe("photo-sort");
  });

  it("matches nested paths under a direct route", () => {
    expect(getWorkspaceTypeForPathname("/contract/anything")).toBe("contract");
  });

  // 견적서 원복(2026-09) — /photoclinic, /quote는 QuoteBuilder mode="page"를 직접 렌더링하는
  // 예전 구조로 돌아갔고, quote는 direct route가 없다(WorkspaceRegistry.ts 참고) — 채팅에서
  // workspace로 여는 기능은 유지하되, 직접 URL 진입은 70/30 스플릿 대상이 아니다.
  it("returns undefined for unrelated paths, home, quote's routes, or missing pathname", () => {
    expect(getWorkspaceTypeForPathname("/clients")).toBeUndefined();
    expect(getWorkspaceTypeForPathname("/admin/dashboard/home")).toBeUndefined();
    expect(getWorkspaceTypeForPathname("/photoclinic")).toBeUndefined();
    expect(getWorkspaceTypeForPathname("/quote")).toBeUndefined();
    expect(getWorkspaceTypeForPathname(null)).toBeUndefined();
    expect(getWorkspaceTypeForPathname(undefined)).toBeUndefined();
  });

  it("quote stays registered (for chat-driven opens) even with no direct routes", () => {
    expect(workspaceRegistry.quote).toBeDefined();
    expect(workspaceRegistry.quote?.directRoutes).toEqual([]);
  });
});

// 라우트(직접 URL 진입)로 열린 워크스페이스만 자동으로 닫는다 — 채팅/카드로 연 워크스페이스는
// 사용자가 명시적으로 요청한 것이라 페이지 이동만으로 놀라게 닫으면 안 된다(설계 문서 §9).
describe("shouldAutoCloseWorkspace", () => {
  it("closes a route-opened workspace when navigating away from its direct routes", () => {
    expect(shouldAutoCloseWorkspace({ type: "contract", openedBy: "route", pathname: "/clients" })).toBe(true);
  });

  it("keeps a route-opened workspace while still on one of its direct routes", () => {
    expect(shouldAutoCloseWorkspace({ type: "contract", openedBy: "route", pathname: "/contract" })).toBe(false);
  });

  it("never closes a chat-opened workspace just because the route changed", () => {
    expect(shouldAutoCloseWorkspace({ type: "contract", openedBy: "chat", pathname: "/clients" })).toBe(false);
  });

  it("is a no-op when nothing is open", () => {
    expect(shouldAutoCloseWorkspace({ type: null, openedBy: undefined, pathname: "/clients" })).toBe(false);
  });
});
