"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

import {
  useOliviaBridgeQualityAnalysis,
  type OliviaBridgeQualityResponse,
} from "@/components/olivia-bridge/useOliviaBridgeQualityAnalysis";
import type {
  GalleryCustomerSelectionResult,
  PersonSelectEventSummary,
  SelectGallerySummary,
} from "@/components/olivia-bridge/OliviaBridgeDialogs";
import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import {
  matchCustomerSelectionToBridgeFiles,
  type CustomerSelectionComparisonFilter,
  type CustomerSelectionMatchItem,
} from "@/lib/select-gallery/customerBridge";

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

  const bridgeFiles = useCallback(() => jpgs.map((photo) => ({
    id: photo.id,
    name: photo.name,
    relativeDirectory: photo.relativeDirectory,
  })), [jpgs]);

  const loadSelections = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [galleryResponse, projectResponse] = await Promise.all([
        fetch("/api/select-galleries", { cache: "no-store" }),
        fetch("/api/person-select", { cache: "no-store" }),
      ]);
      const galleryBody = await galleryResponse.json().catch(() => ({})) as {
        ok?: boolean;
        galleries?: SelectGallerySummary[];
        error?: string;
      };
      const projectBody = await projectResponse.json().catch(() => ({})) as {
        ok?: boolean;
        events?: PersonSelectEventSummary[];
        error?: string;
      };
      if (!galleryResponse.ok || !galleryBody.ok) throw new Error(galleryBody.error || "사진선택 갤러리를 불러오지 못했습니다.");
      if (!projectResponse.ok || !projectBody.ok) throw new Error(projectBody.error || "공유 프로젝트를 불러오지 못했습니다.");
      setGalleries(Array.isArray(galleryBody.galleries) ? galleryBody.galleries : []);
      setSharedProjects((Array.isArray(projectBody.events) ? projectBody.events : [])
        .filter((event) => event.access_mode === "project_shared"));
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
      const detailResponse = await fetch(`/api/select-galleries/${gallery.id}`, { cache: "no-store" });
      const detail = await detailResponse.json().catch(() => ({})) as {
        ok?: boolean;
        gallery?: SelectGallerySummary;
        images?: Array<{ id: string; original_file_name: string; relative_path?: string | null }>;
        selection?: { items?: Array<{ image_id: string; file_name: string; customer_rating?: number | null; memo?: string | null }> } | null;
        error?: string;
      };
      if (!detailResponse.ok || !detail.ok || !detail.gallery) throw new Error(detail.error || "갤러리 제출 결과를 불러오지 못했습니다.");
      const submittedItems = detail.selection?.items ?? [];
      if (!submittedItems.length) throw new Error("이 갤러리에 제출된 고객 셀렉이 없습니다.");
      const relativePathById = new Map((detail.images ?? []).map((image) => [image.id, image.relative_path ?? null]));
      const matchItems: CustomerSelectionMatchItem[] = submittedItems.map((item) => ({
        imageId: item.image_id,
        fileName: item.file_name,
        relativePath: relativePathById.get(item.image_id),
        rating: item.customer_rating,
        memo: item.memo,
      }));
      const match = matchCustomerSelectionToBridgeFiles(matchItems, bridgeFiles());
      const linkResponse = await fetch(`/api/select-galleries/${gallery.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remoteFolder ? {
          bridge_source: "remote",
          bridge_folder_path: remoteFolder.path,
          bridge_folder_display_path: remoteFolder.displayPath,
        } : {
          bridge_source: "local",
          bridge_folder_path: null,
          bridge_folder_display_path: activeFolderName,
        }),
      });
      const linked = await linkResponse.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!linkResponse.ok || !linked.ok) throw new Error(linked.error || "갤러리와 현재 폴더를 연결하지 못했습니다.");

      setSelectedIds(new Set(match.matchedBridgeIds));
      setRatings(match.ratingsByBridgeId);
      setNotes(match.notesByBridgeId);
      setResult({ gallery: detail.gallery, total: submittedItems.length, match });
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
      const response = await fetch(`/api/person-select/${project.id}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean;
        event?: { id: string; title: string; status: string };
        shared?: {
          images?: Array<{ id: string; original_file_name: string; relative_path?: string | null }>;
          selection?: { submitted_at?: string | null; items?: Array<{ image_id: string; customer_rating?: number | null; memo?: string | null; image?: { original_file_name: string; source_rel_path?: string | null } | null }> } | null;
        };
        error?: string;
      };
      if (!response.ok || !body.ok || !body.event) throw new Error(body.error || "공유 프로젝트 셀렉을 불러오지 못했습니다.");
      const selection = body.shared?.selection;
      const submittedItems = selection?.items ?? [];
      if (!selection?.submitted_at || !submittedItems.length) throw new Error("이 공유 프로젝트에 제출된 고객 셀렉이 없습니다.");
      const matchItems: CustomerSelectionMatchItem[] = submittedItems.flatMap((item) => item.image ? [{
        imageId: item.image_id,
        fileName: item.image.original_file_name,
        relativePath: item.image.source_rel_path ?? null,
        rating: item.customer_rating,
        memo: item.memo,
      }] : []);
      const currentBridgeFiles = bridgeFiles();
      const match = matchCustomerSelectionToBridgeFiles(matchItems, currentBridgeFiles);
      const imageMatch = matchCustomerSelectionToBridgeFiles((body.shared?.images ?? []).map((image) => ({
        imageId: image.id,
        fileName: image.original_file_name,
        relativePath: image.relative_path ?? null,
      })), currentBridgeFiles);
      const qualityResponse = await fetch(`/api/person-select/${project.id}/quality`, { cache: "no-store" });
      const qualityBody = await qualityResponse.json().catch(() => ({})) as OliviaBridgeQualityResponse;
      if (qualityResponse.ok && qualityBody.ok) {
        installQualitySnapshot(qualityBody.results ?? [], qualityBody.job ?? null, imageMatch);
      } else {
        installQualityError(qualityBody.error || "AI 품질 결과를 불러오지 못했습니다.");
      }
      setSelectedIds(new Set(match.matchedBridgeIds));
      setRatings(match.ratingsByBridgeId);
      setNotes(match.notesByBridgeId);
      setResult({
        gallery: {
          id: body.event.id,
          title: body.event.title,
          status: body.event.status,
          selected_count: submittedItems.length,
          submitted_at: selection.submitted_at,
        },
        total: submittedItems.length,
        match,
        imageMatch,
        personSelectEventId: project.id,
      });
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
