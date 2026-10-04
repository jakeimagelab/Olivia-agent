import {
  buildFcpxml,
  buildMarkers,
  buildMarkersCsv,
  buildPremiereXml,
  createPathMapper,
  type MarkerOptions,
  type ReelSelection,
} from "@/lib/video-interview/exporters";
import { buildSrt } from "@/lib/video-interview/srt";
import { secondsToTimecode } from "@/lib/video-interview/timecode";
import type { VideoInterviewResult } from "@/lib/video-interview/types";
import { downloadText, safeFileName, type ReelEdits } from "./useVideoStudio";

/** 채택한 릴스가 있으면 그것만, 없으면 전체 후보 (구간 수정 반영) */
export function selectedReels(result: VideoInterviewResult, edits: ReelEdits): ReelSelection[] {
  const reels = result.analysis.reels;
  const anyAdopted = reels.some((reel) => edits.adopted[reel.id]);
  return reels
    .filter((reel) => !anyAdopted || edits.adopted[reel.id])
    .map((reel) => ({ reel, start: edits.adjusted[reel.id]?.start ?? reel.start, end: edits.adjusted[reel.id]?.end ?? reel.end }));
}

export type ExportKind = "premiere" | "fcp" | "capcut" | "csv";

export function exportInterview(kind: ExportKind, result: VideoInterviewResult, edits: ReelEdits, editRoot: string, options: MarkerOptions) {
  const reels = selectedReels(result, edits);
  const markers = buildMarkers(result.analysis, reels, options);
  const base = safeFileName(result.title);
  const plan = {
    title: result.title,
    clips: result.clips,
    rate: result.rate,
    width: result.width,
    height: result.height,
    markers,
    reels,
    mapPath: createPathMapper(result.sourceAbsoluteRoot, editRoot),
  };
  if (kind === "premiere") return downloadText(`${base}_프리미어.xml`, buildPremiereXml(plan), "application/xml");
  if (kind === "fcp") return downloadText(`${base}_파이널컷.fcpxml`, buildFcpxml(plan), "application/xml");
  if (kind === "csv") return downloadText(`${base}_마커목록.csv`, buildMarkersCsv(markers, (seconds) => secondsToTimecode(seconds, result.rate)), "text/csv");
  // 캡컷: 본편 자막 + 채택(또는 전체) 릴스 자막
  downloadText(`${base}_전체자막.srt`, buildSrt(result.segments));
  reels.forEach(({ start, end }, index) => {
    setTimeout(() => downloadText(`${base}_릴스${String(index + 1).padStart(2, "0")}_자막.srt`, buildSrt(result.segments, { start, end })), 250 * (index + 1));
  });
}
