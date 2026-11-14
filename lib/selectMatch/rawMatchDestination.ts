function normalizedPathSegments(value: string): string[] {
  return value
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim().normalize("NFC"))
    .filter((segment) => segment && segment !== "." && segment !== "..");
}

/**
 * 같은 작업 안의 RAW basename이 겹칠 때만 원본 상대 폴더를 Selected_RAW 아래에 보존한다.
 * 유일한 파일은 기존처럼 Selected_RAW 바로 아래에 둔다.
 */
export function resolveRawMatchDestinationDirectories(
  rawPaths: readonly string[],
  baseDirectory = "Selected_RAW",
): string[] {
  const counts = new Map<string, number>();
  const parsed = rawPaths.map((rawPath) => {
    const segments = normalizedPathSegments(rawPath);
    const filename = segments.at(-1) ?? "";
    const key = filename.toLocaleLowerCase("en-US");
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return { segments, key };
  });
  return parsed.map(({ segments, key }) => {
    if ((counts.get(key) ?? 0) <= 1 || segments.length <= 1) return baseDirectory;
    return [baseDirectory, ...segments.slice(0, -1)].join("/");
  });
}
