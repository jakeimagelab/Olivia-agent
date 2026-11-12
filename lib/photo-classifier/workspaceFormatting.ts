export function makeCSV(headers: string[], rows: string[][]): string {
  const escapeCell = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
  return [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ].join("\n");
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const anchor = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: filename,
  });
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export function formatTime(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function estimatedRemaining(completed: number, total: number, startedAt: number) {
  if (completed <= 0 || completed >= total) return "";
  const remainingMs = ((Date.now() - startedAt) / completed) * (total - completed);
  const seconds = Math.max(1, Math.round(remainingMs / 1000));
  return seconds >= 60 ? ` · 약 ${Math.ceil(seconds / 60)}분 남음` : ` · 약 ${seconds}초 남음`;
}
