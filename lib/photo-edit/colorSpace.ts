import type { LabColor } from "./types";

const XN = 0.95047;
const YN = 1;
const ZN = 1.08883;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function srgbChannelToLinear(value: number): number {
  const channel = clamp(value, 0, 1);
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function linearChannelToSrgb(value: number): number {
  const channel = clamp(value, 0, 1);
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function labF(value: number): number {
  return value > EPSILON ? Math.cbrt(value) : (KAPPA * value + 16) / 116;
}

function labFInverse(value: number): number {
  const cube = value ** 3;
  return cube > EPSILON ? cube : (116 * value - 16) / KAPPA;
}

export function linearRgbToLab(red: number, green: number, blue: number): LabColor {
  const x = red * 0.4124564 + green * 0.3575761 + blue * 0.1804375;
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
  const z = red * 0.0193339 + green * 0.119192 + blue * 0.9503041;
  const fx = labF(x / XN);
  const fy = labF(y / YN);
  const fz = labF(z / ZN);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToLinearRgb(lab: LabColor): [number, number, number] {
  const fy = (lab.l + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;
  const x = XN * labFInverse(fx);
  const y = YN * labFInverse(fy);
  const z = ZN * labFInverse(fz);
  return [
    clamp(x * 3.2404542 + y * -1.5371385 + z * -0.4985314, 0, 1),
    clamp(x * -0.969266 + y * 1.8760108 + z * 0.041556, 0, 1),
    clamp(x * 0.0556434 + y * -0.2040259 + z * 1.0572252, 0, 1),
  ];
}

export function srgbToLab(red: number, green: number, blue: number): LabColor {
  return linearRgbToLab(
    srgbChannelToLinear(red / 255),
    srgbChannelToLinear(green / 255),
    srgbChannelToLinear(blue / 255),
  );
}

export function labToSrgb(lab: LabColor): [number, number, number] {
  const [red, green, blue] = labToLinearRgb(lab);
  return [
    linearChannelToSrgb(red) * 255,
    linearChannelToSrgb(green) * 255,
    linearChannelToSrgb(blue) * 255,
  ];
}

export function labChroma(lab: LabColor): number {
  return Math.hypot(lab.a, lab.b);
}

export function labHue(lab: LabColor): number {
  const angle = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
  return angle < 0 ? angle + 360 : angle;
}

export function lchToLab(l: number, chroma: number, hue: number): LabColor {
  const radians = hue * Math.PI / 180;
  return { l, a: chroma * Math.cos(radians), b: chroma * Math.sin(radians) };
}

export function deltaE76(left: LabColor, right: LabColor): number {
  return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b);
}

export function shortestHueDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
