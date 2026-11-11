import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/(client-hub)/person-select/[id]/page.tsx", "utf8");
const bridge = readFileSync("components/select-gallery/CustomerBridgeSelect.tsx", "utf8");
const bridgeCss = readFileSync("components/select-gallery/CustomerBridgeSelect.module.css", "utf8");

describe("person select RAW match admin UI", () => {
  it("keeps the title row free of actions and places guidance beside the tabs", () => {
    const titleStart = page.indexOf('<div className={styles.titleRow}>');
    const segmentStart = page.indexOf('<div className={styles.segmentRow}>', titleStart);
    const titleSection = page.slice(titleStart, segmentStart);
    expect(titleSection).not.toContain("안내 문구 복사");
    expect(titleSection).not.toContain("RAW 매칭");
    expect(page.slice(segmentStart, segmentStart + 2_500)).toContain("안내 문구 복사");
  });

  it("renders the shared admin RAW action before Bridge review", () => {
    const toolbar = bridge.slice(bridge.indexOf("{adminToolbarAction}"), bridge.indexOf("<section className={styles.workspace}"));
    expect(toolbar.indexOf("{adminToolbarAction}")).toBeGreaterThanOrEqual(0);
    expect(toolbar.indexOf("openReview")).toBeGreaterThan(toolbar.indexOf("{adminToolbarAction}"));
  });

  it("shows the submitted/current chooser and visible disabled reasons", () => {
    expect(page).toContain("지금 고른 상태");
    expect(page).toContain("최종 제출본만");
    expect(page).toContain("원본 폴더를 Mac Studio 위치로 연결해 주세요.");
    expect(page).toContain("Mac Studio가 꺼져 있어요.");
    expect(page).toContain("고른 사진이 없어요.");
  });

  it("keeps the customer Bridge footer above the mobile safe area", () => {
    expect(bridgeCss).toMatch(/\.footer\s*\{[\s\S]*?safe-area-inset-bottom/);
  });
});
