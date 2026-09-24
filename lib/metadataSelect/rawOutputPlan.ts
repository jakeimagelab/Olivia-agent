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
  moveFromSelectedNames: string[];
  alreadyFinishedNames: string[];
};

/**
 * 일반 작업은 Finished_RAW에 있는 항목을 다시 Selected_RAW로 넣지 않는다. 제외 작업은
 * Selected_RAW 복사본을 우선 이동하고, 아직 복사되지 않은 RAW만 원본에서 복사한다.
 */
export function planMetadataRawOutput({
  rawNames,
  excludeCompleted,
  selectedRawNames,
  finishedRawNames,
}: {
  rawNames: string[];
  excludeCompleted: boolean;
  selectedRawNames: string[];
  finishedRawNames: string[];
}): MetadataRawOutputPlan {
  const selectedKeys = new Set(selectedRawNames.map(leafKey));
  const finishedKeys = new Set(finishedRawNames.map(leafKey));
  const copyFromRawNames: string[] = [];
  const moveFromSelectedNames: string[] = [];
  const alreadyFinishedNames: string[] = [];

  for (const rawName of rawNames) {
    const key = leafKey(rawName);
    if (finishedKeys.has(key)) {
      alreadyFinishedNames.push(rawName);
    } else if (excludeCompleted && selectedKeys.has(key)) {
      moveFromSelectedNames.push(rawName);
    } else {
      copyFromRawNames.push(rawName);
    }
  }

  return {
    destinationDirectory: excludeCompleted ? FINISHED_RAW_DIRECTORY : SELECTED_RAW_DIRECTORY,
    copyFromRawNames,
    moveFromSelectedNames,
    alreadyFinishedNames,
  };
}
