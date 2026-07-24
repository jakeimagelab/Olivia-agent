import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderReviewVariant } from "./renderVariant";

describe("renderReviewVariant", () => {
  it("한글 리뷰를 Instagram 4:5 PNG로 렌더링한다", async () => {
    const image = await renderReviewVariant({
      hospitalName: "포토클리닉",
      writerName: "고객 후기",
      reviewText: "촬영 결과물이 병원의 따뜻한 분위기와 전문성을 자연스럽게 보여줘서 만족했습니다.",
      config: {
        template: "accent_bar",
        background: "#F5F0EB",
        accent: "#E85D2C",
      },
    });

    const metadata = await sharp(image).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1350);
  });
});
