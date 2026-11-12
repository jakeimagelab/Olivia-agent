import type { BridgeJpgFile, BridgeRawFile } from "@/lib/photo-bridge/bridgeFiles";
import type { BridgeColorLabels } from "@/lib/photo-bridge/labels";
import { normalizePhotoToolFileKey } from "@/lib/photo-bridge/toolLinkage";
import type { AdobeBridgeMark } from "@/lib/selectMatch/bridgeRating";

type AdobeMarkPhoto = Pick<BridgeJpgFile, "id" | "name">;
type AdobeMarkRaw = Pick<BridgeRawFile, "id" | "name">;

export type AdobeBridgeMarkProjection = {
  ratings: Record<string, number>;
  colorLabels: BridgeColorLabels;
  rawMarks: Record<string, AdobeBridgeMark>;
  selectedIds: Set<string>;
};

/** 파일명 기반 Adobe/XMP 표시를 현재 Bridge 스캔의 안정적인 ID에 투영한다. */
export function projectAdobeBridgeMarks(
  jpgs: readonly AdobeMarkPhoto[],
  raws: readonly AdobeMarkRaw[],
  marksByFileKey: ReadonlyMap<string, AdobeBridgeMark>,
): AdobeBridgeMarkProjection {
  const ratings: Record<string, number> = {};
  const colorLabels: BridgeColorLabels = {};
  const rawMarks: Record<string, AdobeBridgeMark> = {};
  const selectedIds = new Set<string>();

  for (const photo of jpgs) {
    const mark = marksByFileKey.get(normalizePhotoToolFileKey(photo.name));
    if (!mark) continue;
    if (mark.rating) ratings[photo.id] = mark.rating;
    if (mark.colorLabel) colorLabels[photo.id] = mark.colorLabel;
    selectedIds.add(photo.id);
  }
  for (const raw of raws) {
    const mark = marksByFileKey.get(normalizePhotoToolFileKey(raw.name));
    if (mark) rawMarks[raw.id] = mark;
  }

  return { ratings, colorLabels, rawMarks, selectedIds };
}
