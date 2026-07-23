const FILE_EXTENSION_RE =
  /(?:^|[\s"'`([{])([^/\\:*?"<>|\s]+\.(?:jpe?g|png|webp|heic|heif|tiff?|gif|bmp|arw|cr2|cr3|nef|orf|raf|rw2|dng|pef|srw|x3f|3fr|mef|mrw|mp4|mov|m4v|avi|mxf|mts|m2ts|r3d|braw|wav|mp3))(?=$|[\s"'`\])},;])/giu;

export function extractFilenameBasenamesFromOcr(text: string): string[] {
  const normalized = text
    .normalize("NFKC")
    .replace(/\s*\.\s*(?=[A-Za-z0-9]{2,5}\b)/g, ".");
  const names: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = FILE_EXTENSION_RE.exec(normalized)) !== null) {
    const basename = match[1]
      .replace(/\.[A-Za-z0-9]{2,5}$/i, "")
      .replace(/^[,.;:]+|[,.;:]+$/g, "")
      .trim();
    if (!basename) continue;
    const key = basename.toLocaleLowerCase("ko-KR");
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(basename);
  }
  return names;
}

export function formatFilenameBasenamesOneLine(names: string[]): string {
  return names.join(", ");
}
