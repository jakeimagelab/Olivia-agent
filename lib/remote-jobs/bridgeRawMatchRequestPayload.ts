import { finiteNumber, safeLogText, safeWorkerRelativePath } from "./requestValidation";

type JsonRecord = Record<string, unknown>;

function normalizeRoot(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("촬영 폴더 식별 정보가 필요합니다.");
  }
  const source = value as JsonRecord;
  const folderName = safeLogText(source.folderName, "projectRoot.folderName", 255).trim().normalize("NFC");
  if (!folderName || /[/\\\0]/u.test(folderName) || folderName === "." || folderName === "..") {
    throw new Error("촬영 폴더 이름이 올바르지 않습니다.");
  }
  return {
    projectKey: safeLogText(source.projectKey, "projectRoot.projectKey", 1000),
    folderName,
    kind: "raw",
    ...(typeof source.relativePath === "string" && source.relativePath.trim()
      ? { relativePath: safeLogText(source.relativePath, "projectRoot.relativePath", 2000) }
      : {}),
  };
}

function normalizeJpg(value: unknown, index: number): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`selectedJpgs[${index}]가 올바르지 않습니다.`);
  }
  const source = value as JsonRecord;
  const captureTimeMs = source.captureTimeMs === null
    ? null
    : finiteNumber(source.captureTimeMs, `selectedJpgs[${index}].captureTimeMs`, 0, Number.MAX_SAFE_INTEGER, true);
  if (captureTimeMs === undefined) throw new Error(`selectedJpgs[${index}].captureTimeMs가 필요합니다.`);
  return {
    name: safeLogText(source.name, `selectedJpgs[${index}].name`, 500),
    relativePath: safeWorkerRelativePath(source.relativePath, `selectedJpgs[${index}].relativePath`),
    size: finiteNumber(source.size, `selectedJpgs[${index}].size`, 1, Number.MAX_SAFE_INTEGER, true),
    captureTimeMs,
  };
}

export function normalizeBridgeRawMatchRequestPayload(requested: JsonRecord): JsonRecord {
  if (!Array.isArray(requested.selectedJpgs) || requested.selectedJpgs.length < 1 || requested.selectedJpgs.length > 10_000) {
    throw new Error("PHOTO_BRIDGE_RAW_MATCH에는 1~10000장의 JPG가 필요합니다.");
  }
  const deliveredFolderName = safeLogText(requested.deliveredFolderName, "deliveredFolderName", 255).trim().normalize("NFC");
  if (!/^\d+차보정본$/u.test(deliveredFolderName)) throw new Error("보정본 폴더 이름이 올바르지 않습니다.");
  return {
    projectRoot: normalizeRoot(requested.projectRoot),
    currentJpgDirectory: safeWorkerRelativePath(requested.currentJpgDirectory, "currentJpgDirectory"),
    selectedJpgs: requested.selectedJpgs.map(normalizeJpg),
    deliveredFolderName,
    ...(typeof requested.openOutput === "boolean" ? { openOutput: requested.openOutput } : {}),
  };
}
