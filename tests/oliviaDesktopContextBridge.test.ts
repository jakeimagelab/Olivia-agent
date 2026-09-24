import { describe, expect, it } from "vitest";
import { DESKTOP_APP_TO_WORKSPACE } from "@/components/olivia-os/useOliviaDesktopContextBridge";
import { getOliviaApp } from "@/components/olivia-os/registry/oliviaAppRegistry";
import {
  buildWindowContextFromOlivia,
  getWindowClientSyncKey,
  resolveNamedContextSeed,
} from "@/lib/olivia/desktopContextBridgeSync";
import { areWindowContextsEqual, type WindowContext } from "@/lib/store/useOliviaDesktopStore";

// OLIVIA OS Phase 3 — useOliviaDesktopContextBridge 자체는 React 렌더링이 필요한 hook이라
// (이 repo의 Vitest는 node 환경, @testing-library/react 미설치 — 새 테스트 인프라를 이번
// 한 파일 때문에 들이지 않는다) 브라우저 QA로 검증하고, 여기서는 매핑 테이블이 실제
// oliviaAppRegistry에 등록된 appId만 가리키는지(오타/삭제된 앱 방지)를 결정론적으로 검증한다.
describe("useOliviaDesktopContextBridge — DESKTOP_APP_TO_WORKSPACE 매핑", () => {
  it("매핑에 등장하는 모든 appId는 실제 레지스트리에 등록돼 있다", () => {
    for (const appId of Object.keys(DESKTOP_APP_TO_WORKSPACE)) {
      expect(getOliviaApp(appId), `registry missing appId "${appId}"`).toBeDefined();
    }
  });

  it("핵심 4개 중 workspace 개념이 있는 photo-workspace/calendar는 매핑에 포함된다", () => {
    expect(DESKTOP_APP_TO_WORKSPACE["photo-workspace"]).toBe("photo-sort");
    expect(DESKTOP_APP_TO_WORKSPACE["calendar"]).toBe("calendar");
  });

  it("customer/documents는 legacy WorkspaceType 개념이 없어 매핑에서 제외된다(activeClientId로 별도 추적)", () => {
    expect(DESKTOP_APP_TO_WORKSPACE["customer"]).toBeUndefined();
    expect(DESKTOP_APP_TO_WORKSPACE["documents"]).toBeUndefined();
  });
});

describe("useOliviaDesktopContextBridge — customer source ownership", () => {
  const namedSeed = (
    context: WindowContext,
    active: { id?: string; name?: string },
  ) => resolveNamedContextSeed({
    windowId: "customer",
    windowValue: { id: context.clientId, name: context.clientName },
    activeValue: active,
  });

  it("CASE 1: customer A 창은 한 번 seed된 뒤 추가 client update를 만들지 않는다", () => {
    const windowA = { clientId: "client-a", clientName: "고객 A" };
    expect(namedSeed(windowA, {})).toEqual({ id: "client-a", name: "고객 A" });
    expect(namedSeed(windowA, { id: "client-a", name: "고객 A" })).toBeNull();
  });

  it("CASE 2: 사용자가 B를 선택하면 window context도 B가 되고 A로 rollback되지 않는다", () => {
    const nextWindow = buildWindowContextFromOlivia({
      appId: "customer",
      windowContext: { clientId: "client-a", clientName: "고객 A" },
      oliviaContext: { clientId: "client-b", clientName: "고객 B" },
    });

    expect(nextWindow).toMatchObject({ clientId: "client-b", clientName: "고객 B" });
    expect(namedSeed(nextWindow, { id: "client-b", name: "고객 B" })).toBeNull();
  });

  it("CASE 3: client B를 둔 채 project만 바뀌어도 client effect key는 바뀌지 않는다", () => {
    const before = { clientId: "client-b", clientName: "고객 B", projectId: "project-a" };
    const after = { ...before, projectId: "project-b" };

    expect(getWindowClientSyncKey("customer", after)).toEqual(getWindowClientSyncKey("customer", before));
    expect(namedSeed(after, { id: "client-b", name: "고객 B" })).toBeNull();
  });

  it("CASE 4: client B를 둔 채 resource만 바뀌어도 client effect key는 바뀌지 않는다", () => {
    const before = { clientId: "client-b", clientName: "고객 B", resourceId: "resource-a" };
    const after = { ...before, resourceId: "resource-b" };

    expect(getWindowClientSyncKey("customer", after)).toEqual(getWindowClientSyncKey("customer", before));
    expect(namedSeed(after, { id: "client-b", name: "고객 B" })).toBeNull();
  });

  it("CASE 5: 외부 openApp이 customer C를 명시하면 C로 전환되고 다음 sync는 안정된다", () => {
    const windowC = { clientId: "client-c", clientName: "고객 C" };
    const seed = namedSeed(windowC, { id: "client-b", name: "고객 B" });

    expect(seed).toEqual({ id: "client-c", name: "고객 C" });
    expect(namedSeed(windowC, seed ?? {})).toBeNull();
  });

  it("CASE 6: Olivia chat 포커스 중에도 effective customer context B는 update loop 없이 유지된다", () => {
    const customerWindow = { clientId: "client-b", clientName: "고객 B", projectId: "project-b" };
    const nextWindow = buildWindowContextFromOlivia({
      appId: "customer",
      windowContext: customerWindow,
      oliviaContext: {
        clientId: "client-b",
        clientName: "고객 B",
        projectId: "project-b",
      },
    });

    expect(getWindowClientSyncKey("customer", nextWindow)).toEqual(getWindowClientSyncKey("customer", customerWindow));
    expect(areWindowContextsEqual(customerWindow, nextWindow)).toBe(true);
    expect(namedSeed(nextWindow, { id: "client-b", name: "고객 B" })).toBeNull();
  });
});
