"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { buildQuickProposals } from "@/lib/photo-classifier/browserProcessing";
import type { FieldFolderScanEntry } from "@/lib/photo-classifier/fieldFolderAnalysis";
import {
  adjustGranularity,
  applyOverrides,
  DEFAULT_WEIGHT_PROFILE,
  type ClassificationOverrides,
  type SceneProposal,
  type SceneWeightProfile,
} from "@/lib/photo-classifier/pattern-analysis";

type OverrideResponse = {
  ok?: boolean;
  error?: string;
  overrides?: ClassificationOverrides;
  granularity?: "coarser" | "finer" | string;
};

export function usePhotoSortingNaturalLanguage({
  weightProfile,
  setWeightProfile,
  scanEntriesRef,
  setSceneProposals,
  gapMinutes,
  step,
  startClassification,
}: {
  weightProfile: SceneWeightProfile | null;
  setWeightProfile: Dispatch<SetStateAction<SceneWeightProfile | null>>;
  scanEntriesRef: MutableRefObject<FieldFolderScanEntry[]>;
  setSceneProposals: Dispatch<SetStateAction<SceneProposal[]>>;
  gapMinutes: number;
  step: number;
  startClassification: () => Promise<void>;
}) {
  const [refining, setRefining] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const submitRequest = useCallback(async (message: string) => {
    setRefining(true);
    try {
      const response = await fetch("/api/photo-classification-nl-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          context: history.length ? history.join(" / ") : undefined,
        }),
      });
      const data = await response.json() as OverrideResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "요청을 이해하지 못했습니다.");
      }

      const base = weightProfile ?? DEFAULT_WEIGHT_PROFILE;
      let next = applyOverrides(base, data.overrides ?? {});
      if (data.granularity === "coarser" || data.granularity === "finer") {
        next = adjustGranularity(next, data.granularity);
      }
      setWeightProfile(next);
      setHistory((current) => [...current, message]);
      if (scanEntriesRef.current.length) {
        setSceneProposals(await buildQuickProposals(
          scanEntriesRef.current,
          next.absoluteTimeGapMinutes ?? gapMinutes,
        ));
      }
      if (step >= 1) await startClassification();
    } catch (error) {
      console.error("[ai-nl-override]", error);
    } finally {
      setRefining(false);
    }
  }, [
    gapMinutes,
    history,
    scanEntriesRef,
    setSceneProposals,
    setWeightProfile,
    startClassification,
    step,
    weightProfile,
  ]);

  return { refining, history, submitRequest };
}
