import {
  classifyPersonFolderName,
  normalizeNfc,
  parseGroupFolderName,
  parsePersonFolderName,
  PERSON_FOLDER_JPG_DIRECTORIES,
} from "./folderRules";

export type PersonSelectImportLayout = "school" | "person-folders" | "project";

export type LocalPersonSelectSource = {
  file: File;
  relativePath: string;
};

export type LocalPersonSelectCandidate = LocalPersonSelectSource & {
  fileName: string;
  category: string;
  ownerName: string | null;
  ownerGroup: string | null;
};

export type LocalPersonSelectScan = {
  files: LocalPersonSelectCandidate[];
  skippedFolders: string[];
  groupFolders: string[];
  unnamedFolders: string[];
  emptyFolders: string[];
};

const JPG_FILE = /\.jpe?g$/i;
const SCHOOL_MAPPINGS = {
  "선생님프로필": { category: "profile", owner: "person" },
  "담임선생님": { category: "homeroom", owner: "group" },
} as const;

export function isPersonSelectJpegFile(name: string) {
  return JPG_FILE.test(name);
}

export function isPersonSelectSchoolMappingFolder(name: string) {
  return name in SCHOOL_MAPPINGS;
}

function pathSegments(value: string) {
  const normalized = normalizeNfc(value.replace(/\\/g, "/"));
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return null;
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.startsWith("."))) return null;
  return segments;
}

export function deriveLocalImportRecord(layout: PersonSelectImportLayout, relativePath: string) {
  const segments = pathSegments(relativePath);
  if (!segments || !isPersonSelectJpegFile(segments.at(-1) ?? "")) return null;
  const fileName = segments.at(-1)!;

  if (layout === "project") {
    return { relativePath: segments.join("/"), fileName, category: "photo", ownerName: null, ownerGroup: null };
  }

  if (layout === "person-folders") {
    if (segments.length !== 2 && segments.length !== 3) return null;
    const person = classifyPersonFolderName(segments[0]);
    if (person.kind !== "person") return null;
    if (segments.length === 3 && !PERSON_FOLDER_JPG_DIRECTORIES.some((folder) => normalizeNfc(folder).toLocaleLowerCase("ko-KR") === segments[1].toLocaleLowerCase("ko-KR"))) return null;
    return {
      relativePath: segments.join("/"),
      fileName,
      category: "photo",
      ownerName: person.name,
      ownerGroup: null,
    };
  }

  if (segments.length !== 3) return null;
  const mappingName = segments[0] as keyof typeof SCHOOL_MAPPINGS;
  const mapping = SCHOOL_MAPPINGS[mappingName];
  if (!mapping) return null;
  if (mapping.owner === "person") {
    const ownerName = parsePersonFolderName(segments[1], mappingName);
    if (!ownerName) return null;
    return { relativePath: segments.join("/"), fileName, category: mapping.category, ownerName, ownerGroup: null };
  }
  const ownerGroup = parseGroupFolderName(segments[1], mappingName);
  if (!ownerGroup) return null;
  return { relativePath: segments.join("/"), fileName, category: mapping.category, ownerName: null, ownerGroup };
}

export function scanLocalPersonSelectFiles(
  sources: LocalPersonSelectSource[],
  layout: PersonSelectImportLayout,
  topLevelFolders: string[] = [],
): LocalPersonSelectScan {
  const normalizedTop = [...new Set(topLevelFolders.map((name) => normalizeNfc(name)).filter(Boolean))];
  const groupFolders: string[] = [];
  const unnamedFolders: string[] = [];
  const skippedFolders: string[] = [];
  const personFolders: string[] = [];

  for (const folder of normalizedTop) {
    if (layout === "project") continue;
    if (layout === "school") {
      if (!isPersonSelectSchoolMappingFolder(folder) && !folder.startsWith(".")) skippedFolders.push(folder);
      continue;
    }
    const kind = classifyPersonFolderName(folder);
    if (kind.kind === "group") groupFolders.push(folder);
    else if (kind.kind === "unnamed") unnamedFolders.push(folder);
    else if (kind.kind === "person") personFolders.push(kind.name);
  }

  const derived: LocalPersonSelectCandidate[] = sources.flatMap((source) => {
    const record = deriveLocalImportRecord(layout, source.relativePath);
    return record ? [{ ...source, ...record }] : [];
  });

  let files: LocalPersonSelectCandidate[] = derived;
  if (layout === "person-folders") {
    const byPerson = new Map<string, LocalPersonSelectCandidate[]>();
    for (const candidate of derived) {
      const list = byPerson.get(candidate.ownerName!) ?? [];
      list.push(candidate);
      byPerson.set(candidate.ownerName!, list);
    }
    files = [];
    for (const list of byPerson.values()) {
      const selectedDirectory = PERSON_FOLDER_JPG_DIRECTORIES.find((directory) => list.some((candidate) => candidate.relativePath.split("/")[1]?.toLocaleLowerCase("ko-KR") === directory.toLocaleLowerCase("ko-KR")));
      files.push(...list.filter((candidate) => selectedDirectory
        ? candidate.relativePath.split("/")[1]?.toLocaleLowerCase("ko-KR") === selectedDirectory.toLocaleLowerCase("ko-KR")
        : candidate.relativePath.split("/").length === 2));
    }
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "ko"));
  const ownersWithPhotos = new Set(files.map((file) => file.ownerName).filter((name): name is string => Boolean(name)));
  const emptyFolders = layout === "person-folders" ? personFolders.filter((name) => !ownersWithPhotos.has(name)) : [];
  return { files, skippedFolders, groupFolders, unnamedFolders, emptyFolders };
}
