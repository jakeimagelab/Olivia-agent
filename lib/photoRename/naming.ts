export type RenameMode = "template" | "parent-prefix" | "custom-prefix";

export type TemplateRenameSettings = {
  text: string;
  startNumber: number;
  digits: number;
};

export function splitFilename(filename: string): { stem: string; extension: string } {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return { stem: filename, extension: "" };
  return { stem: filename.slice(0, dot), extension: filename.slice(dot) };
}

function prefixWithOneUnderscore(prefix: string): string {
  return prefix.endsWith("_") ? prefix : `${prefix}_`;
}

function normalizedPrefix(prefix: string): string {
  return prefixWithOneUnderscore(prefix).normalize("NFC").toLocaleLowerCase("ko-KR");
}

export function hasFilenamePrefix(filename: string, prefix: string): boolean {
  return filename.normalize("NFC").toLocaleLowerCase("ko-KR").startsWith(normalizedPrefix(prefix));
}

export function buildTemplateFilename(
  originalFilename: string,
  { text, startNumber, digits }: TemplateRenameSettings,
  sequenceIndex: number,
): string {
  const { extension } = splitFilename(originalFilename);
  const safeDigits = Math.min(5, Math.max(1, Math.trunc(digits)));
  const sequence = Math.max(0, Math.trunc(startNumber) + sequenceIndex).toString().padStart(safeDigits, "0");
  return `${text}${sequence}${extension}`;
}

export function buildParentPrefixFilename(parentFolderName: string, originalFilename: string): string {
  return `${prefixWithOneUnderscore(parentFolderName)}${originalFilename}`;
}

export function buildCustomPrefixFilename(customText: string, originalFilename: string): string {
  return `${prefixWithOneUnderscore(customText.trim())}${originalFilename}`;
}
