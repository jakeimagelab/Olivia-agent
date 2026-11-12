import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import {
  normalizeBridgeColorLabels,
  normalizeBridgeRatingEdits,
  type BridgeColorLabels,
  type BridgeRatingEdits,
} from "@/lib/photo-bridge/labels";
import type { RemoteBridgeThumbnail } from "@/lib/photo-bridge/remoteThumbnails";
import {
  DEFAULT_BRIDGE_SELECTION_SOURCE,
  normalizeBridgeSelectionSource,
  type BridgeSelectionSource,
} from "@/lib/photo-bridge/toolLinkage";

type StorageReader = Pick<Storage, "getItem">;

export type BridgeFolderMarks = {
  ratings: Record<string, number>;
  ratingEdits: BridgeRatingEdits;
  colorLabels: BridgeColorLabels;
  excludedIds: Set<string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeBridgeRatings(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, rating]) => (
    Number.isInteger(rating) && Number(rating) >= 1 && Number(rating) <= 5
      ? [[id, Number(rating)] as const]
      : []
  )));
}

export function readBridgeFolderSelectionSource(
  storage: StorageReader,
  folderKey: string,
): BridgeSelectionSource {
  try {
    return normalizeBridgeSelectionSource(storage.getItem(`olivia-bridge-selection-source:${folderKey}`));
  } catch {
    return DEFAULT_BRIDGE_SELECTION_SOURCE;
  }
}

export function readBridgeFolderMarks(
  storage: StorageReader,
  folderPath: string,
): BridgeFolderMarks {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(`olivia-bridge:marks:${folderPath}`) ?? "{}");
    if (!isRecord(parsed)) throw new Error("invalid_bridge_marks");
    return {
      ratings: normalizeBridgeRatings(parsed.ratings),
      ratingEdits: normalizeBridgeRatingEdits(parsed.ratingEdits),
      colorLabels: normalizeBridgeColorLabels(parsed.colorLabels),
      excludedIds: new Set(Array.isArray(parsed.excluded)
        ? parsed.excluded.filter((id): id is string => typeof id === "string")
        : []),
    };
  } catch {
    return {
      ratings: {},
      ratingEdits: {},
      colorLabels: {},
      excludedIds: new Set(),
    };
  }
}

export function bridgeFolderMarksByName(
  jpgs: readonly Pick<BridgeJpgFile, "id" | "name">[],
  ratings: Readonly<Record<string, number>>,
  colorLabels: Readonly<BridgeColorLabels>,
) {
  return {
    ratings: Object.fromEntries(jpgs.flatMap((photo) => {
      const rating = ratings[photo.id];
      return rating ? [[photo.name, rating] as const] : [];
    })),
    colorLabels: Object.fromEntries(jpgs.map((photo) => [photo.name, colorLabels[photo.id] ?? 0])),
  };
}

export function remoteBridgeThumbnailsToJpgs(
  folderPath: string,
  thumbs: readonly RemoteBridgeThumbnail[],
): BridgeJpgFile[] {
  return thumbs.map((thumb) => ({
    id: `${folderPath}:${thumb.relativePath}:${thumb.size}:${thumb.lastModified}`,
    name: thumb.name.normalize("NFC"),
    relativeDirectory: thumb.relativePath.includes("/")
      ? thumb.relativePath.split("/").slice(0, -1).join("/").normalize("NFC")
      : "",
    relativePath: thumb.relativePath.normalize("NFC"),
    extension: thumb.name.split(".").pop()?.toLocaleUpperCase("en-US") ?? "JPG",
    thumbnailUrl: thumb.dataUrl,
    size: thumb.size,
    lastModified: thumb.lastModified,
    captureTimestamp: thumb.captureTimestamp,
    timestampSource: thumb.timestampSource,
  }));
}
