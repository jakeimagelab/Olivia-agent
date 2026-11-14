import {
  PERSON_SELECT_RAW_OUTPUT_FOLDER,
  type PersonSelectRawMatchPathPlan,
} from "@/lib/person-select/rawMatchTypes";

const PERSON_SELECT_JPG_ROOT_NAMES = new Set(["jpg", "jpg원본", "jpg전체"]);

function normalizedPathSegments(value: string) {
  return value.replace(/\\/g, "/").split("/").filter(Boolean);
}

function joinLikeSource(source: string, segments: readonly string[]) {
  return `${source.trim().startsWith("/") ? "/" : ""}${segments.join("/")}`;
}

/**
 * 사진선택에 저장된 JPG 폴더와 RAW를 찾을 촬영 폴더를 분리한다.
 * 실제 폴더 철자(NFD 포함)는 보존하고, 알려진 JPG 폴더 비교에만 NFC를 사용한다.
 */
export function resolvePersonSelectRawMatchPathPlan(
  sourcePath: string,
  ownerFolder = "<이름>",
): PersonSelectRawMatchPathPlan {
  const source = sourcePath.trim().replace(/\\/g, "/").replace(/\/$/, "");
  const segments = normalizedPathSegments(source);
  const rootOffset = /^root-\d+$/u.test(segments[0] ?? "") ? 1 : 0;
  const jpgRootIndex = segments.findIndex((segment, index) => (
    index >= rootOffset && PERSON_SELECT_JPG_ROOT_NAMES.has(segment.normalize("NFC").toLocaleLowerCase("ko-KR"))
  ));
  const canUseParent = jpgRootIndex > rootOffset;
  const shootingSegments = canUseParent ? segments.slice(0, jpgRootIndex) : segments;
  const shootingPath = joinLikeSource(source, shootingSegments);
  return {
    sourcePath: source,
    shootingPath,
    outputPath: [shootingPath, PERSON_SELECT_RAW_OUTPUT_FOLDER, ownerFolder].filter(Boolean).join("/"),
    derivedFromJpgFolder: canUseParent,
  };
}
