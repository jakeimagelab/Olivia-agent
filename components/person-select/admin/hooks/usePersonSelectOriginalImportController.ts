"use client";

import { useCallback, useState } from "react";

import { usePersonSelectLocalOriginalImport } from "@/components/person-select/admin/hooks/usePersonSelectLocalOriginalImport";
import { usePersonSelectRemoteOriginalImport } from "@/components/person-select/admin/hooks/usePersonSelectRemoteOriginalImport";
import type { PersonSelectImportLayout } from "@/lib/person-select/localImport";

export type PersonSelectSourceMode = "local" | "remote";

export function usePersonSelectOriginalImportController({
  eventId,
  projectTitle,
  layout,
  load,
  onComplete,
  setMessage,
}: {
  eventId: string;
  projectTitle: string;
  layout: PersonSelectImportLayout;
  load: () => Promise<void>;
  onComplete: () => void;
  setMessage: (message: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [path, setPath] = useState("");
  const [sourceMode, setSourceMode] = useState<PersonSelectSourceMode>("local");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const localController = usePersonSelectLocalOriginalImport({
    eventId,
    projectTitle,
    layout,
    load,
    onComplete,
    setMessage,
    setResult,
  });
  const remoteController = usePersonSelectRemoteOriginalImport({
    eventId,
    layout,
    path,
    load,
    onComplete,
    setMessage,
    setResult,
  });
  const { startLocalImport } = localController;
  const { startRemoteImport } = remoteController;

  const startImport = useCallback(
    () => sourceMode === "local" ? startLocalImport() : startRemoteImport(),
    [sourceMode, startLocalImport, startRemoteImport],
  );

  const selectRemotePath = useCallback((nextPath: string) => {
    setPath(nextPath);
    setPickerOpen(false);
  }, []);

  return {
    pickerOpen,
    setPickerOpen,
    path,
    setPath,
    sourceMode,
    setSourceMode,
    ...localController,
    jobId: remoteController.jobId,
    result,
    startImport,
    selectRemotePath,
  };
}
