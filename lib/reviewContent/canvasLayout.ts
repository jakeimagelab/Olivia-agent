import type { ReviewStoryDocument, ReviewStoryElement, ReviewStoryImageElement, ReviewStoryTextElement } from "./storyDocument";

export function reviewCanvasElementStyle(element: ReviewStoryElement) {
  return {
    left: `${element.x}px`,
    top: `${element.y}px`,
    width: `${element.width}px`,
    height: `${element.height}px`,
    opacity: element.opacity,
    zIndex: element.zIndex,
    transform: `rotate(${element.rotation}deg)`,
  };
}

export function reviewCanvasImageStyle(element: ReviewStoryImageElement) {
  return {
    objectPosition: `${element.cropX}% ${element.cropY}%`,
    transform: `scale(${element.scale})`,
  };
}

export function reviewCanvasTextStyle(element: ReviewStoryTextElement) {
  return {
    fontFamily: element.fontFamily,
    fontSize: `${element.fontSize}px`,
    fontWeight: element.fontWeight,
    fontStyle: element.italic ? "italic" : "normal",
    textDecoration: element.underline ? "underline" : "none",
    color: element.color,
    textAlign: element.textAlign,
    lineHeight: element.lineHeight,
    letterSpacing: `${element.letterSpacing}px`,
  };
}

export function reviewCanvasCaptureSize(documentValue: ReviewStoryDocument, targetWidthPx: number) {
  const width = Math.max(1, Math.round(targetWidthPx));
  return {
    width,
    height: Math.round((documentValue.height / documentValue.width) * width),
    scale: width / documentValue.width,
  };
}
