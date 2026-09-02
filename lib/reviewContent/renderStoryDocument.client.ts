import type { ReviewStoryDocument, ReviewStoryElement, ReviewStoryImageElement } from "./storyDocument";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = src;
  });
}

// context.font은 CSS 커스텀 프로퍼티(var(--font-sans))를 해석하지 못해서, 캔버스 미리보기와
// PNG 내보내기 결과가 어긋나던 기존 버그를 고친다 — var(...) 형태면 실제 계산된 폰트로 치환한다.
function resolveCanvasFontFamily(fontFamily: string) {
  if (typeof window !== "undefined" && fontFamily.includes("var(")) {
    const resolved = window.getComputedStyle(window.document.body).fontFamily;
    if (resolved) return resolved;
  }
  return fontFamily || "sans-serif";
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, width: number) {
  const paragraphs = text.split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const character of Array.from(paragraph)) {
      const next = `${line}${character}`;
      if (line && context.measureText(next).width > width) {
        lines.push(line);
        line = character;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function gradientForDirection(
  context: CanvasRenderingContext2D,
  direction: "top" | "bottom" | "left" | "right",
  width: number,
  height: number,
  size: number,
  strength: number,
) {
  const fade = Math.max(20, Math.min(direction === "top" || direction === "bottom" ? height : width, size));
  const alpha = Math.max(0, Math.min(1, 1 - strength / 100));
  const gradient = direction === "top"
    ? context.createLinearGradient(0, 0, 0, fade)
    : direction === "bottom"
      ? context.createLinearGradient(0, height - fade, 0, height)
      : direction === "left"
        ? context.createLinearGradient(0, 0, fade, 0)
        : context.createLinearGradient(width - fade, 0, width, 0);
  const outwardFirst = direction === "top" || direction === "left";
  gradient.addColorStop(0, `rgba(0,0,0,${outwardFirst ? alpha : 1})`);
  gradient.addColorStop(1, `rgba(0,0,0,${outwardFirst ? 1 : alpha})`);
  return gradient;
}

async function drawImageElement(
  context: CanvasRenderingContext2D,
  element: ReviewStoryImageElement,
  assetUrls: Record<string, string>,
) {
  const src = element.storagePath ? assetUrls[element.storagePath] || element.src : element.src;
  context.save();
  context.globalAlpha = element.opacity;
  context.translate(element.x + element.width / 2, element.y + element.height / 2);
  context.rotate((element.rotation * Math.PI) / 180);
  context.translate(-element.width / 2, -element.height / 2);
  if (!src) {
    context.fillStyle = "#DDE9E6";
    context.fillRect(0, 0, element.width, element.height);
    context.restore();
    return;
  }
  const image = await loadImage(src);
  const scale = Math.max(element.width / image.naturalWidth, element.height / image.naturalHeight) * element.scale;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = (element.width - drawWidth) * (element.cropX / 100);
  const drawY = (element.height - drawHeight) * (element.cropY / 100);
  const offscreen = document.createElement("canvas");
  offscreen.width = Math.max(1, Math.round(element.width));
  offscreen.height = Math.max(1, Math.round(element.height));
  const offscreenContext = offscreen.getContext("2d");
  if (!offscreenContext) throw new Error("이미지 렌더러를 시작하지 못했습니다.");
  if (element.edgeBlend?.enabled && element.edgeBlend.type === "blur") {
    offscreenContext.filter = `blur(${Math.max(1, element.edgeBlend.strength / 10)}px)`;
  }
  offscreenContext.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  if (element.edgeBlend?.enabled && element.edgeBlend.directions.length) {
    offscreenContext.filter = "none";
    offscreenContext.globalCompositeOperation = "destination-in";
    for (const direction of element.edgeBlend.directions) {
      offscreenContext.fillStyle = gradientForDirection(offscreenContext, direction, offscreen.width, offscreen.height, element.edgeBlend.size, element.edgeBlend.strength);
      offscreenContext.fillRect(0, 0, offscreen.width, offscreen.height);
    }
  }
  context.drawImage(offscreen, 0, 0, element.width, element.height);
  context.restore();
}

async function drawElement(context: CanvasRenderingContext2D, element: ReviewStoryElement, assetUrls: Record<string, string>) {
  if (element.hidden) return;
  if (element.type === "image") return drawImageElement(context, element, assetUrls);
  context.save();
  context.globalAlpha = element.opacity;
  context.translate(element.x + element.width / 2, element.y + element.height / 2);
  context.rotate((element.rotation * Math.PI) / 180);
  context.translate(-element.width / 2, -element.height / 2);
  if (element.type === "shape") {
    context.fillStyle = element.fill;
    context.beginPath();
    context.roundRect(0, 0, element.width, element.height, element.radius);
    context.fill();
  } else {
    context.fillStyle = element.color;
    context.font = `${element.fontWeight} ${element.fontSize}px Arial, sans-serif`;
    context.textAlign = element.textAlign;
    context.textBaseline = "top";
    const x = element.textAlign === "left" ? 0 : element.textAlign === "center" ? element.width / 2 : element.width;
    const lineHeight = element.fontSize * element.lineHeight;
    wrapCanvasText(context, element.text, element.width).forEach((line, index) => {
      if (index * lineHeight < element.height) context.fillText(line, x, index * lineHeight);
    });
  }
  context.restore();
}

export async function renderReviewStoryDocument(
  documentValue: ReviewStoryDocument,
  assetUrls: Record<string, string> = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = documentValue.width;
  canvas.height = documentValue.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG 렌더러를 시작하지 못했습니다.");
  context.fillStyle = documentValue.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const element of [...documentValue.elements].sort((a, b) => a.zIndex - b.zIndex)) {
    await drawElement(context, element, assetUrls);
  }
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG 생성에 실패했습니다.")), "image/png"));
}
