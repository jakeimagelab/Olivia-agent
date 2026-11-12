"use client";

import { useCallback, useState, type RefObject } from "react";

import type {
  PersonSelectEventSummary,
  PersonSelectImportResult,
} from "@/components/olivia-bridge/OliviaBridgeDialogs";
import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import { matchPersonSelectFileNames } from "@/lib/photo-bridge/personSelectImport";

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
      const response = await fetch("/api/person-select", { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean;
        events?: PersonSelectEventSummary[];
        error?: string;
      };
      if (!response.ok || !body.ok) throw new Error(body.error || "개인별 사진 셀렉 행사를 불러오지 못했습니다.");
      setEvents(Array.isArray(body.events) ? body.events : []);
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
      const response = await fetch(`/api/person-select/${event.id}/exports/selected`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean;
        eventTitle?: string;
        fileNames?: unknown;
        error?: string;
      };
      if (!response.ok || !body.ok) throw new Error(body.error || "고객 선택을 불러오지 못했습니다.");
      const fileNames = Array.isArray(body.fileNames)
        ? body.fileNames.filter((name): name is string => typeof name === "string")
        : [];
      const match = matchPersonSelectFileNames(fileNames, jpgs.map((photo) => photo.name));
      setSelectedJpgNames(match.fileNames);
      setResult({ ...match, eventTitle: body.eventTitle || event.title });
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
