import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/(client-hub)/person-select/[id]/page.tsx", "utf8");
const rawMatchControls = readFileSync("components/person-select/admin/RawMatchControls.tsx", "utf8");
const rawMatchController = readFileSync("components/person-select/admin/hooks/usePersonSelectRawMatchController.ts", "utf8");
const bridgeHeader = readFileSync("components/select-gallery/CustomerBridgeHeader.tsx", "utf8");
const bridgeCss = readFileSync("components/select-gallery/CustomerBridgeSelect.module.css", "utf8");
const workspace = readFileSync("components/person-select/admin/PersonSelectAdminBridgeWorkspace.tsx", "utf8");
const workspaceCss = readFileSync("components/person-select/admin/PersonSelectAdminBridgeWorkspace.module.css", "utf8");

describe("person select RAW match admin UI", () => {
  it("removes the separate title shell and places actions in the Bridge action bar", () => {
    expect(page).not.toContain('<div className={styles.titleRow}>');
    expect(page).not.toContain('<section className={styles.body}>');
    expect(workspace).toContain("안내 문구 복사");
    expect(workspace).toContain("RAW 매칭");
    expect(workspace).toContain("bridgeStyles.actionBar");
  });

  it("renders the shared admin RAW action before Bridge review", () => {
    const toolbar = bridgeHeader.slice(bridgeHeader.indexOf("{adminToolbarAction}"), bridgeHeader.indexOf("{adminToolbarStatus"));
    expect(toolbar.indexOf("{adminToolbarAction}")).toBeGreaterThanOrEqual(0);
    expect(toolbar.indexOf("onOpenReview")).toBeGreaterThan(toolbar.indexOf("{adminToolbarAction}"));
  });

  it("shows the submitted/current chooser and visible disabled reasons", () => {
    expect(rawMatchControls).toContain("지금 고른 상태");
    expect(rawMatchControls).toContain("최종 제출본만");
    expect(rawMatchController).toContain("원본 폴더를 Mac Studio 위치로 연결해 주세요.");
    expect(rawMatchController).toContain("Mac Studio가 꺼져 있어요.");
    expect(rawMatchController).toContain("고른 사진이 없어요.");
    expect(rawMatchControls).toContain("JPG 위치");
    expect(rawMatchControls).toContain("RAW 검색 범위");
    expect(rawMatchControls).toContain("결과 저장 위치");
  });

  it("keeps the customer Bridge footer above the mobile safe area", () => {
    expect(bridgeCss).toMatch(/\.footer\s*\{[\s\S]*?safe-area-inset-bottom/);
  });

  it("keeps labeled RAW actions available in the responsive Bridge action bar", () => {
    expect(workspace).toContain("RAW 매칭");
    expect(workspace).toContain("로우 셀렉");
    expect(workspaceCss).toMatch(/@container olivia-bridge \(max-width: 900px\)/);
    expect(workspaceCss).toMatch(/\.actionTools/);
  });
});
