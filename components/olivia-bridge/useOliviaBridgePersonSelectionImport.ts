"use client";

import { useCallback, useState, type RefObject } from "react";

import type {
  PersonSelectEventSummary,
  PersonSelectImportResult,
} from "@/components/olivia-bridge/OliviaBridgeDialogs";
import {
  loadOliviaBridgePersonSelection,
  loadOliviaBridgePersonSelectionEvents,
} from "@/components/olivia-bridge/oliviaBridgePersonSelectionClient";
import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";

type UseOliviaBridgePersonSelectionImportOptions = {
  hasActiveFolder: boolean;
  scanStatus: "idle" | "restoring" | "loading" | "ready" | "error";
  jpgs: readonly BridgeJpgFile[];
  manualSelectedIdsRef: RefObject<Set<string>>;
  workspaceRef: RefObject<HTMLDivElement | null>;
  setSelectedJpgNames: (names: string[]) => void;
};

export function useOliviaBridgePersonSelectionImport({
  hasActiveFolder,
  scanStatus,
  jpgs,
  manualSelectedIdsRef,
  workspaceRef,
  setSelectedJpgNames,
}: UseOliviaBridgePersonSelectionImportOptions) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [events, setEvents] = useState<PersonSelectEventSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<PersonSelectImportResult | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setEvents(await loadOliviaBridgePersonSelectionEvents());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "개인별 사진 셀렉 행사를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openImport = useCallback(() => {
    if (!hasActiveFolder || scanStatus !== "ready") return;
    setDialogOpen(true);
    setResult(null);
    void loadEvents();
  }, [hasActiveFolder, loadEvents, scanStatus]);

  const closeImport = useCallback(() => {
    setDialogOpen(false);
    setError("");
    setImportingId("");
    workspaceRef.current?.focus();
  }, [workspaceRef]);

  const chooseAnother = useCallback(() => {
    setResult(null);
  }, []);

  const importEvent = useCallback(async (event: PersonSelectEventSummary) => {
    const manualCount = manualSelectedIdsRef.current.size;
    if (manualCount && !window.confirm(`지금 선택한 ${manualCount}장이 사라집니다. 계속할까요?`)) return;
    setImportingId(event.id);
    setError("");
    try {
      const imported = await loadOliviaBridgePersonSelection({
        event,
        bridgeFileNames: jpgs.map((photo) => photo.name),
      });
      setSelectedJpgNames(imported.fileNames);
      setResult(imported);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "고객 선택을 불러오지 못했습니다.");
    } finally {
      setImportingId("");
    }
  }, [jpgs, manualSelectedIdsRef, setSelectedJpgNames]);

  return {
    personSelectDialogOpen: dialogOpen,
    personSelectEvents: events,
    personSelectEventsLoading: loading,
    personSelectImportingId: importingId,
    personSelectError: error,
    personSelectResult: result,
    loadPersonSelectEvents: loadEvents,
    openPersonSelectImport: openImport,
    closePersonSelectImport: closeImport,
    importPersonSelectEvent: importEvent,
    chooseAnotherPersonSelect: chooseAnother,
  };
}
