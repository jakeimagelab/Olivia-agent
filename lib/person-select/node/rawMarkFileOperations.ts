import path from "node:path";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";

import type { PersonSelectRawLabelNames } from "@/lib/person-select/rawMatch";
import { restoreRawMarkXmp, updateRawMarkXmp } from "@/lib/person-select/node/rawMarkXmp";

export type PersonSelectRawMarkFile = {
  path: string;
  relPath: string;
};

async function existingSidecarPath(rawPath: string) {
  const stem = rawPath.replace(/\.[^.]+$/u, "");
  for (const extension of [".xmp", ".XMP"]) {
    const candidate = `${stem}${extension}`;
    if (await stat(candidate).then((value) => value.isFile()).catch(() => false)) {
      return candidate;
    }
  }
  return `${stem}.xmp`;
}

function ensureInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("XMP 경로가 촬영 폴더 밖을 가리킵니다.");
  }
  return candidate;
}

async function atomicWrite(filePath: string, text: string) {
  const temporary = `${filePath}.olivia-${process.pid}-${Date.now()}.tmp`;
  await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function markPersonSelectRawSidecar(input: {
  raw: PersonSelectRawMarkFile;
  shootingRoot: string;
  jobId: string;
  rating: number | null;
  colorLabel: number | null;
  labelNames: PersonSelectRawLabelNames;
}) {
  const rawBefore = await stat(input.raw.path);
  const sidecarPath = ensureInside(input.shootingRoot, await existingSidecarPath(input.raw.path));
  const existingXml = await readFile(sidecarPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  const label = input.colorLabel === 6
    || input.colorLabel === 7
    || input.colorLabel === 8
    || input.colorLabel === 9
    ? input.labelNames[input.colorLabel]
    : null;
  const update = updateRawMarkXmp(existingXml, {
    rating: input.rating,
    label,
    colorCode: input.colorLabel as 6 | 7 | 8 | 9 | null,
    jobId: input.jobId,
  });
  await atomicWrite(sidecarPath, update.xml);

  const rawAfter = await stat(input.raw.path);
  if (rawAfter.size !== rawBefore.size || rawAfter.mtimeMs !== rawBefore.mtimeMs) {
    throw new Error(`RAW 원본 속성이 바뀌어 작업을 중단했습니다: ${input.raw.relPath}`);
  }
  return {
    rawPath: input.raw.relPath,
    sidecarPath: path.relative(input.shootingRoot, sidecarPath)
      .split(path.sep)
      .join("/")
      .normalize("NFC"),
    created: update.createdDocument,
  };
}

export async function clearPersonSelectRawMarks(input: {
  shootingRoot: string;
  previousResult: Record<string, unknown> | null;
}) {
  const previous = input.previousResult;
  const jobId = typeof previous?.rawMarkJobId === "string" ? previous.rawMarkJobId : "";
  const markedSidecars = Array.isArray(previous?.markedSidecars) ? previous.markedSidecars : [];
  if (previous?.mode !== "mark" || !jobId || !markedSidecars.length) {
    throw new Error("되돌릴 로우 셀렉 기록이 없습니다.");
  }

  let restored = 0;
  let deleted = 0;
  const failed: Array<{ sidecar: string; error: string }> = [];
  for (const item of markedSidecars) {
    const relativePath = item
      && typeof item === "object"
      && typeof (item as Record<string, unknown>).sidecarPath === "string"
      ? String((item as Record<string, unknown>).sidecarPath)
      : "";
    try {
      if (!relativePath) throw new Error("XMP 경로가 없습니다.");
      const sidecarPath = ensureInside(
        input.shootingRoot,
        path.resolve(input.shootingRoot, relativePath),
      );
      const current = await readFile(sidecarPath, "utf8");
      const restoredXmp = restoreRawMarkXmp(current, jobId);
      if (restoredXmp.deleteSidecar) {
        await rm(sidecarPath);
        deleted += 1;
      } else {
        await atomicWrite(sidecarPath, restoredXmp.xml);
        restored += 1;
      }
    } catch (error) {
      failed.push({
        sidecar: relativePath || "알 수 없음",
        error: error instanceof Error ? error.message : "복원 실패",
      });
    }
  }
  return { restored, deleted, failed };
}
