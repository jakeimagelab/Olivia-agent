import sharp from "sharp";

export async function parseBillingConsentSignature(dataUrl: unknown, limitInputPixels?: number) {
  if (typeof dataUrl !== "string") throw new Error("서명을 입력해 주세요.");
  const match = dataUrl.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("서명 형식이 올바르지 않습니다.");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length < 20 || buffer.length > 2 * 1024 * 1024) {
    throw new Error("서명 이미지 크기가 올바르지 않습니다.");
  }
  const { data, info } = await sharp(buffer, { limitInputPixels })
    .rotate()
    .ensureAlpha()
    .resize({ width: 1_000, height: 500, fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let ink = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3] ?? 255;
    if (alpha > 20 && Math.min(red, green, blue) < 235) ink += 1;
  }
  if (ink < 20) throw new Error("서명을 입력해 주세요.");
  return {
    buffer,
    mimeType: match[1] === "jpeg" ? "image/jpeg" : "image/png",
    extension: match[1] === "jpeg" ? "jpg" : "png",
    dataUrl,
  };
}
