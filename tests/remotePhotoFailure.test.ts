import { describe, expect, it } from "vitest";
import { describeRemotePhotoFailure } from "@/lib/photo-classifier/remotePhotoFailure";

describe("원격 사진 작업 실패 표시", () => {
  it("Agentstation에 이미 있는 작업본을 정확한 원인으로 표시한다", () => {
    expect(describeRemotePhotoFailure(
      "작업본 폴더가 이미 생성되어 있어 새 복사를 시작하지 않았습니다: /Volumes/Agentstation(M.2SSD)/0927_BLS_TEST",
    )).toEqual({
      title: "Agentstation에 작업 폴더가 이미 생성되어 있습니다.",
      detail: "새 복사를 시작하지 않았습니다. 작업본: /Volumes/Agentstation(M.2SSD)/0927_BLS_TEST",
    });
  });

  it("알 수 없는 실패도 원문을 보존한다", () => {
    expect(describeRemotePhotoFailure("OPENAI_API_KEY가 없습니다.")).toEqual({
      title: "Mac Studio 작업을 완료하지 못했습니다.",
      detail: "OPENAI_API_KEY가 없습니다.",
    });
  });
});
