import {
  bridgeLabelFilterName,
  type BridgeLabelFilters,
} from "@/lib/photo-bridge/labels";
import type { CustomerBridgePhotoFilter as PhotoFilter } from "./customerBridgeView";

type CustomerBridgePresentationLocation =
  | { kind: "root" }
  | { kind: "all" }
  | { kind: "folder"; path: string };

export function buildCustomerBridgePresentation({
  location,
  manifestRootPhotoCount,
  loadedRootPhotoCount,
  childFolderCount,
  locationTotalCount,
  selectedInFolder,
  searchActive,
  filter,
  labelFilters,
  imagePageInitialized,
  imagePageTotalCount,
  visibleImageCount,
  readOnly,
  saveStatus,
  lastSavedAt,
  pendingCount,
}: {
  location: CustomerBridgePresentationLocation;
  manifestRootPhotoCount?: number;
  loadedRootPhotoCount: number;
  childFolderCount: number;
  locationTotalCount: number;
  selectedInFolder: number;
  searchActive: boolean;
  filter: PhotoFilter;
  labelFilters: BridgeLabelFilters;
  imagePageInitialized: boolean;
  imagePageTotalCount: number;
  visibleImageCount: number;
  readOnly: boolean;
  saveStatus: "saved" | "saving" | "waiting" | "retrying" | "error";
  lastSavedAt: string | null;
  pendingCount: number;
}) {
  const locationLabel = location.kind === "root" ? "프로젝트" : location.kind === "all" ? "전체 사진" : location.path || "루트 사진";
  const rootPhotoCount = manifestRootPhotoCount ?? loadedRootPhotoCount;
  const hasRootPhotos = rootPhotoCount > 0;
  const unselectedInLocation = Math.max(0, locationTotalCount - selectedInFolder);
  const hasLabelFilter = labelFilters.rating !== null || labelFilters.color !== null;
  const browserPhotoCount = searchActive && filter === "all" && !hasLabelFilter && imagePageInitialized
    ? imagePageTotalCount
    : !searchActive && !hasLabelFilter && filter === "all"
      ? locationTotalCount
      : !searchActive && !hasLabelFilter && filter === "selected"
        ? selectedInFolder
        : !searchActive && !hasLabelFilter && filter === "unselected"
          ? unselectedInLocation
          : visibleImageCount;
  const locationCount = location.kind === "root" ? childFolderCount + (hasRootPhotos ? 1 : 0) : browserPhotoCount;
  const activeRatingFilterName = labelFilters.rating === null
    ? null
    : bridgeLabelFilterName({ kind: "rating", rating: labelFilters.rating });
  const activeColorFilterName = labelFilters.color === null
    ? null
    : bridgeLabelFilterName({ kind: "color", label: labelFilters.color });
  const saveStatusMessage = readOnly
    ? "관리자 사진 확인"
    : saveStatus === "saved"
      ? lastSavedAt ? "저장됨 · 방금" : "저장됨"
      : saveStatus === "saving"
        ? "저장 중…"
        : saveStatus === "waiting"
          ? `저장 안 된 변경 ${pendingCount}건 · 잠시 후 저장`
          : saveStatus === "retrying"
            ? `저장 안 된 변경 ${pendingCount}건 · 잠시 후 자동 저장`
            : `저장 안 된 변경 ${pendingCount}건 · 다시 시도`;

  return {
    locationLabel,
    rootPhotoCount,
    hasRootPhotos,
    unselectedInLocation,
    browserPhotoCount,
    locationCount,
    activeRatingFilterName,
    activeColorFilterName,
    saveStatusMessage,
  };
}
