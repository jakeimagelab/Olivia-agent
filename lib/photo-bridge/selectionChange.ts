import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";

export type BridgeManualSelectionChange = {
  manualIds: Set<string>;
  manualRemovedIds: Set<string>;
};

export function resolveBridgeManualSelectionChange({
  source,
  requestedIds,
  currentSelectedIds,
  manualIds,
  adobeIds,
  manualRemovedIds,
}: {
  source: BridgeSelectionSource;
  requestedIds: ReadonlySet<string>;
  currentSelectedIds: ReadonlySet<string>;
  manualIds: ReadonlySet<string>;
  adobeIds: ReadonlySet<string>;
  manualRemovedIds: ReadonlySet<string>;
}): BridgeManualSelectionChange {
  if (source === "olivia") {
    return {
      manualIds: new Set(requestedIds),
      manualRemovedIds: new Set(manualRemovedIds),
    };
  }

  if (source === "adobe") {
    return {
      manualIds: new Set(manualIds),
      manualRemovedIds: new Set(manualRemovedIds),
    };
  }

  const nextManualIds = new Set(manualIds);
  const nextManualRemovedIds = new Set(manualRemovedIds);
  const knownIds = new Set([...currentSelectedIds, ...requestedIds, ...manualIds, ...adobeIds]);

  for (const id of knownIds) {
    if (adobeIds.has(id)) {
      if (requestedIds.has(id)) nextManualRemovedIds.delete(id);
      else nextManualRemovedIds.add(id);
    } else if (requestedIds.has(id)) {
      nextManualIds.add(id);
    } else {
      nextManualIds.delete(id);
    }
  }

  return {
    manualIds: nextManualIds,
    manualRemovedIds: nextManualRemovedIds,
  };
}

export function sameBridgeIdSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

export function mergeBridgeSelectionIds(
  currentIds: ReadonlySet<string>,
  additionalIds: ReadonlySet<string>,
): Set<string> {
  if (![...additionalIds].some((id) => !currentIds.has(id))) {
    return currentIds instanceof Set ? currentIds : new Set(currentIds);
  }
  return new Set([...currentIds, ...additionalIds]);
}
