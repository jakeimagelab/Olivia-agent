import {
  compactSelectionSyncDiffs,
  type SelectionSyncDiff,
} from "./selectionSync";

export type PersonSelectChoice = {
  id: string;
  image_id: string;
  original_file_name: string;
  thumb_url: string | null;
  retouch_keys: string[];
  memo: string;
  updated_at: string;
};

export type PersonSelectImageData = {
  id: string;
  original_file_name: string;
  thumb_url: string;
  preview_url: string;
  width: number | null;
  height: number | null;
  sort_order?: number;
};

export type PersonChoiceSyncSnapshot = {
  items: Array<{
    imageId: string;
    categoryKey: string;
    selected: boolean;
    memo?: string;
    retouchKeys?: string[];
    updatedAt?: string;
  }>;
  updatedAt?: string | null;
};

export function personChoiceMap(choices: readonly PersonSelectChoice[]) {
  return new Map(choices.map((choice) => [choice.image_id, choice]));
}

function sameRetouchKeys(left: readonly string[], right: readonly string[]) {
  return left === right || (left.length === right.length && left.every((key, index) => key === right[index]));
}

function samePersonChoice(left: PersonSelectChoice, right: PersonSelectChoice) {
  return left.image_id === right.image_id
    && left.original_file_name === right.original_file_name
    && left.thumb_url === right.thumb_url
    && left.memo === right.memo
    && sameRetouchKeys(left.retouch_keys, right.retouch_keys);
}

export function reconcilePersonChoiceMaps(
  previous: Map<string, PersonSelectChoice>,
  incoming: ReadonlyMap<string, PersonSelectChoice>,
): Map<string, PersonSelectChoice> {
  let changed = previous.size !== incoming.size;
  const next = new Map<string, PersonSelectChoice>();
  for (const [imageId, choice] of incoming) {
    const current = previous.get(imageId);
    if (current && samePersonChoice(current, choice)) next.set(imageId, current);
    else {
      changed = true;
      next.set(imageId, choice);
    }
  }
  return changed ? next : previous;
}

export function overlayPersonChoiceDiffs(
  base: ReadonlyMap<string, PersonSelectChoice>,
  diffs: readonly SelectionSyncDiff[],
  images: readonly PersonSelectImageData[] | ReadonlyMap<string, PersonSelectImageData>,
) {
  const next = new Map(base);
  const imageById = Array.isArray(images)
    ? new Map(images.map((image) => [image.id, image]))
    : images as ReadonlyMap<string, PersonSelectImageData>;
  for (const diff of compactSelectionSyncDiffs(diffs)) {
    const image = imageById.get(diff.imageId);
    if (!image) continue;
    const current = next.get(diff.imageId);
    if (Object.prototype.hasOwnProperty.call(diff, "selected")) {
      if (!diff.selected) {
        next.delete(diff.imageId);
        continue;
      }
      if (!current) next.set(diff.imageId, {
        id: `pending-${diff.imageId}`,
        image_id: diff.imageId,
        original_file_name: image.original_file_name,
        thumb_url: image.thumb_url,
        retouch_keys: [],
        memo: "",
        updated_at: diff.changedAt,
      });
    }
    const choice = next.get(diff.imageId);
    if (!choice) continue;
    if (Object.prototype.hasOwnProperty.call(diff, "memo")) {
      next.set(diff.imageId, { ...choice, memo: diff.memo ?? "", updated_at: diff.changedAt });
    }
    if (Object.prototype.hasOwnProperty.call(diff, "retouchKeys")) {
      next.set(diff.imageId, { ...choice, retouch_keys: diff.retouchKeys ?? [], updated_at: diff.changedAt });
    }
  }
  return next;
}
