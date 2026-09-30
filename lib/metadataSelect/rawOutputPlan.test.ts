import { describe, expect, it } from "vitest";
import { planMetadataRawOutput } from "@/lib/metadataSelect/rawOutputPlan";
import { FINISHED_RAW_DIRECTORY, SELECTED_RAW_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";

describe("planMetadataRawOutput", () => {
  it("일반 매칭은 Selected_RAW로 복사한다", () => {
    expect(planMetadataRawOutput({
      rawNames: ["R5K0001.ARW"],
      excludeCompleted: false,
      transferMode: "copy",
      finishedRawNames: [],
    })).toEqual({
      destinationDirectory: SELECTED_RAW_DIRECTORY,
      copyFromRawNames: ["R5K0001.ARW"],
      moveFromRawNames: [],
      alreadyFinishedNames: [],
    });
  });

  it("제외 매칭은 선택한 RAW 작업본을 Finished_RAW로 이동시킨다", () => {
    expect(planMetadataRawOutput({
      rawNames: ["camera/R5K0001.ARW", "camera/R5K0002.ARW"],
      excludeCompleted: true,
      transferMode: "copy",
      finishedRawNames: [],
    })).toEqual({
      destinationDirectory: FINISHED_RAW_DIRECTORY,
      copyFromRawNames: [],
      moveFromRawNames: ["camera/R5K0001.ARW", "camera/R5K0002.ARW"],
      alreadyFinishedNames: [],
    });
  });

  it("Finished_RAW에 있는 사진은 일반 매칭에서도 다시 Selected_RAW로 복사하지 않는다", () => {
    expect(planMetadataRawOutput({
      rawNames: ["R5K0001.ARW", "R5K0002.ARW"],
      excludeCompleted: false,
      transferMode: "copy",
      finishedRawNames: ["R5K0001.ARW"],
    })).toMatchObject({
      copyFromRawNames: ["R5K0002.ARW"],
      alreadyFinishedNames: ["R5K0001.ARW"],
    });
  });

  it("경로·대소문자·Unicode 정규화 차이를 제외 판정에서 흡수한다", () => {
    expect(planMetadataRawOutput({
      rawNames: ["camera/R5K0001.ARW"],
      excludeCompleted: true,
      transferMode: "move",
      finishedRawNames: [],
    }).moveFromRawNames).toEqual(["camera/R5K0001.ARW"]);
  });

  it("일반 매칭에서 이동을 선택하면 Selected_RAW로 안전 이동 계획을 만든다", () => {
    expect(planMetadataRawOutput({
      rawNames: ["R5K0001.ARW", "R5K0002.ARW"],
      excludeCompleted: false,
      transferMode: "move",
      finishedRawNames: [],
    })).toEqual({
      destinationDirectory: SELECTED_RAW_DIRECTORY,
      copyFromRawNames: [],
      moveFromRawNames: ["R5K0001.ARW", "R5K0002.ARW"],
      alreadyFinishedNames: [],
    });
  });

  it("동일 시간 그룹이 반복한 같은 RAW 경로는 실제 작업 계획에서 한 번만 처리한다", () => {
    expect(planMetadataRawOutput({
      rawNames: ["burst/DSC07907.ARW", "burst/dsc07907.arw", "burst/DSC07908.ARW"],
      excludeCompleted: false,
      transferMode: "copy",
      finishedRawNames: [],
    }).copyFromRawNames).toEqual(["burst/DSC07907.ARW", "burst/DSC07908.ARW"]);
  });
});
