import { buildFieldScenesFromBoundaries, buildSceneRangesFromBoundaries } from "@/lib/photo-classifier/scene-builder";
import type { FieldScene, SceneFile } from "@/lib/photo-classifier/types";
import type { SceneBoundaryDecision } from "@/lib/photo-classifier/hybrid-types";
import type {
  BridgeAnalyzedJpgFile,
  BridgeScene,
  BridgeSceneAnalysis,
} from "@/lib/photo-bridge/bridgeFiles";

export const BRIDGE_CLASSIFICATION_PLAN_VERSION = 1 as const;

export type BridgeClassificationPlan = {
  version: typeof BRIDGE_CLASSIFICATION_PLAN_VERSION;
  id: string;
  createdAt: string;
  folderKey: string;
  folderName: string;
  directory: FileSystemDirectoryHandle;
  files: BridgeAnalyzedJpgFile[];
  boundaries: SceneBoundaryDecision[];
  scenes: BridgeScene[];
};

export type BridgeClassificationFileSnapshot = {
  name: string;
  size: number;
  lastModified: number;
};

export type BridgeClassificationPlanValidation =
  | { ok: true }
  | { ok: false; message: string };

function normalizedFileName(name: string) {
  return name.normalize("NFC");
}

function generatedPlanId(analysis: BridgeSceneAnalysis) {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const first = analysis.files[0]?.name ?? "empty";
  return `${Date.now()}-${first}-${analysis.files.length}`;
}

export function createBridgeClassificationPlan(input: {
  folderKey: string;
  folderName: string;
  directory: FileSystemDirectoryHandle;
  analysis: BridgeSceneAnalysis;
  id?: string;
  createdAt?: string;
}): BridgeClassificationPlan {
  const plan: BridgeClassificationPlan = {
    version: BRIDGE_CLASSIFICATION_PLAN_VERSION,
    id: input.id ?? generatedPlanId(input.analysis),
    createdAt: input.createdAt ?? new Date().toISOString(),
    folderKey: input.folderKey,
    folderName: input.folderName,
    directory: input.directory,
    files: [...input.analysis.files],
    boundaries: [...input.analysis.boundaries],
    scenes: input.analysis.scenes.map((scene) => ({ ...scene })),
  };
  const validation = validateBridgeClassificationPlan(plan, {
    sameFolder: true,
    folderName: input.folderName,
    jpgs: input.analysis.files,
  });
  if (!validation.ok) throw new Error(validation.message);
  return plan;
}

export function validateBridgeClassificationPlan(
  plan: BridgeClassificationPlan,
  current: {
    sameFolder: boolean;
    folderName: string;
    jpgs: readonly BridgeClassificationFileSnapshot[];
  },
): BridgeClassificationPlanValidation {
  if (plan.version !== BRIDGE_CLASSIFICATION_PLAN_VERSION) {
    return { ok: false, message: "지원하지 않는 Bridge Scene 계획입니다. 현재 폴더를 다시 분석해 주세요." };
  }
  if (!current.sameFolder || current.folderName !== plan.folderName) {
    return { ok: false, message: "Bridge에서 분석한 폴더와 현재 폴더가 다릅니다. 현재 폴더를 다시 분석해 주세요." };
  }
  if (plan.files.length === 0 || plan.scenes.length === 0) {
    return { ok: false, message: "적용할 JPG 또는 Scene이 없습니다. JPG가 있는 폴더를 다시 분석해 주세요." };
  }

  const currentByName = new Map(current.jpgs.map((file) => [normalizedFileName(file.name), file]));
  if (currentByName.size !== plan.files.length || current.jpgs.length !== plan.files.length) {
    return { ok: false, message: "Bridge 분석 뒤 JPG가 추가되거나 삭제되었습니다. 현재 폴더를 다시 분석해 주세요." };
  }
  for (const planned of plan.files) {
    const found = currentByName.get(normalizedFileName(planned.name));
    if (!found) {
      return { ok: false, message: `${planned.name} 파일을 찾을 수 없습니다. 현재 폴더를 다시 분석해 주세요.` };
    }
    if (found.size !== planned.size || found.lastModified !== planned.lastModified) {
      return { ok: false, message: `${planned.name} 파일이 분석 뒤 변경되었습니다. 현재 폴더를 다시 분석해 주세요.` };
    }
  }

  let nextStart = 0;
  for (const scene of plan.scenes) {
    if (
      scene.startIndex !== nextStart
      || scene.endIndex <= scene.startIndex
      || scene.endIndex > plan.files.length
      || scene.fileCount !== scene.endIndex - scene.startIndex
    ) {
      return { ok: false, message: "Bridge Scene 범위가 올바르지 않습니다. 현재 폴더를 다시 분석해 주세요." };
    }
    nextStart = scene.endIndex;
  }
  if (nextStart !== plan.files.length) {
    return { ok: false, message: "Bridge Scene 계획이 JPG 전체를 포함하지 않습니다. 현재 폴더를 다시 분석해 주세요." };
  }

  const calculatedRanges = buildSceneRangesFromBoundaries(plan.files.length, plan.boundaries);
  if (
    calculatedRanges.length !== plan.scenes.length
    || calculatedRanges.some((range, index) => (
      range.startIndex !== plan.scenes[index].startIndex
      || range.endIndex !== plan.scenes[index].endIndex
    ))
  ) {
    return { ok: false, message: "Bridge Scene 경계와 표시 계획이 일치하지 않습니다. 현재 폴더를 다시 분석해 주세요." };
  }
  return { ok: true };
}

export function buildFieldScenesFromBridgePlan(plan: BridgeClassificationPlan): FieldScene[] {
  const files: SceneFile[] = plan.files.map((entry) => ({
    name: entry.name,
    basename: entry.name.replace(/\.[^.]+$/, ""),
    handle: entry.handle,
    mtime: entry.mtime,
    timestampSource: entry.timestampSource,
    thumbUrl: null,
    visualFeatures: entry.visualFeatures,
  }));
  const scenes = buildFieldScenesFromBoundaries(files, plan.boundaries);
  if (
    scenes.length !== plan.scenes.length
    || scenes.some((scene, index) => (
      scene.fileCount !== plan.scenes[index].fileCount
      || scene.files[0]?.name !== plan.scenes[index].firstFileName
      || scene.files.at(-1)?.name !== plan.scenes[index].lastFileName
    ))
  ) {
    throw new Error("Bridge Scene 계획을 사진 분류 형식으로 변환하지 못했습니다. 현재 폴더를 다시 분석해 주세요.");
  }
  return scenes;
}
