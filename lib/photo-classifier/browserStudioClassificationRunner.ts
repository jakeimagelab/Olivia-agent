import { splitRawAndJpg } from "./browserFileOps";
import {
  analyzeStudioConcepts,
  analyzeStudioGapLighting,
  analyzeStudioPeople,
  groupStudioFilesByGap,
} from "./studioClassificationAnalysis";
import { executeStudioOutput } from "./studioOutput";
import { prepareStudioPhotoFiles } from "./studioScanning";
import {
  buildStudioConceptReportBundle,
  buildStudioPersonReportBundle,
} from "./studioReports";
import type {
  LightingSensitivity,
  PersonGroup,
  StudioGroup,
  StudioGroupSortMode,
  StudioPhotoFile,
  StudioStats,
  StudioSubMode,
} from "./studioGrouping";

export type BrowserStudioProgress = {
  cur: number;
  total: number;
  msg: string;
};

export type BrowserStudioClassificationResult = {
  files: StudioPhotoFile[];
  personGroups: PersonGroup[];
  conceptGroups: StudioGroup[];
  rawCount: number;
  total: number;
};

type ClassificationDependencies = {
  splitFiles: typeof splitRawAndJpg;
  prepareFiles: typeof prepareStudioPhotoFiles;
  analyzeGapLighting: typeof analyzeStudioGapLighting;
  analyzePeople: typeof analyzeStudioPeople;
  analyzeConcepts: typeof analyzeStudioConcepts;
};

const DEFAULT_CLASSIFICATION_DEPENDENCIES: ClassificationDependencies = {
  splitFiles: splitRawAndJpg,
  prepareFiles: prepareStudioPhotoFiles,
  analyzeGapLighting: analyzeStudioGapLighting,
  analyzePeople: analyzeStudioPeople,
  analyzeConcepts: analyzeStudioConcepts,
};

export async function runBrowserStudioClassification({
  rootDirectory,
  subMode,
  groupSortMode,
  gapMinutes,
  lightingSensitivity,
  onProgress,
  onFilesScanned,
  onFilesChange,
  dependencies,
}: {
  rootDirectory: FileSystemDirectoryHandle;
  subMode: StudioSubMode;
  groupSortMode: StudioGroupSortMode;
  gapMinutes: number;
  lightingSensitivity: LightingSensitivity;
  onProgress?: (progress: BrowserStudioProgress) => void;
  onFilesScanned?: (files: StudioPhotoFile[], rawCount: number) => void;
  onFilesChange?: (files: StudioPhotoFile[]) => void;
  dependencies?: Partial<ClassificationDependencies>;
}): Promise<BrowserStudioClassificationResult> {
  const runtime = { ...DEFAULT_CLASSIFICATION_DEPENDENCIES, ...dependencies };
  onProgress?.({ cur: 0, total: 0, msg: "폴더 스캔 중..." });
  const { rawFiles, jpgFiles } = await runtime.splitFiles(rootDirectory);
  const total = jpgFiles.length;
  const files = await runtime.prepareFiles(jpgFiles, {
    onProgress: ({ completed, total: scanTotal, fileName }) => {
      onProgress?.({ cur: completed, total: scanTotal, msg: `스캔: ${fileName}` });
    },
  });
  onFilesScanned?.(files, rawFiles.length);
  onProgress?.({ cur: total, total, msg: `파일 분류 완료 — JPG ${total}장 / RAW ${rawFiles.length}개` });

  if (subMode === "group" && groupSortMode === "gap") {
    const result = groupStudioFilesByGap(files, gapMinutes);
    return { files: result.files, personGroups: result.personGroups, conceptGroups: [], rawCount: rawFiles.length, total };
  }

  if (subMode === "group" && groupSortMode === "gap_ai") {
    const result = await runtime.analyzeGapLighting({
      files,
      gapMinutes,
      lightingSensitivity,
      onStart: ({ completed, total: analysisTotal, fileName }) => {
        onProgress?.({ cur: completed, total: analysisTotal, msg: `AI 조명 검사: ${fileName}` });
      },
      onProgress: onFilesChange,
    });
    return { files: result.files, personGroups: result.personGroups, conceptGroups: [], rawCount: rawFiles.length, total };
  }

  if (subMode === "group") {
    const result = await runtime.analyzePeople({
      files,
      lightingSensitivity,
      onStart: ({ completed, total: analysisTotal, fileName }) => {
        onProgress?.({ cur: completed, total: analysisTotal, msg: `얼굴 분석: ${fileName}` });
      },
      onProgress: onFilesChange,
    });
    return { files: result.files, personGroups: result.personGroups, conceptGroups: [], rawCount: rawFiles.length, total };
  }

  const result = await runtime.analyzeConcepts({
    files,
    lightingSensitivity,
    onStart: ({ completed, total: analysisTotal, fileName }) => {
      onProgress?.({ cur: completed, total: analysisTotal, msg: `AI 분석: ${fileName}` });
    },
    onProgress: onFilesChange,
  });
  return { files: result.files, personGroups: [], conceptGroups: result.groups, rawCount: rawFiles.length, total };
}

type OutputDependencies = {
  executeOutput: typeof executeStudioOutput;
};

export async function runBrowserStudioOutput({
  rootDirectory,
  subMode,
  personGroups,
  conceptGroups,
  totalJpg,
  totalRaw,
  fileMode,
  isCancelled,
  onProgress,
  onLog,
  dependencies,
}: {
  rootDirectory: FileSystemDirectoryHandle;
  subMode: StudioSubMode;
  personGroups: PersonGroup[];
  conceptGroups: StudioGroup[];
  totalJpg: number;
  totalRaw: number;
  fileMode: "copy" | "move";
  isCancelled: () => boolean;
  onProgress?: (progress: BrowserStudioProgress) => void;
  onLog?: (log: string[]) => void;
  dependencies?: Partial<OutputDependencies>;
}): Promise<StudioStats> {
  const executeOutput = dependencies?.executeOutput ?? executeStudioOutput;
  const personMode = subMode === "group";
  const reports = personMode
    ? buildStudioPersonReportBundle(personGroups, { totalJpg, totalRaw, rootName: rootDirectory.name })
    : buildStudioConceptReportBundle(conceptGroups, { totalJpg, totalRaw, rootName: rootDirectory.name });
  const groups = personMode
    ? personGroups.map((group) => ({ folderName: group.editedFolderName, files: group.files }))
    : conceptGroups.map((group) => ({ folderName: group.editedFolderName || group.suggestedFolderName, files: group.files }));

  await executeOutput({
    rootDirectory,
    groups,
    reports: reports.files,
    mode: fileMode,
    isCancelled,
    onProgress: ({ completed, total, message }) => onProgress?.({ cur: completed, total, msg: message }),
    onLog,
  });
  return reports.stats;
}
