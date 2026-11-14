import { formatCaptureTime } from "@/lib/selectMatch/captureTime";
import type { MatchLogRow } from "@/lib/selectMatch/captureMatchTypes";

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildMatchLogCsv(rows: readonly MatchLogRow[]): string {
  const header = ["JPG 이름", "JPG 경로", "JPG 촬영시각", "RAW 경로", "RAW 촬영시각", "결과"];
  return `\uFEFF${[
    header,
    ...rows.map((row) => [
      row.jpgName,
      row.jpgPath,
      formatCaptureTime(row.jpgCaptureTime),
      row.rawPath,
      row.rawCaptureTimeText ?? formatCaptureTime(row.rawCaptureTime),
      row.result,
    ]),
  ].map((columns) => columns.map(csvCell).join(",")).join("\r\n")}`;
}
