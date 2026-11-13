import { describe, expect, it } from "vitest";

import type { PersonSelectAdminData } from "@/lib/person-select/adminData";
import {
  buildPersonSelectAdminPresentation,
  buildPersonSelectShellSelection,
} from "@/lib/person-select/adminPresentation";

function dataFixture(): PersonSelectAdminData {
  return {
    event: {
      id: "event-1",
      title: "푸른안과",
      slug: "pureun",
      deadline_at: "2026-11-24T09:00:00.000Z",
      status: "open",
      categories: [{ key: "profile", label: "프로필", pick: 3 }],
      retouch_options: [{ key: "skin", label: "피부" }],
      source_layout: "person-folders",
      source_relative_path: "root/푸른안과/JPG전체",
      access_mode: "individual",
    },
    people: [{
      id: "person-1",
      display_name: "김고객",
      group_label: null,
      first_seen_at: null,
      submitted_at: null,
      status_label: "선택 중",
      latest_activity_at: null,
      image_counts: { profile: 12, homeroom: 2 },
      need_counts: { profile: 3 },
      choices: [{
        id: "choice-1",
        image_id: "image-1",
        category_key: "profile",
        retouch_keys: ["skin"],
        memo: "피부 정리",
        updated_at: "2026-11-14T00:00:00.000Z",
        person_select_images: { original_file_name: "A.JPG", source_rel_path: "김고객/A.JPG", thumb_url: "" },
      }],
      order: { lines: [], total: 10_000 },
    }],
    groups: [],
  };
}

describe("person select admin presentation", () => {
  it("keeps individual project counts and customer guide in one calculation", () => {
    const presentation = buildPersonSelectAdminPresentation({
      data: dataFixture(),
      layout: null,
      selectedReviewerId: null,
      selectedPersonId: "person-1",
      origin: "https://olivia.photoclinic.kr",
    });

    expect(presentation.currentLayout).toBe("person-folders");
    expect(presentation.totalPhotos).toBe(12);
    expect(presentation.pickText).toBe("한 사람당 3장");
    expect(presentation.sourceFolder).toBe("JPG전체");
    expect(presentation.notice).toContain("https://olivia.photoclinic.kr/pick/pureun");
    expect(presentation.selectedPerson?.display_name).toBe("김고객");
  });

  it("builds the shell selection from the same selected person", () => {
    const data = dataFixture();
    const selection = buildPersonSelectShellSelection(data, data.people[0]);

    expect(selection.subtitle).toContain("고른 사진 1 / 3장");
    expect(selection.subtitle).toContain("추가 주문 10,000원");
    expect(selection.next).toBe("A.JPG: 피부 정리");
    expect(selection.context?.resourceId).toBe("event-1");
  });
});
