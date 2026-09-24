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

/**
 * 일반 작업은 RAW 원본을 Selected_RAW로 복사한다. 제외 작업은 사용자가 고른 RAW 작업본을
 * Finished_RAW로 이동한다. Finished_RAW에 이미 있는 항목은 어느 모드에서도 다시 처리하지 않는다.
 */
export function planMetadataRawOutput({
  rawNames,
  excludeCompleted,
  finishedRawNames,
}: {
  rawNames: string[];
  excludeCompleted: boolean;
  finishedRawNames: string[];
}): MetadataRawOutputPlan {
  const finishedKeys = new Set(finishedRawNames.map(leafKey));
  const copyFromRawNames: string[] = [];
  const moveFromRawNames: string[] = [];
  const alreadyFinishedNames: string[] = [];

  for (const rawName of rawNames) {
    const key = leafKey(rawName);
    if (finishedKeys.has(key)) {
      alreadyFinishedNames.push(rawName);
    } else if (excludeCompleted) {
      moveFromRawNames.push(rawName);
    } else {
      copyFromRawNames.push(rawName);
    }
  }

  return {
    destinationDirectory: excludeCompleted ? FINISHED_RAW_DIRECTORY : SELECTED_RAW_DIRECTORY,
    copyFromRawNames,
    moveFromRawNames,
    alreadyFinishedNames,
  };
}
