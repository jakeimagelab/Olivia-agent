import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canResubmitSelection,
  countSelectionsByCategory,
  isSelectionSubmissionLocked,
  missingRequiredSelectionCategories,
  normalizeSelectionCategory,
  validateSelectionMemo,
} from "@/lib/select-core";

describe("사진 셀렉 공통 규칙", () => {
  it("사진별 선택 마이그레이션은 기존 text 키와 같은 타입으로 연결한다", () => {
    const sql = readFileSync("supabase/migrations/20261020_client_photo_selection_items.sql", "utf8");
    expect(sql).toContain("selection_id text not null references public.client_photo_selections(id)");
    expect(sql).toContain("gallery_id text references public.select_galleries(id)");
    expect(sql).toContain("image_id text references public.select_gallery_images(id)");
  });

  it("프로필·연출·인테리어·미분류를 같은 규칙으로 나눈다", () => {
    expect(normalizeSelectionCategory("profile", null)).toBe("profile");
    expect(normalizeSelectionCategory("skin_care", null)).toBe("staged");
    expect(normalizeSelectionCategory("수술 연출", null)).toBe("staged");
    expect(normalizeSelectionCategory(null, "주요 인테리어 및 외관")).toBe("interior");
    expect(normalizeSelectionCategory(null, "기타 사진")).toBe("unclassified");
  });

  it("카테고리별 선택 수를 센다", () => {
    expect(countSelectionsByCategory([
      { category: "profile" },
      { category: "staged" },
      { category: "profile" },
    ])).toEqual({ profile: 2, staged: 1 });
  });

  it("사진이 있는 프로필·연출·인테리어는 각각 한 장 이상 요구한다", () => {
    const available = [{ category: "profile" }, { category: "staged" }, { category: "interior" }, { category: "unclassified" }];
    expect(missingRequiredSelectionCategories(available, [{ category: "profile" }, { category: "interior" }])).toEqual(["staged"]);
    expect(missingRequiredSelectionCategories(available, available)).toEqual([]);
    expect(missingRequiredSelectionCategories([{ category: "profile" }], [{ category: "profile" }])).toEqual([]);
  });

  it("메모 제한·마감·재제출 판정을 공통으로 적용한다", () => {
    expect(validateSelectionMemo("1234", 4)).toBeNull();
    expect(validateSelectionMemo("12345", 4)).toContain("4자");
    expect(isSelectionSubmissionLocked({ status: "open", deadlineAt: "2026-10-21T00:00:00Z", now: new Date("2026-10-20T00:00:00Z") })).toBe(false);
    expect(isSelectionSubmissionLocked({ status: "closed" })).toBe(true);
    expect(canResubmitSelection({ submitted: true, allowResubmit: false })).toBe(false);
    expect(canResubmitSelection({ submitted: true, allowResubmit: true })).toBe(true);
  });
});
