"use client";

import {
  FinalSelectionSubmitDialog,
  type FinalSelectionReviewItem,
  type FinalSelectionReviewSection,
} from "@/components/person-select/FinalSelectionSubmitDialog";
import type {
  CustomerBridgeColorLabel,
  CustomerBridgeRating,
} from "@/lib/select-gallery/customerBridge";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import { CustomerBridgeGuideDialog, CustomerBridgeResetDialog } from "./CustomerBridgeDialogs";
import {
  PhotoOverlay,
  ReviewOverlay,
  type CustomerBridgeReviewRemovedMarks,
} from "./CustomerBridgeOverlays";

export function CustomerBridgeOverlayLayer({
  fullscreenImage,
  fullscreenIndex,
  fullscreenTotal,
  zoomed,
  reviewOpen,
  reviewImages,
  reviewActiveId,
  reviewRemoved,
  ratings,
  colorLabels,
  notes,
  guideOpen,
  resetConfirmOpen,
  resetting,
  submitReviewOpen,
  submitReviewSections,
  submitReviewItems,
  selectedCount,
  submitting,
  submitError,
  readOnly,
  onToggleFullscreenZoom,
  onCloseFullscreen,
  onMoveFullscreen,
  onApplyRating,
  onToggleColor,
  onUpdateNote,
  onImageError,
  onSetReviewActive,
  onCloseReview,
  onRemoveFromReview,
  onRestoreReview,
  onOpenFullscreen,
  onCloseGuide,
  onCloseReset,
  onReset,
  onCloseSubmitReview,
  onSubmit,
}: {
  fullscreenImage: CustomerBridgeImage | null;
  fullscreenIndex: number;
  fullscreenTotal: number;
  zoomed: boolean;
  reviewOpen: boolean;
  reviewImages: CustomerBridgeImage[];
  reviewActiveId: string | null;
  reviewRemoved: CustomerBridgeReviewRemovedMarks | null;
  ratings: Record<string, CustomerBridgeRating>;
  colorLabels: Record<string, CustomerBridgeColorLabel>;
  notes: Record<string, string>;
  guideOpen: boolean;
  resetConfirmOpen: boolean;
  resetting: boolean;
  submitReviewOpen: boolean;
  submitReviewSections: FinalSelectionReviewSection[];
  submitReviewItems: FinalSelectionReviewItem[];
  selectedCount: number;
  submitting: boolean;
  submitError?: string;
  readOnly: boolean;
  onToggleFullscreenZoom: () => void;
  onCloseFullscreen: () => void;
  onMoveFullscreen: (delta: -1 | 1) => void;
  onApplyRating: (targetIds: ReadonlySet<string>, rating: 0 | CustomerBridgeRating) => void;
  onToggleColor: (targetIds: ReadonlySet<string>, colorLabel: CustomerBridgeColorLabel) => void;
  onUpdateNote: (imageId: string, value: string) => void;
  onImageError?: (imageId: string) => void;
  onSetReviewActive: (id: string) => void;
  onCloseReview: () => void;
  onRemoveFromReview: (id: string) => void;
  onRestoreReview: () => void;
  onOpenFullscreen: (id: string) => void;
  onCloseGuide: () => void;
  onCloseReset: () => void;
  onReset: () => void | Promise<void>;
  onCloseSubmitReview: () => void;
  onSubmit: () => void | Promise<void>;
}) {
  return <>
    {fullscreenImage ? <PhotoOverlay
      image={fullscreenImage}
      index={fullscreenIndex}
      total={fullscreenTotal}
      rating={ratings[fullscreenImage.id] ?? 0}
      colorLabel={colorLabels[fullscreenImage.id] ?? null}
      note={notes[fullscreenImage.id] ?? ""}
      zoomed={zoomed}
      onZoom={onToggleFullscreenZoom}
      onClose={onCloseFullscreen}
      onPrev={() => onMoveFullscreen(-1)}
      onNext={() => onMoveFullscreen(1)}
      onRate={(rating) => onApplyRating(new Set([fullscreenImage.id]), rating)}
      onColor={(colorLabel) => onToggleColor(new Set([fullscreenImage.id]), colorLabel)}
      onNote={(value) => onUpdateNote(fullscreenImage.id, value)}
      onImageError={onImageError}
      readOnly={readOnly}
    /> : null}

    {reviewOpen ? <ReviewOverlay
      images={reviewImages}
      activeId={reviewActiveId}
      removed={reviewRemoved}
      ratings={ratings}
      colorLabels={colorLabels}
      onActive={onSetReviewActive}
      onClose={onCloseReview}
      onRemove={onRemoveFromReview}
      onRestore={onRestoreReview}
      onRate={(id, rating) => rating === 0
        ? onRemoveFromReview(id)
        : onApplyRating(new Set([id]), rating)}
      onColor={(id, colorLabel) => colorLabels[id] === colorLabel && !ratings[id]
        ? onRemoveFromReview(id)
        : onToggleColor(new Set([id]), colorLabel)}
      onFullscreen={onOpenFullscreen}
      onImageError={onImageError}
    /> : null}

    {guideOpen ? <CustomerBridgeGuideDialog onClose={onCloseGuide} /> : null}
    {resetConfirmOpen ? <CustomerBridgeResetDialog
      selectedCount={selectedCount}
      resetting={resetting}
      onCancel={onCloseReset}
      onConfirm={() => void onReset()}
    /> : null}
    {submitReviewOpen ? <FinalSelectionSubmitDialog
      selectedCount={selectedCount}
      sections={submitReviewSections}
      items={submitReviewItems}
      busy={submitting}
      error={submitError}
      onCancel={onCloseSubmitReview}
      onConfirm={() => void onSubmit()}
    /> : null}
  </>;
}
