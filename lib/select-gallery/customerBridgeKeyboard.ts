export type CustomerBridgeKeyboardCommand =
  | { type: "blocked" }
  | { type: "close-guide" }
  | { type: "close-reset" }
  | { type: "close-fullscreen" }
  | { type: "close-review" }
  | { type: "close-mobile-side" }
  | { type: "close-folders" }
  | { type: "open-review" }
  | { type: "open-fullscreen"; imageId: string }
  | { type: "apply-mark"; value: number }
  | { type: "move-review"; delta: -1 | 1 }
  | { type: "remove-review-image"; imageId: string }
  | { type: "restore-review-image" }
  | { type: "move-fullscreen"; delta: -1 | 1 }
  | { type: "move-grid"; key: string };

type CustomerBridgeKeyboardInput = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  guideOpen: boolean;
  resetConfirmOpen: boolean;
  mobileSideOpen: boolean;
  fullscreenId: string | null;
  reviewOpen: boolean;
  reviewActiveId: string | null;
  reviewCanRestore: boolean;
  focusedImageId: string | null;
  readOnly: boolean;
};

export function resolveCustomerBridgeKeyboardCommand({
  key,
  metaKey = false,
  ctrlKey = false,
  guideOpen,
  resetConfirmOpen,
  mobileSideOpen,
  fullscreenId,
  reviewOpen,
  reviewActiveId,
  reviewCanRestore,
  focusedImageId,
  readOnly,
}: CustomerBridgeKeyboardInput): CustomerBridgeKeyboardCommand | null {
  if (guideOpen || resetConfirmOpen) {
    if (key !== "Escape") return { type: "blocked" };
    return guideOpen ? { type: "close-guide" } : { type: "close-reset" };
  }

  if (key === "Escape") {
    if (fullscreenId) return { type: "close-fullscreen" };
    if (reviewOpen) return { type: "close-review" };
    if (mobileSideOpen) return { type: "close-mobile-side" };
    return { type: "close-folders" };
  }

  if ((metaKey || ctrlKey) && key.toLowerCase() === "b") {
    return { type: "open-review" };
  }

  if (key === " ") {
    const imageId = reviewActiveId ?? focusedImageId;
    return imageId ? { type: "open-fullscreen", imageId } : null;
  }

  if (!readOnly && /^[0-9]$/.test(key)) {
    return { type: "apply-mark", value: Number(key) };
  }

  if (reviewOpen) {
    if (key === "ArrowLeft" || key === "ArrowRight") {
      return { type: "move-review", delta: key === "ArrowLeft" ? -1 : 1 };
    }
    if (key === "ArrowDown" && reviewActiveId) {
      return { type: "remove-review-image", imageId: reviewActiveId };
    }
    if (key === "ArrowUp" && reviewCanRestore) {
      return { type: "restore-review-image" };
    }
    return { type: "blocked" };
  }

  if (fullscreenId && (key === "ArrowLeft" || key === "ArrowRight")) {
    return { type: "move-fullscreen", delta: key === "ArrowLeft" ? -1 : 1 };
  }

  if (focusedImageId && key.startsWith("Arrow")) {
    return { type: "move-grid", key };
  }

  return null;
}

export function customerBridgeGridNavigationTarget({
  orderedIds,
  currentId,
  key,
  columns,
}: {
  orderedIds: readonly string[];
  currentId: string;
  key: string;
  columns: number;
}) {
  const currentIndex = orderedIds.indexOf(currentId);
  if (currentIndex < 0 || !key.startsWith("Arrow")) return null;
  const safeColumns = Math.max(1, columns);
  const delta = key === "ArrowLeft"
    ? -1
    : key === "ArrowRight"
      ? 1
      : key === "ArrowUp"
        ? -safeColumns
        : safeColumns;
  return orderedIds[Math.max(0, Math.min(orderedIds.length - 1, currentIndex + delta))] ?? null;
}
