import { getStudioThumb } from "./browserProcessing";
import { withTimeout } from "./browserFileOps";
import {
  assignStudioPersonGroups,
  buildPersonGroups,
  buildStudioGroups,
  computeClothingLabel,
  computeGroupKey,
  groupStudioPhotosByTimeGap,
  normalizePersonFeatures,
  type LightingSensitivity,
  type PersonGroup,
  type StudioGroup,
  type StudioInnerWear,
  type StudioLightingStatus,
  type StudioPhotoFile,
  type StudioPoseType,
} from "./studioGrouping";
import { runStudioAnalysisConcurrently } from "./studioAnalysisRunner";

type StudioAnalysisProgress = {
  completed: number;
  total: number;
  fileName: string;
};

type StudioAiResponse = Record<string, unknown> & {
  ok?: boolean;
  lightingStatus?: StudioLightingStatus;
};

async function requestFaceAnalysis(
  file: StudioPhotoFile,
  lightingSensitivity: LightingSensitivity,
  lightingOnly = false,
): Promise<StudioAiResponse> {
  const source = await file.handle.getFile();
  const thumbnail = await getStudioThumb(source);
  const response = await fetch("/api/studio-face-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thumbnail, lightingSensitivity, ...(lightingOnly ? { lightingOnly: true } : {}) }),
  });
  return response.json() as Promise<StudioAiResponse>;
}

async function requestConceptAnalysis(
  file: StudioPhotoFile,
  lightingSensitivity: LightingSensitivity,
): Promise<StudioAiResponse> {
  return withTimeout((async () => {
    const source = await file.handle.getFile();
    const thumbnail = await getStudioThumb(source);
    const response = await fetch("/api/studio-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thumbnail, lightingSensitivity }),
    });
    return response.json() as Promise<StudioAiResponse>;
  })(), 45_000, "AI 분석");
}

export function groupStudioFilesByGap(
  files: StudioPhotoFile[],
  gapMinutes: number,
): { files: StudioPhotoFile[]; personGroups: PersonGroup[] } {
  const grouped = groupStudioPhotosByTimeGap(files, gapMinutes, { markAnalyzed: true });
  return { files: grouped, personGroups: buildPersonGroups(grouped) };
}

export async function analyzeStudioGapLighting({
  files,
  gapMinutes,
  lightingSensitivity,
  onStart,
  onProgress,
  analyze = (file) => requestFaceAnalysis(file, lightingSensitivity, true),
}: {
  files: StudioPhotoFile[];
  gapMinutes: number;
  lightingSensitivity: LightingSensitivity;
  onStart?: (progress: StudioAnalysisProgress) => void;
  onProgress?: (files: StudioPhotoFile[]) => void;
  analyze?: (file: StudioPhotoFile) => Promise<StudioAiResponse>;
}): Promise<{ files: StudioPhotoFile[]; personGroups: PersonGroup[] }> {
  const withGap = groupStudioPhotosByTimeGap(files, gapMinutes);
  const targetIndices = withGap.flatMap((file, index) => file.groupKey === "__ETC__" ? [] : [index]);
  const analyzed = await runStudioAnalysisConcurrently({
    items: withGap,
    targetIndices,
    concurrency: 6,
    analyze: async (file) => {
      const data = await analyze(file);
      return data.ok && data.lightingStatus !== "normal"
        ? { ...file, analyzed: true, lightingStatus: data.lightingStatus ?? "etc_test", groupKey: "__ETC__" }
        : { ...file, analyzed: true };
    },
    recover: (_error, file) => ({ ...file, analyzed: true }),
    onStart: ({ completed, total, item }) => onStart?.({ completed, total, fileName: item.name }),
    onProgress: ({ items }) => onProgress?.(items),
  });
  return { files: analyzed, personGroups: buildPersonGroups(analyzed) };
}

export async function analyzeStudioConcepts({
  files,
  lightingSensitivity,
  onStart,
  onProgress,
  analyze = (file) => requestConceptAnalysis(file, lightingSensitivity),
}: {
  files: StudioPhotoFile[];
  lightingSensitivity: LightingSensitivity;
  onStart?: (progress: StudioAnalysisProgress) => void;
  onProgress?: (files: StudioPhotoFile[]) => void;
  analyze?: (file: StudioPhotoFile) => Promise<StudioAiResponse>;
}): Promise<{ files: StudioPhotoFile[]; groups: StudioGroup[] }> {
  const analyzed = await runStudioAnalysisConcurrently({
    items: files,
    concurrency: 8,
    analyze: async (file) => {
      const data = await analyze(file);
      if (!data.ok) return { ...file, analyzed: true, lightingStatus: "etc_test" as const, groupKey: "__ETC__" };
      const isEtc = data.lightingStatus !== "normal";
      const hasGown = data.hasGown === true;
      const innerWearValues: StudioInnerWear[] = ["셔츠", "넥타이셔츠", "스크럽", "블라우스", "탑", "기타"];
      const innerWear = innerWearValues.includes(data.innerWear as StudioInnerWear)
        ? data.innerWear as StudioInnerWear
        : "기타";
      const poseValues: StudioPoseType[] = ["Standing", "Sitting", "Unknown"];
      const poseType = poseValues.includes(data.poseType as StudioPoseType)
        ? data.poseType as StudioPoseType
        : "Unknown";
      const isFamilyProfile = data.isFamilyProfile === true;
      const clothingLabel = computeClothingLabel(hasGown, innerWear, isFamilyProfile);
      const groupKey = isEtc ? "__ETC__" : computeGroupKey(hasGown, innerWear, poseType, isFamilyProfile);
      return {
        ...file,
        lightingStatus: data.lightingStatus ?? "normal",
        hasGown,
        innerWear,
        clothingLabel,
        poseType,
        isFamilyProfile,
        confidence: typeof data.confidence === "number" ? data.confidence : 0.5,
        analyzed: true,
        groupKey,
      };
    },
    recover: (_error, file) => ({ ...file, analyzed: true, lightingStatus: "etc_test" as const, groupKey: "__ETC__" }),
    onStart: ({ completed, total, item }) => onStart?.({ completed, total, fileName: item.name }),
    onProgress: ({ items }) => onProgress?.(items),
  });
  return { files: analyzed, groups: buildStudioGroups(analyzed) };
}

export async function analyzeStudioPeople({
  files,
  lightingSensitivity,
  onStart,
  onProgress,
  analyze = (file) => withTimeout(requestFaceAnalysis(file, lightingSensitivity), 45_000, "얼굴 분석"),
}: {
  files: StudioPhotoFile[];
  lightingSensitivity: LightingSensitivity;
  onStart?: (progress: StudioAnalysisProgress) => void;
  onProgress?: (files: StudioPhotoFile[]) => void;
  analyze?: (file: StudioPhotoFile) => Promise<StudioAiResponse>;
}): Promise<{ files: StudioPhotoFile[]; personGroups: PersonGroup[] }> {
  const analyzed = await runStudioAnalysisConcurrently({
    items: files,
    concurrency: 8,
    analyze: async (file) => {
      const data = await analyze(file);
      if (data.ok && data.lightingStatus === "normal") {
        return {
          ...file,
          lightingStatus: "normal" as const,
          personFeatures: normalizePersonFeatures(data),
          analyzed: true,
          groupKey: "PENDING",
        };
      }
      return {
        ...file,
        analyzed: true,
        lightingStatus: data.lightingStatus ?? "etc_test",
        groupKey: "__ETC__",
      };
    },
    recover: (_error, file) => ({ ...file, analyzed: true, lightingStatus: "etc_test" as const, groupKey: "__ETC__" }),
    onStart: ({ completed, total, item }) => onStart?.({ completed, total, fileName: item.name }),
    onProgress: ({ items }) => onProgress?.(items),
  });
  const grouped = assignStudioPersonGroups(analyzed);
  return { files: grouped, personGroups: buildPersonGroups(grouped) };
}
