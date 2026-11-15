import { deltaE76, labChroma, labHue, smoothstep, srgbToLab } from "./colorSpace";
import type { LabColor, PhotoEditImage, PhotoEditMasks } from "./types";

export function skinMaskWeight(lab: LabColor): number {
  const l = smoothstep(18, 30, lab.l) * (1 - smoothstep(92, 98, lab.l));
  const chroma = labChroma(lab);
  const c = smoothstep(4, 8, chroma) * (1 - smoothstep(42, 55, chroma));
  const hue = labHue(lab);
  const h = smoothstep(12, 26, hue) * (1 - smoothstep(80, 100, hue));
  return l * c * h;
}

function boxBlurLine(source: Float32Array, target: Float32Array, length: number, lines: number, stride: number, lineStride: number, radius: number) {
  const window = radius * 2 + 1;
  for (let line = 0; line < lines; line += 1) {
    const base = line * lineStride;
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const position = Math.min(length - 1, Math.max(0, offset));
      sum += source[base + position * stride];
    }
    for (let position = 0; position < length; position += 1) {
      target[base + position * stride] = sum / window;
      const remove = Math.min(length - 1, Math.max(0, position - radius));
      const add = Math.min(length - 1, Math.max(0, position + radius + 1));
      sum += source[base + add * stride] - source[base + remove * stride];
    }
  }
}

export function blurMask(mask: Float32Array, width: number, height: number, radius: number): Float32Array {
  const resolved = Math.max(0, Math.round(radius));
  if (resolved === 0) return mask.slice();
  const horizontal = new Float32Array(mask.length);
  const vertical = new Float32Array(mask.length);
  boxBlurLine(mask, horizontal, width, height, 1, width, resolved);
  boxBlurLine(horizontal, vertical, height, width, width, 1, resolved);
  return vertical;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  values.sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

export function estimateBackgroundLab(image: PhotoEditImage): LabColor | null {
  const startY = Math.max(0, Math.floor(image.height * 0.02));
  const endY = Math.max(startY + 1, Math.ceil(image.height * 0.08));
  const step = Math.max(1, Math.ceil((Math.max(1, endY - startY) * image.width) / 40_000));
  const l: number[] = [];
  const a: number[] = [];
  const b: number[] = [];
  let sampleIndex = 0;
  for (let y = startY; y < Math.min(image.height, endY); y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (sampleIndex++ % step) continue;
      const offset = (y * image.width + x) * 3;
      const lab = srgbToLab(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
      l.push(lab.l); a.push(lab.a); b.push(lab.b);
    }
  }
  const ml = median(l); const ma = median(a); const mb = median(b);
  return ml === null || ma === null || mb === null ? null : { l: ml, a: ma, b: mb };
}

export function createPhotoEditMasks(image: PhotoEditImage): PhotoEditMasks {
  if (image.data.length !== image.width * image.height * 3) throw new Error("RGB 버퍼 크기와 이미지 크기가 맞지 않습니다.");
  const rawSkin = new Float32Array(image.width * image.height);
  const rawGown = new Float32Array(image.width * image.height);
  const background = estimateBackgroundLab(image);
  for (let index = 0; index < rawSkin.length; index += 1) {
    const offset = index * 3;
    const lab = srgbToLab(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
    const skin = skinMaskWeight(lab);
    rawSkin[index] = skin;
    const y = Math.floor(index / image.width) / Math.max(1, image.height - 1);
    const chroma = labChroma(lab);
    const backgroundDistance = background ? deltaE76(lab, background) : 100;
    rawGown[index] = (1 - smoothstep(10, 12, chroma))
      * smoothstep(62, 68, lab.l)
      * smoothstep(0.28, 0.35, y)
      * smoothstep(2.5, 5, backgroundDistance)
      * (1 - skin);
  }
  const radius = Math.max(1, Math.round(Math.max(image.width, image.height) * 0.0015));
  return {
    skin: blurMask(rawSkin, image.width, image.height, radius),
    gown: blurMask(rawGown, image.width, image.height, radius),
  };
}
