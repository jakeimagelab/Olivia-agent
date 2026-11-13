import path from "node:path";
import { readdir, stat } from "node:fs/promises";

import { normalizeNfc } from "@/lib/person-select/core";
import { PERSON_SELECT_RAW_OUTPUT_FOLDER } from "@/lib/person-select/rawMatch";
import { isDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";
import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";

export type PersonSelectRawFile = {
  path: string;
  relPath: string;
  name: string;
  size: number;
};

const SKIP_DIRECTORIES = new Set([
  PERSON_SELECT_RAW_OUTPUT_FOLDER.toLowerCase(),
  "jpg",
  "jpg원본",
  "jpg전체",
]);

function extension(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

export function personSelectRawBasename(fileName: string) {
  return normalizeNfc(fileName).replace(/\.[^.]+$/, "").toLocaleLowerCase("en-US");
}

/** 촬영 폴더 안의 RAW를 파일 이름(확장자 제외)별로 모은다. */
export async function indexPersonSelectRawFiles(root: string) {
  const index = new Map<string, PersonSelectRawFile[]>();
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true, encoding: "utf8" })) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(normalizeNfc(entry.name).toLowerCase())
          || isDeliveredRoundFolder(entry.name)) {
          continue;
        }
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile() || !SELECT_MATCH_RAW_EXTENSIONS.has(extension(entry.name))) continue;
      const info = await stat(fullPath);
      const file: PersonSelectRawFile = {
        path: fullPath,
        relPath: normalizeNfc(path.relative(root, fullPath).split(path.sep).join("/")),
        name: normalizeNfc(entry.name),
        size: info.size,
      };
      const key = personSelectRawBasename(entry.name);
      index.set(key, [...(index.get(key) ?? []), file]);
    }
  };
  await visit(root);
  return index;
}

/** 고른 JPG와 같은 이름의 RAW가 여러 폴더에 있을 때 사람 폴더를 우선한다. */
export function pickPersonSelectRawCandidate(
  candidates: PersonSelectRawFile[],
  personFolder: string,
) {
  const prefix = `${normalizeNfc(personFolder)}/`;
  const inPerson = candidates.filter((file) => file.relPath.startsWith(prefix));
  const pool = inPerson.length ? inPerson : candidates;
  if (pool.length === 1) return { status: "matched" as const, file: pool[0] };
  if (pool.length > 1) return { status: "ambiguous" as const, files: pool };
  return { status: "missing" as const };
}

/** source_rel_path에서 사진 주인의 폴더를 구한다. JPG원본 같은 하위 폴더는 떼어 낸다. */
export function personSelectOwnerFolder(sourceRelPath: string) {
  const segments = normalizeNfc(sourceRelPath).split("/").filter(Boolean);
  segments.pop();
  const last = segments.at(-1)?.toLowerCase();
  if (last && SKIP_DIRECTORIES.has(last)) segments.pop();
  if (last === "jpg") segments.pop();
  return segments.join("/");
}
