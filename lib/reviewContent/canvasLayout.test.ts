import { describe, expect, it } from "vitest";
import { createReviewStoryDocument } from "./storyDocument";
import { reviewCanvasCaptureSize, reviewCanvasElementStyle, reviewCanvasImageStyle, reviewCanvasTextStyle } from "./canvasLayout";

describe("review canvas canonical layout", () => {
  const documentValue = createReviewStoryDocument({ reviewText: "긴 후기 본문입니다.", hospitalName: "포토클리닉" }, { template: "photo_bottom" });

  it("keeps canonical and 2x capture dimensions at the same 4:5 ratio", () => {
    expect(reviewCanvasCaptureSize(documentValue, 1080)).toEqual({ width: 1080, height: 1350, scale: 1 });
    expect(reviewCanvasCaptureSize(documentValue, 2160)).toEqual({ width: 2160, height: 2700, scale: 2 });
  });

  it("uses logical pixel geometry without editor zoom", () => {
    const element = documentValue.elements[0];
    expect(reviewCanvasElementStyle(element)).toMatchObject({
      left: `${element.x}px`,
      top: `${element.y}px`,
      width: `${element.width}px`,
      height: `${element.height}px`,
    });
  });

  it("keeps image crop and text layout values as the source of truth", () => {
    const image = documentValue.elements.find((element) => element.type === "image");
    const text = documentValue.elements.find((element) => element.type === "text");
    expect(image?.type).toBe("image");
    expect(text?.type).toBe("text");
    if (image?.type === "image") {
      expect(reviewCanvasImageStyle({ ...image, cropX: 37, cropY: 62, scale: 1.35 })).toEqual({ objectFit: "cover", objectPosition: "37% 62%", transform: "scale(1.35)" });
    }
    if (text?.type === "text") {
      expect(reviewCanvasTextStyle({ ...text, fontSize: 42, lineHeight: 1.6, letterSpacing: -0.8 })).toMatchObject({ fontSize: "42px", lineHeight: 1.6, letterSpacing: "-0.8px" });
    }
  });

  it("uses Korean-friendly automatic wrapping and preserves manual-only mode", () => {
    const text = documentValue.elements.find((element) => element.type === "text");
    expect(text?.type).toBe("text");
    if (text?.type !== "text") return;

    expect(reviewCanvasTextStyle(text)).toMatchObject({
      whiteSpace: "pre-wrap",
      wordBreak: "keep-all",
      overflowWrap: "break-word",
      lineBreak: "strict",
      textWrap: "pretty",
    });
    expect(reviewCanvasTextStyle({ ...text, autoWrap: false })).toMatchObject({
      whiteSpace: "pre",
      wordBreak: "normal",
      overflowWrap: "normal",
      textWrap: "nowrap",
    });
  });
});
