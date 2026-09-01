import { describe, expect, it } from "vitest";
import { getWorkspaceTypeForPathname, shouldAutoCloseWorkspace, workspaceRegistry } from "@/components/workspace/WorkspaceRegistry";

describe("getWorkspaceTypeForPathname", () => {
  it("resolves every registered direct route to its workspace type", () => {
    expect(getWorkspaceTypeForPathname("/photoclinic")).toBe("quote");
    expect(getWorkspaceTypeForPathname("/quote")).toBe("quote");
    expect(getWorkspaceTypeForPathname("/contract")).toBe("contract");
    expect(getWorkspaceTypeForPathname("/conti")).toBe("conti");
    expect(getWorkspaceTypeForPathname("/photo-sorting")).toBe("photo-sort");
  });

  it("matches nested paths under a direct route", () => {
    expect(getWorkspaceTypeForPathname("/contract/anything")).toBe("contract");
  });

  it("returns undefined for unrelated paths, home, or missing pathname", () => {
    expect(getWorkspaceTypeForPathname("/clients")).toBeUndefined();
    expect(getWorkspaceTypeForPathname("/admin/dashboard/home")).toBeUndefined();
    expect(getWorkspaceTypeForPathname(null)).toBeUndefined();
    expect(getWorkspaceTypeForPathname(undefined)).toBeUndefined();
  });

  it("gives every registered workspace at least one direct route", () => {
    for (const entry of Object.values(workspaceRegistry)) {
      expect(entry?.directRoutes.length).toBeGreaterThan(0);
    }
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
