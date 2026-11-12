import {
  buildFieldScenesFromBridgePlan,
  validateBridgeClassificationPlan,
  type BridgeClassificationPlan,
} from "@/lib/photo-bridge/classificationPlan";
import {
  isSameDirectoryHandle,
  splitRawAndJpg,
  type SplitRawFile,
} from "@/lib/photo-classifier/browserFileOps";
import { loadThumb, mapWithConcurrency } from "@/lib/photo-classifier/browserProcessing";
import type { FieldScene, FieldStats } from "@/lib/photo-classifier/types";

export type PreparedBridgeClassificationPlan = {
  rawFiles: SplitRawFile[];
  scenes: FieldScene[];
  stats: FieldStats;
  copyLog: string[];
  summary: { sceneCount: number; jpgCount: number; reviewCount: number };
};

export async function prepareBridgeClassificationPlan({
  currentLocalFolder,
  plan,
  loadThumbnail = async (handle) => loadThumb(await handle.getFile(), 160),
}: {
  currentLocalFolder: FileSystemDirectoryHandle | null;
  plan: BridgeClassificationPlan;
  loadThumbnail?: (handle: FileSystemFileHandle) => Promise<string | null>;
}): Promise<PreparedBridgeClassificationPlan> {
  const [sameFolder, { rawFiles, jpgFiles }] = await Promise.all([
    isSameDirectoryHandle(currentLocalFolder, plan.directory),
    splitRawAndJpg(plan.directory),
  ]);
  const validation = validateBridgeClassificationPlan(plan, {
    sameFolder,
    folderName: plan.directory.name,
    jpgs: jpgFiles.map((entry) => ({
      name: entry.name,
      size: entry.fileSize,
      lastModified: entry.mtime,
    })),
  });
  if (!validation.ok) throw new Error(validation.message);

  const scenes = buildFieldScenesFromBridgePlan(plan);
  await mapWithConcurrency(scenes, 3, async (scene) => {
    const thumbnailIndexes = Array.from(new Set([0, scene.files.length - 1]));
    await Promise.all(thumbnailIndexes.map(async (index) => {
      const file = scene.files[index];
      if (!file) return;
      try {
        file.thumbUrl = await loadThumbnail(file.handle);
      } catch (error) {
        console.error("[olivia-bridge] Failed to build classification thumbnail", error);
      }
    }));
    return scene;
  });

  const reviewCount = plan.boundaries.filter((decision) => decision.needsReview).length;
  return {
    rawFiles,
    scenes,
    stats: {
      totalJpg: plan.files.length,
      totalRaw: rawFiles.length,
      totalScenes: scenes.length,
      totalSubScenes: 0,
      totalProfile: 0,
      totalQualityReject: 0,
      selectedJpg: 0,
      selectedRawMoved: 0,
      rawMissing: 0,
    },
    copyLog: [
      `✅ Bridge 계획 적용 완료 — JPG ${plan.files.length}장 / RAW ${rawFiles.length}개 / Scene ${scenes.length}개`,
      `🧭 경계 확인 필요 ${reviewCount}곳`,
      "🔒 승인 전 파일 이동 없음 — Scene 검토 후 폴더 정리를 실행하세요",
    ],
    summary: {
      sceneCount: scenes.length,
      jpgCount: plan.files.length,
      reviewCount,
    },
  };
}
