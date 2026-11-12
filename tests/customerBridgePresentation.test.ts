import { describe, expect, it } from "vitest";
import { buildCustomerBridgePresentation } from "@/lib/select-gallery/customerBridgePresentation";

const base = {
  location: { kind: "all" } as const,
  loadedRootPhotoCount: 0,
  childFolderCount: 3,
  locationTotalCount: 100,
  selectedInFolder: 12,
  searchActive: false,
  filter: "all" as const,
  labelFilters: { rating: null, color: null },
  imagePageInitialized: false,
  imagePageTotalCount: 0,
  visibleImageCount: 100,
  readOnly: false,
  saveStatus: "saved" as const,
  lastSavedAt: null,
  pendingCount: 0,
};

describe("customer Bridge presentation", () => {
  it("keeps location counts aligned with the active selection filter", () => {
    expect(buildCustomerBridgePresentation({ ...base, filter: "selected" }).browserPhotoCount).toBe(12);
    expect(buildCustomerBridgePresentation({ ...base, filter: "unselected" }).browserPhotoCount).toBe(88);
  });

  it("uses paged search totals only for an unlabelled all-photo search", () => {
    expect(buildCustomerBridgePresentation({
      ...base,
      searchActive: true,
      imagePageInitialized: true,
      imagePageTotalCount: 17,
      visibleImageCount: 12,
    }).browserPhotoCount).toBe(17);
    expect(buildCustomerBridgePresentation({
      ...base,
      searchActive: true,
      labelFilters: { rating: 5, color: null },
      imagePageInitialized: true,
      imagePageTotalCount: 17,
      visibleImageCount: 4,
    }).browserPhotoCount).toBe(4);
  });

  it("counts root folder cards and root photos separately", () => {
    const result = buildCustomerBridgePresentation({
      ...base,
      location: { kind: "root" },
      manifestRootPhotoCount: 8,
    });
    expect(result.locationCount).toBe(4);
    expect(result.rootPhotoCount).toBe(8);
  });

  it("keeps save status messages stable", () => {
    expect(buildCustomerBridgePresentation({ ...base, saveStatus: "saving", pendingCount: 3 }).saveStatusMessage).toBe("저장 중…");
    expect(buildCustomerBridgePresentation({ ...base, saveStatus: "retrying", pendingCount: 3 }).saveStatusMessage).toBe("저장 안 된 변경 3건 · 잠시 후 자동 저장");
    expect(buildCustomerBridgePresentation({ ...base, readOnly: true }).saveStatusMessage).toBe("관리자 사진 확인");
  });
});
