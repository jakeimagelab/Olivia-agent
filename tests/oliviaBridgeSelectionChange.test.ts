import { describe, expect, it } from "vitest";

import {
  resolveBridgeManualSelectionChange,
  sameBridgeIdSet,
} from "@/lib/photo-bridge/selectionChange";

describe("Bridge manual selection change", () => {
  it("올리비아 기준은 요청 목록으로 수동 셀렉만 교체한다", () => {
    const result = resolveBridgeManualSelectionChange({
      source: "olivia",
      requestedIds: new Set(["new"]),
      currentSelectedIds: new Set(["old"]),
      manualIds: new Set(["old"]),
      adobeIds: new Set(["adobe"]),
      manualRemovedIds: new Set(["kept"]),
    });

    expect(result.manualIds).toEqual(new Set(["new"]));
    expect(result.manualRemovedIds).toEqual(new Set(["kept"]));
  });

  it("어도비 기준은 고객 조작으로 두 목록을 바꾸지 않는다", () => {
    const result = resolveBridgeManualSelectionChange({
      source: "adobe",
      requestedIds: new Set(["requested"]),
      currentSelectedIds: new Set(["adobe"]),
      manualIds: new Set(["manual"]),
      adobeIds: new Set(["adobe"]),
      manualRemovedIds: new Set(["removed"]),
    });

    expect(result.manualIds).toEqual(new Set(["manual"]));
    expect(result.manualRemovedIds).toEqual(new Set(["removed"]));
  });

  it("둘 다 기준에서 어도비 사진 해제는 수동 해제 목록에 남긴다", () => {
    const result = resolveBridgeManualSelectionChange({
      source: "both",
      requestedIds: new Set(["manual"]),
      currentSelectedIds: new Set(["manual", "adobe"]),
      manualIds: new Set(["manual"]),
      adobeIds: new Set(["adobe"]),
      manualRemovedIds: new Set(),
    });

    expect(result.manualIds).toEqual(new Set(["manual"]));
    expect(result.manualRemovedIds).toEqual(new Set(["adobe"]));
  });

  it("둘 다 기준에서 해제한 어도비 사진을 다시 고르면 수동 해제를 없앤다", () => {
    const result = resolveBridgeManualSelectionChange({
      source: "both",
      requestedIds: new Set(["manual", "adobe"]),
      currentSelectedIds: new Set(["manual"]),
      manualIds: new Set(["manual"]),
      adobeIds: new Set(["adobe"]),
      manualRemovedIds: new Set(["adobe"]),
    });

    expect(result.manualIds).toEqual(new Set(["manual"]));
    expect(result.manualRemovedIds).toEqual(new Set());
  });

  it("둘 다 기준에서 일반 사진은 수동 셀렉에 추가·제거한다", () => {
    const result = resolveBridgeManualSelectionChange({
      source: "both",
      requestedIds: new Set(["new"]),
      currentSelectedIds: new Set(["old"]),
      manualIds: new Set(["old"]),
      adobeIds: new Set(),
      manualRemovedIds: new Set(),
    });

    expect(result.manualIds).toEqual(new Set(["new"]));
  });

  it("Set 비교는 순서와 무관하고 값 차이를 감지한다", () => {
    expect(sameBridgeIdSet(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(sameBridgeIdSet(new Set(["a"]), new Set(["b"]))).toBe(false);
  });
});
