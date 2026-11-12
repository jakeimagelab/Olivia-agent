"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { remoteNasSelectionFromPrefill } from "@/lib/photo-classifier/remotePhotoSource";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";

export function useRemotePhotoSourceSelection({
  enabled,
  initialSelection,
  prefillPath,
}: {
  enabled: boolean;
  initialSelection?: RemoteNasSelection;
  prefillPath: string | null | undefined;
}) {
  const [selection, setSelection] = useState<RemoteNasSelection | null>(initialSelection ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const prefillAppliedRef = useRef(false);

  useEffect(() => {
    if (initialSelection) setSelection(initialSelection);
  }, [initialSelection]);

  useEffect(() => {
    if (!enabled || prefillAppliedRef.current || !prefillPath) return;
    prefillAppliedRef.current = true;
    const prefilledSelection = remoteNasSelectionFromPrefill(prefillPath);
    if (prefilledSelection) setSelection(prefilledSelection);
  }, [enabled, prefillPath]);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const select = useCallback((nextSelection: RemoteNasSelection) => {
    setSelection(nextSelection);
    setPickerOpen(false);
  }, []);

  return {
    closePicker,
    openPicker,
    pickerOpen,
    select,
    selection,
  };
}
