"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";

import { formatBytes } from "@/components/olivia-bridge/OliviaBridgeMedia";
import type { BridgeColorLabels } from "@/lib/photo-bridge/labels";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";

type BridgeFocusedFile = {
  id: string;
  name: string;
  extension: string;
  size: number;
};

export function useOliviaBridgeWorkspaceSync({
  focusedIndex,
  visibleJpgs,
  focusedPhoto,
  visiblePlainFiles,
  focusedPlainFile,
  folderPath,
  selectedJpgCount,
  clientId,
  workflowRunId,
  ratings,
  ratingEdits,
  colorLabels,
  excludedIds,
  setFocusedId,
  setAnchorId,
  setFocusedPlainId,
  setPreviewSize,
}: {
  focusedIndex: number;
  visibleJpgs: readonly BridgeFocusedFile[];
  focusedPhoto: BridgeFocusedFile | null;
  visiblePlainFiles: readonly BridgeFocusedFile[];
  focusedPlainFile: BridgeFocusedFile | null;
  folderPath: string;
  selectedJpgCount: number;
  clientId?: string;
  workflowRunId?: string;
  ratings: Readonly<Record<string, number>>;
  ratingEdits: Readonly<Record<string, number>>;
  colorLabels: Readonly<BridgeColorLabels>;
  excludedIds: ReadonlySet<string>;
  setFocusedId: Dispatch<SetStateAction<string | null>>;
  setAnchorId: Dispatch<SetStateAction<string | null>>;
  setFocusedPlainId: Dispatch<SetStateAction<string | null>>;
  setPreviewSize: Dispatch<SetStateAction<{ width: number; height: number } | undefined>>;
}) {
  useEffect(() => {
    if (focusedIndex >= 0) return;
    const next = visibleJpgs[0] ?? null;
    setFocusedId(next?.id ?? null);
    setAnchorId(next?.id ?? null);
    setPreviewSize(undefined);
  }, [focusedIndex, setAnchorId, setFocusedId, setPreviewSize, visibleJpgs]);

  useEffect(() => {
    if (focusedPlainFile || !visiblePlainFiles.length) return;
    setFocusedPlainId(visiblePlainFiles[0].id);
  }, [focusedPlainFile, setFocusedPlainId, visiblePlainFiles]);

  useEffect(() => {
    const context = useOliviaContextStore.getState();
    context.setWorkspace("photo-sort", folderPath || undefined);
    context.setSelection(
      focusedPhoto ? "file" : focusedPlainFile ? "file" : undefined,
      focusedPhoto?.id ?? focusedPlainFile?.id,
    );
  }, [focusedPhoto, focusedPlainFile, folderPath]);

  useEffect(() => {
    const focused = focusedPhoto ?? focusedPlainFile;
    if (!focused) {
      emitShellSelection({ clear: true, sourceAppId: "olivia-bridge", sourceWindowId: "olivia-bridge" });
      return;
    }
    emitShellSelection({
      sourceAppId: "olivia-bridge",
      sourceWindowId: "olivia-bridge",
      itemId: focused.id,
      title: focused.name,
      subtitle: `${focused.extension} · ${formatBytes(focused.size)} · 선택 JPG ${selectedJpgCount}장`,
      next: focusedPhoto ? "미리보기와 별점, 선택 상태를 확인합니다." : "RAW와 사이드카 파일 정보를 확인합니다.",
      appId: "olivia-bridge",
      context: {
        clientId,
        workflowRunId,
        projectId: workflowRunId,
        resourceId: folderPath || undefined,
        resourceType: "photo-folder",
        featureItemId: focused.id,
      },
      featureItemId: focused.id,
    });
  }, [clientId, focusedPhoto, focusedPlainFile, folderPath, selectedJpgCount, workflowRunId]);

  useEffect(() => {
    if (!folderPath) return;
    try {
      localStorage.setItem(
        `olivia-bridge:marks:${folderPath}`,
        JSON.stringify({ ratings, ratingEdits, colorLabels, excluded: [...excludedIds] }),
      );
    } catch (error) {
      void error;
    }
  }, [colorLabels, excludedIds, folderPath, ratingEdits, ratings]);
}
