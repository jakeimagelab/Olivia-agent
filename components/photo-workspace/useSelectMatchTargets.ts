"use client";

import { useEffect, useMemo, useState } from "react";

import type { SelectMatchFolderGroup } from "@/lib/selectMatch/folderScanner";
import {
  isCaptureMatchTargetCountConsistent,
  resolveCaptureMatchJpgSources,
  type CaptureMatchPreflight,
  type JpgMatchSource,
} from "@/lib/selectMatch/captureMatch";
import {
  DEFAULT_RAW_MATCH_CRITERIA,
  normalizeRawMatchCriteria,
  resolveRawMatchTargets,
  type RawMatchCriteria,
} from "@/lib/photo-bridge/rawMatchDelivery";

export function useSelectMatchTargets({
  bridgeLinked,
  folderKey,
  selectedJpgNames,
  jpgRatingsByName,
  jpgColorLabelsByName,
  selected,
  scenes,
  preflight,
}: {
  bridgeLinked: boolean;
  folderKey: string;
  selectedJpgNames: readonly string[];
  jpgRatingsByName: Readonly<Record<string, number>>;
  jpgColorLabelsByName: Readonly<Record<string, number>>;
  selected: ReadonlySet<string>;
  scenes: readonly SelectMatchFolderGroup[];
  preflight: CaptureMatchPreflight | null;
}) {
  const [rawMatchCriteria, setRawMatchCriteria] = useState<RawMatchCriteria>(DEFAULT_RAW_MATCH_CRITERIA);
  const [criteriaReady, setCriteriaReady] = useState(!bridgeLinked);
  const criteriaStorageKey = `olivia-raw-match-criteria:${folderKey || "current-folder"}`;

  const resolvedBridgeTargets = useMemo(() => resolveRawMatchTargets({
    names: selectedJpgNames,
    ratingsByName: jpgRatingsByName,
    colorsByName: jpgColorLabelsByName,
    criteria: rawMatchCriteria,
  }), [jpgColorLabelsByName, jpgRatingsByName, rawMatchCriteria, selectedJpgNames]);

  const authoritativeMatchTargets = useMemo(
    () => bridgeLinked ? new Set(resolvedBridgeTargets) : new Set(selected),
    [bridgeLinked, resolvedBridgeTargets, selected],
  );

  const scannedJpgSources = useMemo<JpgMatchSource[]>(() => scenes.flatMap((scene) => (
    scene.photos.map((photo) => ({
      id: photo.relativePath.normalize("NFC"),
      name: photo.name,
      basename: photo.basename.normalize("NFC").toLocaleLowerCase("en-US"),
      relativePath: photo.relativePath,
      handle: photo.handle,
      thumbUrl: photo.thumbUrl,
    }))
  )), [scenes]);

  const selectedJpgSources = useMemo(() => resolveCaptureMatchJpgSources({
    targetBasenames: authoritativeMatchTargets,
    sources: scannedJpgSources,
  }), [authoritativeMatchTargets, scannedJpgSources]);

  const missingMatchTargetBasenames = useMemo(() => {
    const sourceBasenames = new Set(selectedJpgSources.map((source) => source.basename));
    return Array.from(authoritativeMatchTargets).filter((basename) => !sourceBasenames.has(basename));
  }, [authoritativeMatchTargets, selectedJpgSources]);

  const expectedMatchTargetCount = selectedJpgSources.length + missingMatchTargetBasenames.length;
  const preflightTargetCountMatches = preflight
    ? missingMatchTargetBasenames.length === 0
      && isCaptureMatchTargetCountConsistent(selectedJpgSources.length, preflight)
    : false;

  useEffect(() => {
    if (!bridgeLinked) return;
    setCriteriaReady(false);
    try {
      setRawMatchCriteria(normalizeRawMatchCriteria(JSON.parse(localStorage.getItem(criteriaStorageKey) ?? "null")));
    } catch {
      setRawMatchCriteria({
        ...DEFAULT_RAW_MATCH_CRITERIA,
        colorLabels: [...DEFAULT_RAW_MATCH_CRITERIA.colorLabels],
      });
    } finally {
      setCriteriaReady(true);
    }
  }, [bridgeLinked, criteriaStorageKey]);

  useEffect(() => {
    if (!bridgeLinked || !criteriaReady) return;
    try {
      localStorage.setItem(criteriaStorageKey, JSON.stringify(rawMatchCriteria));
    } catch {
      // 저장소가 막혀 있어도 현재 세션의 기준 선택은 유지한다.
    }
  }, [bridgeLinked, criteriaReady, criteriaStorageKey, rawMatchCriteria]);

  return {
    rawMatchCriteria,
    setRawMatchCriteria,
    criteriaReady,
    resolvedBridgeTargets,
    authoritativeMatchTargets,
    selectedJpgSources,
    missingMatchTargetBasenames,
    expectedMatchTargetCount,
    preflightTargetCountMatches,
  };
}
