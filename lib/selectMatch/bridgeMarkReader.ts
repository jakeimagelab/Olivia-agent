import {
  PERSON_SELECT_RAW_LABEL_NAMES,
  type PersonSelectRawColorLabel,
} from "@/lib/person-select/rawMatch";
import type { AdobeBridgeMark } from "@/lib/selectMatch/bridgeMarkTypes";

export function readRatingFromXmpText(text: string): number | null {
  const match = text.match(/xmp:Rating[^>]*>\s*([1-5])\s*</i)
    ?? text.match(/xmp:Rating\s*=\s*["']([1-5])["']/i);
  return match ? Number(match[1]) : null;
}

export function readColorLabelFromXmpText(text: string): PersonSelectRawColorLabel | null {
  const oliviaCode = text.match(/olivia:ColorCode[^>]*>\s*([6-9])\s*</i)
    ?? text.match(/olivia:ColorCode\s*=\s*["']([6-9])["']/i);
  if (oliviaCode) return Number(oliviaCode[1]) as PersonSelectRawColorLabel;
  const match = text.match(/xmp:Label[^>]*>\s*([^<]+?)\s*</i)
    ?? text.match(/xmp:Label\s*=\s*["']([^"']+)["']/i);
  if (!match) return null;
  const label = match[1].trim().toLocaleLowerCase("en-US");
  const found = ([6, 7, 8, 9] as const).find(
    (value) => PERSON_SELECT_RAW_LABEL_NAMES[value].toLocaleLowerCase("en-US") === label,
  );
  return found ?? null;
}

export function readBridgeMarkFromXmpText(text: string): AdobeBridgeMark {
  return { rating: readRatingFromXmpText(text), colorLabel: readColorLabelFromXmpText(text) };
}

export function isFileSystemNotFoundError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "NotFoundError"
    : Boolean(error && typeof error === "object" && "name" in error && (error as { name?: unknown }).name === "NotFoundError");
}

export async function readBridgeMarkSidecar(
  directory: FileSystemDirectoryHandle,
  basename: string,
): Promise<AdobeBridgeMark> {
  for (const extension of [".xmp", ".XMP"]) {
    try {
      const handle = await directory.getFileHandle(`${basename}${extension}`);
      const file = await handle.getFile();
      return readBridgeMarkFromXmpText(await file.text());
    } catch (error) {
      if (!isFileSystemNotFoundError(error)) throw error;
    }
  }
  return { rating: null, colorLabel: null };
}

export async function readRatingSidecar(
  directory: FileSystemDirectoryHandle,
  basename: string,
): Promise<number | null> {
  return (await readBridgeMarkSidecar(directory, basename)).rating;
}

export async function readBridgeMarkEmbedded(file: File): Promise<AdobeBridgeMark> {
  const buffer = await file.slice(0, 1024 * 1024).arrayBuffer();
  return readBridgeMarkFromXmpText(new TextDecoder("utf-8", { fatal: false }).decode(buffer));
}

export async function readRatingEmbedded(file: File): Promise<number | null> {
  return (await readBridgeMarkEmbedded(file)).rating;
}
