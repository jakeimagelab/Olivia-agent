import { describe, expect, it } from "vitest";
import { planMetadataRawOutput } from "@/lib/metadataSelect/rawOutputPlan";
import { FINISHED_RAW_DIRECTORY, SELECTED_RAW_DIRECTORY } from "@/lib/photo-classifier/node/storageLayout";

describe("planMetadataRawOutput", () => {
  it("일반 매칭은 Selected_RAW로 복사한다", () => {
    expect(planMetadataRawOutput({
      rawNames: ["R5K0001.ARW"],
      excludeCompleted: false,
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
      finishedRawNames: [],
    }).moveFromRawNames).toEqual(["camera/R5K0001.ARW"]);
  });
});
