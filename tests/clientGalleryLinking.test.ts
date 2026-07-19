import { describe, expect, it } from "vitest";
import { findLinkablePhotoGalleryIds, hasUniqueClientNameMatch, normalizeClientLinkName } from "@/lib/clientGalleryLinking";

describe("고객과 기존 촬영 갤러리 역연결", () => {
  it("병원명 공백과 대소문자를 정규화한다", () => {
    expect(normalizeClientLinkName(" 반포 리움Clinic ")).toBe("반포리움clinic");
  });

  it("같은 병원명이 정확히 한 고객과 일치할 때만 연결을 허용한다", () => {
    expect(hasUniqueClientNameMatch([{ id: "c1", hospital_name: "반포리움 성형외과" }], "c1", "반포리움성형외과")).toBe(true);
    expect(hasUniqueClientNameMatch([
      { id: "c1", hospital_name: "반포리움성형외과" },
      { id: "c2", hospital_name: "반포리움 성형외과" },
    ], "c1", "반포리움성형외과")).toBe(false);
  });

  it("미연결 상태인 동일 병원 갤러리만 선택한다", () => {
    expect(findLinkablePhotoGalleryIds([
      { id: "g1", hospital_name: "반포리움성형외과", client_id: null },
      { id: "g2", hospital_name: "반포리움 성형외과", client_id: undefined },
      { id: "g3", hospital_name: "반포리움성형외과", client_id: "other-client" },
      { id: "g4", hospital_name: "다른병원", client_id: null },
    ], "반포리움성형외과")).toEqual(["g1", "g2"]);
  });
});
