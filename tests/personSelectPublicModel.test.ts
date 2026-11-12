import { describe, expect, it } from "vitest";
import {
  isPersonSelectCategoryComplete,
  personSelectExtraCount,
  personSelectFinalReviewData,
  personSelectNeedMessage,
  type PersonSelectCategoryData,
} from "@/components/person-select/personSelectPublicModel";
import { personSelectionSyncStatus } from "@/components/person-select/usePersonSelectPublicData";

function category(choiceCount: number, need = 1, max = 3): PersonSelectCategoryData {
  return {
    key: "profile",
    label: "프로필",
    pick: need,
    image_count: 20,
    need,
    max,
    choices: Array.from({ length: choiceCount }, (_, index) => ({
      id: `choice-${index}`,
      image_id: `image-${index}`,
      original_file_name: `A-${index}.JPG`,
      thumb_url: `thumb-${index}`,
      retouch_keys: index === 0 ? ["skin"] : [],
      memo: index === 0 ? "피부 보정" : "",
      updated_at: "2026-11-13T00:00:00.000Z",
    })),
  };
}

describe("person select public view model", () => {
  it("uses the same completion and extra-count rules for mobile and PC", () => {
    expect(isPersonSelectCategoryComplete(category(1))).toBe(true);
    expect(isPersonSelectCategoryComplete(category(4))).toBe(false);
    expect(personSelectExtraCount(category(3))).toBe(2);
    expect(personSelectNeedMessage(category(4))).toBe("프로필은 3장까지 고를 수 있어요.");
  });

  it("builds one final review summary from selected photos", () => {
    const review = personSelectFinalReviewData([category(2)]);
    expect(review.selectedCount).toBe(2);
    expect(review.sections).toEqual([{ label: "프로필", count: 2, detail: "보정 요청 1개 · 메모 있음" }]);
    expect(review.items).toHaveLength(2);
  });

  it("shows unsaved selection state without hiding queued work", () => {
    expect(personSelectionSyncStatus({ status: "waiting", pendingCount: 3, lastSavedAt: null }))
      .toBe("저장 안 된 변경 3건 · 잠시 후 저장");
    expect(personSelectionSyncStatus({ status: "saved", pendingCount: 0, lastSavedAt: "2026-11-13T00:00:00.000Z" }))
      .toBe("저장됨 · 방금");
  });
});
