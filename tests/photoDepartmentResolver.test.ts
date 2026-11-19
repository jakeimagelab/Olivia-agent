import { describe, expect, it } from "vitest";
import {
  departmentFromPhotoText,
  isCameraGeneratedFolderName,
  manualPhotoDepartmentResolution,
  meaningfulPhotoFolderName,
  photoDepartmentEvidence,
  photoFolderClientName,
  resolvePhotoDepartmentEvidence,
} from "@/lib/photo-classifier/departmentResolver";

describe("photo department resolver", () => {
  it.each([
    "정형외과",
    "정형",
    "신경외과",
    "마취통증의학과",
    "통증클리닉",
    "재활의학과",
    "재활",
  ])("%s를 근골격·통증계로 묶는다", (value) => {
    expect(departmentFromPhotoText(value)).toBe("orthopedics_neurosurgery");
  });

  it("비슷하지만 다른 과를 근골격·통증계로 오인하지 않는다", () => {
    expect(departmentFromPhotoText("성형외과")).toBe("plastic_surgery");
    expect(departmentFromPhotoText("신경과")).toBeNull();
  });

  it("같은 그룹의 여러 근거는 자동 적용한다", () => {
    expect(resolvePhotoDepartmentEvidence([
      photoDepartmentEvidence("재활의학과", "linked_client"),
      photoDepartmentEvidence("1025_강재활의학과", "folder_name"),
    ])).toMatchObject({
      status: "resolved",
      department: "orthopedics_neurosurgery",
      rawValue: "재활의학과",
      source: "linked_client",
    });
  });

  it("서로 다른 그룹의 근거는 충돌로 남긴다", () => {
    expect(resolvePhotoDepartmentEvidence([
      photoDepartmentEvidence("피부과", "linked_client"),
      photoDepartmentEvidence("정형외과", "folder_name"),
    ])).toMatchObject({ status: "conflict" });
  });

  it("근거가 없으면 기본 진료과를 만들지 않는다", () => {
    expect(resolvePhotoDepartmentEvidence([])).toEqual({ status: "unknown", evidence: [] });
  });

  it("사용자가 직접 고른 값은 자동 근거보다 우선한다", () => {
    expect(resolvePhotoDepartmentEvidence([
      photoDepartmentEvidence("피부과", "linked_client"),
      ...manualPhotoDepartmentResolution("orthopedics_neurosurgery").evidence,
    ])).toMatchObject({
      status: "resolved",
      department: "orthopedics_neurosurgery",
      source: "manual",
    });
  });

  it("날짜 접두어를 제거하고 Unicode를 정규화한다", () => {
    expect(photoFolderClientName("1025_강재활의학과")).toBe("강재활의학과");
    expect(photoFolderClientName("20261025 강재활의학과")).toBe("강재활의학과");
    expect(photoFolderClientName("병원촬영/20261025 강재활의학과")).toBe("강재활의학과");
  });

  it.each([
    "100MSDCF",
    "101MSDCF",
    "100CANON",
    "100EOS5D",
    "100_FUJI",
    "dcim",
    "JPG전체",
  ])("%s를 의미 없는 카메라·관리 폴더로 판정한다", (name) => {
    expect(isCameraGeneratedFolderName(name)).toBe(true);
  });

  it("촬영 프로젝트 폴더는 카메라 폴더로 오인하지 않는다", () => {
    expect(isCameraGeneratedFolderName("0923_전주푸른안과")).toBe(false);
  });

  it("전체 경로에서 가장 가까운 의미 있는 폴더로 고객명을 만든다", () => {
    const path = ["0923_전주푸른안과", "JPG전체", "100MSDCF"];
    expect(meaningfulPhotoFolderName(path)).toBe("0923_전주푸른안과");
    expect(photoFolderClientName(path)).toBe("전주푸른안과");
    expect(departmentFromPhotoText(photoFolderClientName(path))).toBe("ophthalmology");
  });
});
