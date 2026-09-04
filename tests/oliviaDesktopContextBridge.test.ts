import { describe, expect, it } from "vitest";
import { DESKTOP_APP_TO_WORKSPACE } from "@/components/olivia-os/useOliviaDesktopContextBridge";
import { getOliviaApp } from "@/components/olivia-os/registry/oliviaAppRegistry";

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
