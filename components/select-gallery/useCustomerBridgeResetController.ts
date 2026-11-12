"use client";

import { useCallback, useRef, useState } from "react";
import type { SelectionSyncPatch } from "@/lib/person-select/selectionSync";
import type { CustomerBridgeColorLabel, CustomerBridgeRating } from "@/lib/select-gallery/customerBridge";

export function useCustomerBridgeResetController({
  readOnly,
  customerRatings,
  customerColorLabels,
  notes,
  serverRatings,
  serverColorLabels,
  serverNotes,
  enqueueSelectionSync,
  clearDisplayedSelection,
  flushSelectionSync,
  onResetComplete,
  onError,
}: {
  readOnly: boolean;
  customerRatings: Readonly<Record<string, CustomerBridgeRating>>;
  customerColorLabels: Readonly<Record<string, CustomerBridgeColorLabel>>;
  notes: Readonly<Record<string, string>>;
  serverRatings: Readonly<Record<string, CustomerBridgeRating>>;
  serverColorLabels: Readonly<Record<string, CustomerBridgeColorLabel>>;
  serverNotes: Readonly<Record<string, string>>;
  enqueueSelectionSync: (patches: SelectionSyncPatch[]) => void;
  clearDisplayedSelection: () => void;
  flushSelectionSync: () => Promise<boolean>;
  onResetComplete: () => void;
  onError: (message: string) => void;
}) {
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const resetButtonRef = useRef<HTMLButtonElement>(null);

  const focusResetButton = useCallback(() => {
    requestAnimationFrame(() => resetButtonRef.current?.focus());
  }, []);
  const openResetConfirm = useCallback(() => setResetConfirmOpen(true), []);
  const closeResetConfirm = useCallback(() => {
    if (resetting) return;
    setResetConfirmOpen(false);
    focusResetButton();
  }, [focusResetButton, resetting]);
  const resetSelection = useCallback(async () => {
    if (readOnly || resetting) return;
    setResetting(true);
    try {
      const affectedIds = new Set([
        ...Object.keys(customerRatings),
        ...Object.keys(customerColorLabels),
        ...Object.keys(notes),
        ...Object.keys(serverRatings),
        ...Object.keys(serverColorLabels),
        ...Object.keys(serverNotes),
      ]);
      const patches: SelectionSyncPatch[] = [...affectedIds].flatMap((imageId) => [
        { imageId, rating: null },
        { imageId, colorLabel: null },
        { imageId, memo: "" },
      ]);
      enqueueSelectionSync(patches);
      clearDisplayedSelection();
      const saved = await flushSelectionSync();
      if (!saved) throw new Error("초기화 내용을 저장하지 못했습니다. 자동 재시도합니다.");
      onResetComplete();
      setResetConfirmOpen(false);
      focusResetButton();
    } catch (error) {
      onError(error instanceof Error ? error.message : "셀렉을 초기화하지 못했습니다.");
    } finally {
      setResetting(false);
    }
  }, [clearDisplayedSelection, customerColorLabels, customerRatings, enqueueSelectionSync, flushSelectionSync, focusResetButton, notes, onError, onResetComplete, readOnly, resetting, serverColorLabels, serverNotes, serverRatings]);

  return {
    resetButtonRef,
    resetConfirmOpen,
    resetting,
    openResetConfirm,
    closeResetConfirm,
    resetSelection,
  };
}
