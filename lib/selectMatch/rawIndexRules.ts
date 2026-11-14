import { isDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";

const RAW_SCAN_SKIPPED_DIRECTORIES = new Set([
  "selected_raw",
  "finished_raw",
  "jpg전체",
  "jpg원본",
  "jpg",
  ".olivia",
]);

export function normalizeRawBasename(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

export function shouldSkipRawScanDirectory(name: string): boolean {
  const normalized = normalizeRawBasename(name);
  return normalized.startsWith(".")
    || RAW_SCAN_SKIPPED_DIRECTORIES.has(normalized)
    || isDeliveredRoundFolder(name)
    || /^\d+px_q\d+$/i.test(normalized);
}
