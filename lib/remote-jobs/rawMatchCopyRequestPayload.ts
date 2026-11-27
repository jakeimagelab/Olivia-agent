import {
  finiteNumber,
  safeLogText,
  safeWorkerAbsolutePath,
  safeWorkerRelativePath,
} from "./requestValidation";

type RemoteJobPayload = Record<string, unknown>;

function normalizeItem(entry: unknown, index: number): RemoteJobPayload {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`items[${index}]가 올바르지 않습니다.`);
  }
  const item = entry as RemoteJobPayload;
  const rawExpectedSize = finiteNumber(
    item.rawExpectedSize,
    `items[${index}].rawExpectedSize`,
    0,
    Number.MAX_SAFE_INTEGER,
    true,
  );
  if (rawExpectedSize === undefined) throw new Error(`items[${index}].rawExpectedSize가 필요합니다.`);
  const rawExpectedCaptureTimeMs = item.rawExpectedCaptureTimeMs === null
    ? null
    : finiteNumber(
        item.rawExpectedCaptureTimeMs,
        `items[${index}].rawExpectedCaptureTimeMs`,
        0,
        Number.MAX_SAFE_INTEGER,
        true,
      );
  if (rawExpectedCaptureTimeMs === undefined) {
    throw new Error(`items[${index}].rawExpectedCaptureTimeMs가 필요합니다.`);
  }

  const jpgPath = item.jpgPath === undefined
    ? undefined
    : safeWorkerRelativePath(item.jpgPath, `items[${index}].jpgPath`);
  const jpgDestDir = item.jpgDestDir === undefined
    ? undefined
    : safeWorkerRelativePath(item.jpgDestDir, `items[${index}].jpgDestDir`);
  if (jpgDestDir && !jpgPath) {
    throw new Error(`items[${index}]의 JPG 원본과 대상 폴더를 함께 지정해 주세요.`);
  }

  const jpgExpectedSize = item.jpgExpectedSize === undefined
    ? undefined
    : finiteNumber(
        item.jpgExpectedSize,
        `items[${index}].jpgExpectedSize`,
        0,
        Number.MAX_SAFE_INTEGER,
        true,
      );
  const jpgExpectedCaptureTimeMs = item.jpgExpectedCaptureTimeMs === undefined
    ? undefined
    : item.jpgExpectedCaptureTimeMs === null
      ? null
      : finiteNumber(
          item.jpgExpectedCaptureTimeMs,
          `items[${index}].jpgExpectedCaptureTimeMs`,
          0,
          Number.MAX_SAFE_INTEGER,
          true,
        );
  if (jpgPath && (jpgExpectedSize === undefined || jpgExpectedCaptureTimeMs === undefined)) {
    throw new Error(`items[${index}]의 JPG 표본 정보가 필요합니다.`);
  }

  return {
    rawPath: safeWorkerRelativePath(item.rawPath, `items[${index}].rawPath`),
    destDir: safeWorkerRelativePath(item.destDir, `items[${index}].destDir`),
    rawAction: item.rawAction === "move" ? "move" : "copy",
    rawExpectedSize,
    rawExpectedCaptureTimeMs,
    ...(jpgPath
      ? { jpgPath, jpgExpectedSize, jpgExpectedCaptureTimeMs, ...(jpgDestDir ? { jpgDestDir } : {}) }
      : {}),
  };
}

function normalizeRawRootRelation(entry: unknown): RemoteJobPayload {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("RAW 폴더의 상대 위치를 확인할 수 없습니다.");
  const value = entry as RemoteJobPayload;
  const parentSteps = finiteNumber(value.parentSteps, "JPG 상위 폴더 단계", 0, 2, true);
  if (parentSteps === undefined) throw new Error("JPG 상위 폴더 단계가 필요합니다.");
  return {
    parentSteps,
    ...(value.subdirectory === undefined ? {} : { subdirectory: safeWorkerRelativePath(value.subdirectory, "RAW 하위 폴더") }),
  };
}

function normalizeLogRow(entry: unknown, index: number): RemoteJobPayload {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`logRows[${index}]가 올바르지 않습니다.`);
  }
  const row = entry as RemoteJobPayload;
  const result = row.result;
  if (result !== "확정" && result !== "수동선택" && result !== "건너뜀") {
    throw new Error(`logRows[${index}].result가 올바르지 않습니다.`);
  }
  return {
    jpgName: safeLogText(row.jpgName, `logRows[${index}].jpgName`, 500),
    jpgPath: safeLogText(row.jpgPath, `logRows[${index}].jpgPath`),
    jpgCaptureTime: safeLogText(row.jpgCaptureTime, `logRows[${index}].jpgCaptureTime`, 100),
    rawPath: safeLogText(row.rawPath, `logRows[${index}].rawPath`),
    rawCaptureTime: safeLogText(row.rawCaptureTime, `logRows[${index}].rawCaptureTime`, 100),
    result,
  };
}

function normalizeRootLocator(entry: unknown, label: string): RemoteJobPayload {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`${label} 폴더 식별 정보가 필요합니다.`);
  }
  const locator = entry as RemoteJobPayload;
  const folderName = safeLogText(locator.folderName, `${label}.folderName`, 255).trim().normalize("NFC");
  if (!folderName || folderName === "." || folderName === ".." || /[/\\\0]/u.test(folderName)) {
    throw new Error(`${label} 폴더 이름이 올바르지 않습니다.`);
  }
  const kind = locator.kind;
  if (kind !== "raw" && kind !== "jpg") throw new Error(`${label}.kind가 올바르지 않습니다.`);
  return {
    projectKey: safeLogText(locator.projectKey, `${label}.projectKey`, 1000),
    folderName,
    kind,
    ...(typeof locator.relativePath === "string" && locator.relativePath.trim()
      ? { relativePath: safeLogText(locator.relativePath, `${label}.relativePath`, 2000) }
      : {}),
  };
}

export function normalizeRawMatchCopyRequestPayload(requested: RemoteJobPayload): RemoteJobPayload {
  const items = requested.items;
  const logRows = requested.logRows;
  if (!Array.isArray(items) || items.length === 0 || items.length > 10_000) {
    throw new Error("PHOTO_RAW_MATCH_COPY에는 1~10000개의 items가 필요합니다.");
  }
  if (!Array.isArray(logRows) || logRows.length > 10_000) {
    throw new Error("PHOTO_RAW_MATCH_COPY의 logRows가 올바르지 않습니다.");
  }

  const rawRoot = requested.rawRoot === undefined ? undefined : normalizeRootLocator(requested.rawRoot, "rawRoot");
  const rawRootPath = requested.rawRootPath === undefined || requested.rawRootPath === ""
    ? undefined
    : safeWorkerAbsolutePath(requested.rawRootPath, "RAW 기준 폴더");
  if (!rawRoot && !rawRootPath) throw new Error("RAW 폴더 식별 정보가 필요합니다.");
  const jpgRoot = requested.jpgRoot === undefined ? undefined : normalizeRootLocator(requested.jpgRoot, "jpgRoot");
  const jpgRootPath = requested.jpgRootPath === undefined || requested.jpgRootPath === ""
    ? undefined
    : safeWorkerAbsolutePath(requested.jpgRootPath, "JPG 기준 폴더");

  return {
    ...(rawRoot ? { rawRoot } : { rawRootPath }),
    ...(jpgRoot ? { jpgRoot } : jpgRootPath ? { jpgRootPath } : {}),
    ...(requested.rawRootRelation === undefined ? {} : { rawRootRelation: normalizeRawRootRelation(requested.rawRootRelation) }),
    items: items.map(normalizeItem),
    logRows: logRows.map(normalizeLogRow),
    ...(typeof requested.openOutput === "boolean" ? { openOutput: requested.openOutput } : {}),
  };
}
