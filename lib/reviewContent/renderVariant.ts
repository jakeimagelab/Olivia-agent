import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

export type ReviewLayoutConfig = {
  template?: "photo_bottom" | "photo_overlay" | "text_only" | "frame" | "accent_bar";
  background?: string;
  accent?: string;
  textColor?: string;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapWords(text: string, maxUnits: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && Array.from(candidate).length > maxUnits) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 7);
}

let fontDataUri = "";
function embeddedFont() {
  if (fontDataUri) return fontDataUri;
  try {
    const file = readFileSync(path.join(process.cwd(), "lib/olivia/fonts/NanumSquare-Regular.ttf"));
    fontDataUri = `data:font/ttf;base64,${file.toString("base64")}`;
  } catch {
    fontDataUri = "";
  }
  return fontDataUri;
}

function textLines(lines: string[], x: number, top: number, size: number, lineHeight: number, color: string) {
  return lines.map((line, index) => (
    `<text x="${x}" y="${top + index * lineHeight}" class="quote" font-size="${size}" fill="${color}">${escapeXml(line)}</text>`
  )).join("");
}

export async function renderReviewVariant(input: {
  reviewText: string;
  hospitalName: string;
  writerName?: string;
  config?: ReviewLayoutConfig;
}) {
  const width = 1080;
  const height = 1350;
  const template = input.config?.template || "text_only";
  const background = input.config?.background || "#155855";
  const accent = input.config?.accent || "#E85D2C";
  const lightBackground = ["photo_bottom", "frame", "accent_bar"].includes(template);
  const textColor = input.config?.textColor || (lightBackground ? "#173734" : "#FFFFFF");
  const mutedColor = lightBackground ? "#5A7470" : "rgba(255,255,255,.68)";
  const lines = wrapWords(input.reviewText, template === "accent_bar" ? 18 : 21);
  const quoteSize = lines.length >= 6 ? 48 : lines.length >= 4 ? 54 : 62;
  const lineHeight = Math.round(quoteSize * 1.55);
  const font = embeddedFont();
  const fontFace = font
    ? `@font-face{font-family:OliviaNanum;src:url('${font}') format('truetype');}`
    : "";

  const ornaments = template === "frame"
    ? `<rect x="46" y="46" width="988" height="1258" rx="34" fill="none" stroke="${accent}" stroke-width="4"/>`
    : template === "accent_bar"
      ? `<rect x="76" y="150" width="12" height="920" rx="6" fill="${accent}"/>`
      : `<circle cx="940" cy="120" r="260" fill="rgba(255,255,255,.055)"/><circle cx="80" cy="1280" r="290" fill="rgba(235,143,34,.11)"/>`;

  const quoteX = template === "accent_bar" ? 140 : 86;
  const quoteTop = template === "photo_bottom" ? 560 : 420;
  const availableWidth = template === "accent_bar" ? 820 : 900;
  const authorTop = Math.min(1140, quoteTop + lines.length * lineHeight + 70);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <style>
        ${fontFace}
        text { font-family: OliviaNanum, "Noto Sans KR", sans-serif; }
        .quote { font-weight: 700; letter-spacing: -1.2px; }
      </style>
      <rect width="1080" height="1350" fill="${background}"/>
      ${ornaments}
      ${template === "photo_bottom" ? `<rect x="0" y="0" width="1080" height="470" fill="#DCE8E5"/><text x="540" y="250" text-anchor="middle" font-size="30" fill="#78908D">PHOTOCLINIC REVIEW</text>` : ""}
      ${template === "photo_overlay" ? `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#386A66"/><stop offset="1" stop-color="#0D3432"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/>` : ""}
      <rect x="86" y="88" width="72" height="12" fill="${accent}"/>
      <text x="86" y="160" font-size="26" font-weight="700" letter-spacing="5" fill="${mutedColor}">PHOTOCLINIC · CLIENT REVIEW</text>
      <text x="${quoteX}" y="${quoteTop - 80}" font-family="Georgia,serif" font-size="150" font-weight="700" fill="${accent}">“</text>
      <g data-width="${availableWidth}">
        ${textLines(lines, quoteX, quoteTop, quoteSize, lineHeight, textColor)}
      </g>
      <rect x="${quoteX}" y="${authorTop + 8}" width="52" height="5" rx="2" fill="${accent}"/>
      <text x="${quoteX + 78}" y="${authorTop + 20}" font-size="30" font-weight="700" fill="${mutedColor}">${escapeXml(input.writerName || input.hospitalName)}</text>
      <text x="86" y="1260" font-size="22" letter-spacing="3" fill="${mutedColor}">포토클리닉 AI 비서 · 올리비아</text>
      <text x="994" y="1260" text-anchor="end" font-size="22" fill="${mutedColor}">${escapeXml(input.hospitalName)}</text>
    </svg>`;

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
