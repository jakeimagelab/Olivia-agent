import {
  FINISHED_RAW_DIRECTORY,
  SELECTED_RAW_DIRECTORY,
} from "@/lib/photo-classifier/node/storageLayout";

function leafKey(name: string): string {
  return (name.split("/").pop() ?? name).normalize("NFC").toLocaleLowerCase("en-US");
}

export type MetadataRawOutputPlan = {
  destinationDirectory: typeof SELECTED_RAW_DIRECTORY | typeof FINISHED_RAW_DIRECTORY;
  copyFromRawNames: string[];
  moveFromRawNames: string[];
  alreadyFinishedNames: string[];
};

export type MetadataRawTransferMode = "copy" | "move";

function rawIdentityKey(name: string): string {
  return name.normalize("NFC").replaceAll("\\", "/").toLocaleLowerCase("en-US");
}

/**
 * 일반 작업은 사용자가 고른 방식으로 RAW 원본을 Selected_RAW에 복사 또는 이동한다.
 * 제외 작업은 방식 선택과 관계없이 RAW 작업본을 Finished_RAW로 이동한다. Finished_RAW에 이미
 * 있는 항목은 어느 모드에서도 다시 처리하지 않는다.
 */
export function planMetadataRawOutput({
  rawNames,
  excludeCompleted,
  transferMode,
  finishedRawNames,
}: {
  rawNames: string[];
  excludeCompleted: boolean;
  transferMode: MetadataRawTransferMode;
  finishedRawNames: string[];
}): MetadataRawOutputPlan {
  const finishedKeys = new Set(finishedRawNames.map(leafKey));
  const copyFromRawNames: string[] = [];
  const moveFromRawNames: string[] = [];
  const alreadyFinishedNames: string[] = [];

  const seenRawIdentities = new Set<string>();
  for (const rawName of rawNames) {
    const identity = rawIdentityKey(rawName);
    if (seenRawIdentities.has(identity)) continue;
    seenRawIdentities.add(identity);
    const key = leafKey(rawName);
    if (finishedKeys.has(key)) {
      alreadyFinishedNames.push(rawName);
    } else if (excludeCompleted) {
      moveFromRawNames.push(rawName);
    } else if (transferMode === "copy") {
      copyFromRawNames.push(rawName);
    } else {
      moveFromRawNames.push(rawName);
    }
  }

  return {
    destinationDirectory: excludeCompleted ? FINISHED_RAW_DIRECTORY : SELECTED_RAW_DIRECTORY,
    copyFromRawNames,
    moveFromRawNames,
    alreadyFinishedNames,
  };
}
