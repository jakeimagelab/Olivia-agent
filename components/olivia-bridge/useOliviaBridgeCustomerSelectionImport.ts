"use client";

import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";

import {
  useOliviaBridgeQualityAnalysis,
} from "@/components/olivia-bridge/useOliviaBridgeQualityAnalysis";
import {
  loadOliviaBridgeGallerySelection,
  loadOliviaBridgeSelectionSources,
  loadOliviaBridgeSharedProjectSelection,
} from "@/components/olivia-bridge/oliviaBridgeCustomerSelectionClient";
import type {
  GalleryCustomerSelectionResult,
  PersonSelectEventSummary,
  SelectGallerySummary,
} from "@/components/olivia-bridge/OliviaBridgeDialogs";
import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import { type CustomerSelectionComparisonFilter } from "@/lib/select-gallery/customerBridge";

type UseOliviaBridgeCustomerSelectionImportOptions = {
  hasActiveFolder: boolean;
  scanStatus: "idle" | "restoring" | "loading" | "ready" | "error";
  jpgs: readonly BridgeJpgFile[];
  folderPath: string;
  activeFolderName: string;
  remoteFolder: RemoteNasSelection | null;
  workspaceRef: RefObject<HTMLDivElement | null>;
};

export function useOliviaBridgeCustomerSelectionImport({
  hasActiveFolder,
  scanStatus,
  jpgs,
  folderPath,
  activeFolderName,
  remoteFolder,
  workspaceRef,
}: UseOliviaBridgeCustomerSelectionImportOptions) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [galleries, setGalleries] = useState<SelectGallerySummary[]>([]);
  const [sharedProjects, setSharedProjects] = useState<PersonSelectEventSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<GalleryCustomerSelectionResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [comparisonFilter, setComparisonFilter] = useState<CustomerSelectionComparisonFilter>("all");
  const {
    qualityByBridgeId,
    qualityJob,
    qualityMessage,
    installQualitySnapshot,
    installQualityError,
    startLinkedQualityAnalysis,
    controlLinkedQualityAnalysis,
  } = useOliviaBridgeQualityAnalysis({
    eventId: result?.personSelectEventId,
    match: result?.imageMatch ?? result?.match,
  });

  const bridgeFiles = useMemo(() => jpgs.map((photo) => ({
    id: photo.id,
    name: photo.name,
    relativeDirectory: photo.relativeDirectory,
  })), [jpgs]);

  const loadSelections = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sources = await loadOliviaBridgeSelectionSources();
      setGalleries(sources.galleries);
      setSharedProjects(sources.sharedProjects);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "사진선택 갤러리를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openImport = useCallback(() => {
    if (!hasActiveFolder || scanStatus !== "ready") return;
    setDialogOpen(true);
    setError("");
    void loadSelections();
  }, [hasActiveFolder, loadSelections, scanStatus]);

  const closeImport = useCallback(() => {
    setDialogOpen(false);
    setImportingId("");
    setError("");
    workspaceRef.current?.focus();
  }, [workspaceRef]);

  const chooseAnother = useCallback(() => {
    setResult(null);
    setComparisonFilter("all");
  }, []);

  const importGallery = useCallback(async (gallery: SelectGallerySummary) => {
    setImportingId(gallery.id);
    setError("");
    try {
      const imported = await loadOliviaBridgeGallerySelection({
        gallery,
        bridgeFiles,
        bridgeLink: remoteFolder ? {
          bridge_source: "remote",
          bridge_folder_path: remoteFolder.path,
          bridge_folder_display_path: remoteFolder.displayPath,
        } : {
          bridge_source: "local",
          bridge_folder_path: null,
          bridge_folder_display_path: activeFolderName,
        },
      });
      setSelectedIds(new Set(imported.match.matchedBridgeIds));
      setRatings(imported.match.ratingsByBridgeId);
      setNotes(imported.match.notesByBridgeId);
      setResult({
        gallery: imported.gallery,
        total: imported.submittedCount,
        match: imported.match,
      });
      setComparisonFilter("customer");
      try {
        localStorage.setItem(`olivia-bridge-gallery-folder:${gallery.id}`, JSON.stringify({
          source: remoteFolder ? "remote" : "local",
          displayPath: remoteFolder?.displayPath ?? activeFolderName,
        }));
      } catch (storageError) {
        if (process.env.NODE_ENV !== "production") console.debug("[olivia-bridge] gallery folder memory unavailable", storageError);
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "고객 셀렉을 불러오지 못했습니다.");
    } finally {
      setImportingId("");
    }
  }, [activeFolderName, bridgeFiles, remoteFolder]);

  const importSharedProject = useCallback(async (project: PersonSelectEventSummary) => {
    setImportingId(project.id);
    setError("");
    try {
      const imported = await loadOliviaBridgeSharedProjectSelection({ project, bridgeFiles });
      if (imported.qualityResponseOk && imported.quality.ok) {
        installQualitySnapshot(
          imported.quality.results ?? [],
          imported.quality.job ?? null,
          imported.result.imageMatch ?? imported.result.match,
        );
      } else {
        installQualityError(imported.quality.error || "AI 품질 결과를 불러오지 못했습니다.");
      }
      setSelectedIds(new Set(imported.result.match.matchedBridgeIds));
      setRatings(imported.result.match.ratingsByBridgeId);
      setNotes(imported.result.match.notesByBridgeId);
      setResult(imported.result);
      setComparisonFilter("customer");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "공유 프로젝트 셀렉을 불러오지 못했습니다.");
    } finally {
      setImportingId("");
    }
  }, [bridgeFiles, installQualityError, installQualitySnapshot]);

  useEffect(() => {
    setSelectedIds(new Set());
    setRatings({});
    setNotes({});
    setResult(null);
    setComparisonFilter("all");
  }, [folderPath]);

  return {
    gallerySelectDialogOpen: dialogOpen,
    selectGalleries: galleries,
    sharedSelectProjects: sharedProjects,
    selectGalleriesLoading: loading,
    gallerySelectImportingId: importingId,
    gallerySelectError: error,
    galleryCustomerResult: result,
    customerSelectedIds: selectedIds,
    customerRatings: ratings,
    customerNotes: notes,
    comparisonFilter,
    setComparisonFilter,
    qualityByBridgeId,
    qualityJob,
    qualityMessage,
    loadSelectGalleries: loadSelections,
    openGallerySelectImport: openImport,
    closeGallerySelectImport: closeImport,
    chooseAnotherGallerySelection: chooseAnother,
    importGalleryCustomerSelection: importGallery,
    importSharedProjectSelection: importSharedProject,
    startLinkedQualityAnalysis,
    controlLinkedQualityAnalysis,
  };
}
