import { secondsToFrames, timecodeToFrames } from "./timecode";
import type { FrameRate, InterviewAnalysis, InterviewClip, ReelSuggestion } from "./types";

// 편집툴로 보내는 파일 생성기 — 브라우저(영상작업실)에서 실행한다.
// 채택/구간 수정 같은 화면 상태가 바로 반영되도록 서버가 아닌 클라이언트에서 만든다.

export type MarkerKind = "qa" | "reel" | "edit" | "cut" | "compliance";

export type ExportMarker = { kind: MarkerKind; start: number; end: number; name: string; comment: string };

export type ReelSelection = { reel: ReelSuggestion; start: number; end: number };

export type MarkerOptions = { edits: boolean; cuts: boolean; compliance: boolean };

export type ExportPlan = {
  title: string;
  clips: InterviewClip[];
  rate: FrameRate;
  width: number;
  height: number;
  markers: ExportMarker[];
  reels: ReelSelection[];
  /** Mac Studio 절대경로 → 편집하는 맥에서의 경로 */
  mapPath: (absolutePath: string) => string;
};

const MARKER_PREFIX: Record<MarkerKind, string> = { qa: "", reel: "[릴스] ", edit: "[편집] ", cut: "[컷] ", compliance: "[의료광고 주의] " };

export function buildMarkers(analysis: InterviewAnalysis, reels: ReelSelection[], options: MarkerOptions): ExportMarker[] {
  const markers: ExportMarker[] = analysis.qa.map((block) => ({
    kind: "qa",
    start: block.start,
    end: block.end,
    name: `${block.label}. ${block.topic}`,
    comment: [block.question, block.summary].filter(Boolean).join(" / "),
  }));
  reels.forEach(({ reel, start, end }, index) => markers.push({
    kind: "reel",
    start,
    end,
    name: `${MARKER_PREFIX.reel}${String(index + 1).padStart(2, "0")} ${"★".repeat(reel.score)} ${reel.title}`,
    comment: [reel.hook, reel.reason].filter(Boolean).join(" / "),
  }));
  if (options.edits) analysis.editIdeas.forEach((idea) => markers.push({ kind: "edit", start: idea.start, end: idea.end, name: `${MARKER_PREFIX.edit}${idea.type}`, comment: idea.idea }));
  if (options.cuts) analysis.cuts.forEach((cut) => markers.push({ kind: "cut", start: cut.start, end: cut.end, name: `${MARKER_PREFIX.cut}컷 후보`, comment: cut.reason }));
  if (options.compliance) analysis.compliance.forEach((flag) => markers.push({ kind: "compliance", start: flag.start, end: flag.end, name: `${MARKER_PREFIX.compliance}${flag.issue}`, comment: `"${flag.text}" → ${flag.suggestion}` }));
  return markers.sort((a, b) => a.start - b.start);
}

/** Mac Studio의 SOURCE_ROOT를 편집 맥의 NAS 마운트 경로로 바꾸는 함수 */
export function createPathMapper(sourceAbsoluteRoot: string, editMachineRoot: string | null | undefined) {
  const from = sourceAbsoluteRoot.replace(/\/+$/, "");
  const to = (editMachineRoot ?? "").trim().replace(/\/+$/, "");
  return (absolutePath: string) => (to && absolutePath.startsWith(`${from}/`) ? `${to}${absolutePath.slice(from.length)}` : absolutePath);
}

const xml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  // XML 1.0에서 허용되지 않는 제어문자 제거
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function fileUrl(absolutePath: string, host = ""): string {
  return `file://${host}${absolutePath.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

/** 클립별 타임라인 시작 프레임 — 반올림 오차가 쌓이지 않게 프레임 단위로 누적한다. */
function clipFrameLayout(clips: InterviewClip[], rate: FrameRate) {
  let cursor = 0;
  return clips.map((clip) => {
    const frames = Math.max(1, secondsToFrames(clip.durationSec, rate));
    const layout = { clip, offset: cursor, frames };
    cursor += frames;
    return layout;
  });
}

function timelineFrame(seconds: number, layout: ReturnType<typeof clipFrameLayout>, rate: FrameRate): number {
  for (const item of layout) {
    if (seconds < item.clip.timelineStartSec + item.clip.durationSec) {
      return item.offset + Math.min(item.frames, secondsToFrames(seconds - item.clip.timelineStartSec, rate));
    }
  }
  const lastItem = layout[layout.length - 1];
  return lastItem ? lastItem.offset + lastItem.frames : 0;
}

/** 타임라인 구간 [start, end]가 걸치는 클립 조각들 (클립 경계를 넘는 릴스 대응) */
function rangePieces(start: number, end: number, layout: ReturnType<typeof clipFrameLayout>, rate: FrameRate) {
  const pieces: Array<{ index: number; inFrame: number; outFrame: number }> = [];
  layout.forEach((item, index) => {
    const clipStart = item.clip.timelineStartSec;
    const clipEnd = clipStart + item.clip.durationSec;
    if (end <= clipStart || start >= clipEnd) return;
    const inFrame = secondsToFrames(Math.max(start, clipStart) - clipStart, rate);
    const outFrame = Math.min(item.frames, secondsToFrames(Math.min(end, clipEnd) - clipStart, rate));
    if (outFrame > inFrame) pieces.push({ index, inFrame, outFrame });
  });
  return pieces;
}

function verticalScale(width: number, height: number): number {
  // 가로 영상을 1080x1920 세로 시퀀스에 꽉 채우는 배율(%)
  return width >= height ? (1920 / height) * 100 : (1080 / width) * 100;
}

// ───────────────────────── 프리미어 프로 (FCP7 XML / xmeml) ─────────────────────────

export function buildPremiereXml(plan: ExportPlan): string {
  const { rate } = plan;
  const layout = clipFrameLayout(plan.clips, rate);
  const rateXml = `<rate><timebase>${rate.timebase}</timebase><ntsc>${rate.ntsc ? "TRUE" : "FALSE"}</ntsc></rate>`;
  const defined = new Set<string>();
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}-${++counter}`;

  const fileElement = (index: number) => {
    const clip = plan.clips[index];
    const id = `file-${index + 1}`;
    if (defined.has(id)) return `<file id="${id}"/>`;
    defined.add(id);
    const video = clip.hasVideo
      ? `<video><samplecharacteristics>${rateXml}<width>${clip.width ?? plan.width}</width><height>${clip.height ?? plan.height}</height></samplecharacteristics></video>`
      : "";
    const audio = clip.hasAudio
      ? `<audio><samplecharacteristics><depth>16</depth><samplerate>${clip.sampleRate}</samplerate></samplecharacteristics><channelcount>${clip.channels}</channelcount></audio>`
      : "";
    return `<file id="${id}"><name>${xml(clip.name)}</name><pathurl>${xml(fileUrl(plan.mapPath(clip.absolutePath), "localhost"))}</pathurl>${rateXml}<duration>${layout[index].frames}</duration><media>${video}${audio}</media></file>`;
  };

  const motion = (scale: number) => (Math.abs(scale - 100) < 0.01 ? "" : `<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effectcategory>motion</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype><parameter><parameterid>scale</parameterid><name>Scale</name><valuemin>0</valuemin><valuemax>1000</valuemax><value>${scale.toFixed(2)}</value></parameter></effect></filter>`);

  const sequence = (
    name: string,
    pieces: Array<{ index: number; inFrame: number; outFrame: number }>,
    size: { width: number; height: number },
    markers: Array<{ name: string; comment: string; inFrame: number; outFrame: number }>,
    scale = 100,
  ) => {
    const videoItems: string[] = [];
    const audioTracks: string[][] = [[], []];
    let cursor = 0;
    pieces.forEach((piece, clipOrder) => {
      const clip = plan.clips[piece.index];
      const length = piece.outFrame - piece.inFrame;
      const ids = { video: nextId("clipitem"), a1: nextId("clipitem"), a2: nextId("clipitem") };
      const stereo = clip.channels >= 2;
      const timing = `<enabled>TRUE</enabled><duration>${layout[piece.index].frames}</duration>${rateXml}<start>${cursor}</start><end>${cursor + length}</end><in>${piece.inFrame}</in><out>${piece.outFrame}</out>`;
      const linked = [
        ...(clip.hasVideo ? [[ids.video, "video", 1] as const] : []),
        ...(clip.hasAudio ? [[ids.a1, "audio", 1] as const] : []),
        ...(clip.hasAudio && stereo ? [[ids.a2, "audio", 2] as const] : []),
      ];
      const links = linked.length > 1
        ? linked.map(([ref, media, track]) => `<link><linkclipref>${ref}</linkclipref><mediatype>${media}</mediatype><trackindex>${track}</trackindex><clipindex>${clipOrder + 1}</clipindex></link>`).join("")
        : "";
      if (clip.hasVideo) videoItems.push(`<clipitem id="${ids.video}"><name>${xml(clip.name)}</name>${timing}${fileElement(piece.index)}${motion(scale)}${links}</clipitem>`);
      if (clip.hasAudio) {
        audioTracks[0].push(`<clipitem id="${ids.a1}"><name>${xml(clip.name)}</name>${timing}${fileElement(piece.index)}<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>${links}</clipitem>`);
        if (stereo) audioTracks[1].push(`<clipitem id="${ids.a2}"><name>${xml(clip.name)}</name>${timing}${fileElement(piece.index)}<sourcetrack><mediatype>audio</mediatype><trackindex>2</trackindex></sourcetrack>${links}</clipitem>`);
      }
      cursor += length;
    });
    const markerXml = markers
      .map((marker) => `<marker><comment>${xml(marker.comment)}</comment><name>${xml(marker.name)}</name><in>${marker.inFrame}</in><out>${marker.outFrame}</out></marker>`)
      .join("");
    const audioXml = audioTracks.filter((track) => track.length).map((track) => `<track>${track.join("")}</track>`).join("");
    return `<sequence id="${nextId("sequence")}"><name>${xml(name)}</name><duration>${cursor}</duration>${rateXml}`
      + `<timecode>${rateXml}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>`
      + `<media><video><format><samplecharacteristics>${rateXml}<width>${size.width}</width><height>${size.height}</height><pixelaspectratio>square</pixelaspectratio></samplecharacteristics></format><track>${videoItems.join("")}</track></video>`
      + `<audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>${audioXml}</audio></media>`
      + `${markerXml}</sequence>`;
  };

  const sequences: string[] = [];
  const mainPieces = layout.map((item, index) => ({ index, inFrame: 0, outFrame: item.frames }));
  const mainMarkers = plan.markers.map((marker) => {
    const inFrame = timelineFrame(marker.start, layout, rate);
    return { name: marker.name, comment: marker.comment, inFrame, outFrame: Math.max(inFrame + 1, timelineFrame(marker.end, layout, rate)) };
  });
  sequences.push(sequence(`00_본편_Q&A마커`, mainPieces, { width: plan.width, height: plan.height }, mainMarkers));

  const scale = verticalScale(plan.width, plan.height);
  plan.reels.forEach(({ reel, start, end }, index) => {
    const pieces = rangePieces(start, end, layout, rate);
    if (!pieces.length) return;
    const name = `릴스${String(index + 1).padStart(2, "0")}_${"★".repeat(reel.score)}_${reel.title}`.slice(0, 70);
    const markers = reel.hook ? [{ name: reel.hook, comment: reel.reason, inFrame: 0, outFrame: 1 }] : [];
    sequences.push(sequence(name, pieces, { width: 1080, height: 1920 }, markers, scale));
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="4"><project><name>${xml(plan.title)}</name><children>${sequences.join("")}</children></project></xmeml>\n`;
}

// ───────────────────────── 파이널컷 프로 (FCPXML 1.10) ─────────────────────────

function fcpFormatName(width: number, height: number, rate: FrameRate): string | null {
  const rateName = rate.ntsc
    ? ({ 24: "2398", 30: "2997", 60: "5994" } as Record<number, string>)[rate.timebase]
    : ([24, 25, 30, 50, 60].includes(rate.timebase) ? String(rate.timebase) : undefined);
  if (!rateName) return null;
  if (width === 1920 && height === 1080) return `FFVideoFormat1080p${rateName}`;
  if (width === 3840 && height === 2160) return `FFVideoFormat3840x2160p${rateName}`;
  if (width === 1280 && height === 720) return `FFVideoFormat720p${rateName}`;
  return null;
}

export function buildFcpxml(plan: ExportPlan): string {
  const { rate } = plan;
  const layout = clipFrameLayout(plan.clips, rate);
  const frameDuration = rate.ntsc ? `1001/${rate.timebase * 1000}s` : `1/${rate.timebase}s`;
  const t = (frames: number) => {
    if (frames <= 0) return "0s";
    return rate.ntsc ? `${frames * 1001}/${rate.timebase * 1000}s` : `${frames}/${rate.timebase}s`;
  };
  const assetStart = layout.map(({ clip }) => (clip.startTimecode ? timecodeToFrames(clip.startTimecode, rate) ?? 0 : 0));
  const mainName = fcpFormatName(plan.width, plan.height, rate);

  const resources = [
    `<format id="r1"${mainName ? ` name="${mainName}"` : ""} frameDuration="${frameDuration}" width="${plan.width}" height="${plan.height}" colorSpace="1-1-1 (Rec. 709)"/>`,
    `<format id="r2" frameDuration="${frameDuration}" width="1080" height="1920" colorSpace="1-1-1 (Rec. 709)"/>`,
    ...layout.map(({ clip, frames }, index) => `<asset id="a${index + 1}" name="${xml(clip.name)}" start="${t(assetStart[index])}" duration="${t(frames)}"`
      + `${clip.hasVideo ? ` hasVideo="1" format="r1"` : ""}${clip.hasAudio ? ` hasAudio="1" audioSources="1" audioChannels="${clip.channels}" audioRate="${clip.sampleRate}"` : ""}>`
      + `<media-rep kind="original-media" src="${xml(fileUrl(plan.mapPath(clip.absolutePath)))}"/></asset>`),
  ];

  const markerXml = (index: number) => plan.markers
    .filter((marker) => {
      const clip = plan.clips[index];
      return marker.start >= clip.timelineStartSec && marker.start < clip.timelineStartSec + clip.durationSec;
    })
    .map((marker) => {
      const clip = plan.clips[index];
      const local = secondsToFrames(marker.start - clip.timelineStartSec, rate);
      const length = Math.max(1, secondsToFrames(marker.end - marker.start, rate));
      return `<marker start="${t(assetStart[index] + local)}" duration="${t(length)}" value="${xml(marker.name)}"${marker.comment ? ` note="${xml(marker.comment)}"` : ""}/>`;
    })
    .join("");

  const totalFrames = layout.reduce((sum, item) => sum + item.frames, 0);
  const mainSpine = layout.map(({ clip, offset, frames }, index) => `<asset-clip ref="a${index + 1}" offset="${t(offset)}" name="${xml(clip.name)}" start="${t(assetStart[index])}" duration="${t(frames)}" tcFormat="NDF">${markerXml(index)}</asset-clip>`).join("");
  const projects = [
    `<project name="${xml("00_본편_Q&A마커")}"><sequence format="r1" duration="${t(totalFrames)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k"><spine>${mainSpine}</spine></sequence></project>`,
  ];

  plan.reels.forEach(({ reel, start, end }, index) => {
    const pieces = rangePieces(start, end, layout, rate);
    if (!pieces.length) return;
    let cursor = 0;
    const spine = pieces.map((piece, pieceIndex) => {
      const length = piece.outFrame - piece.inFrame;
      const hook = pieceIndex === 0 && reel.hook ? `<marker start="${t(assetStart[piece.index] + piece.inFrame)}" duration="${t(1)}" value="${xml(reel.hook)}"/>` : "";
      const item = `<asset-clip ref="a${piece.index + 1}" offset="${t(cursor)}" name="${xml(plan.clips[piece.index].name)}" start="${t(assetStart[piece.index] + piece.inFrame)}" duration="${t(length)}" tcFormat="NDF"><adjust-conform type="fill"/>${hook}</asset-clip>`;
      cursor += length;
      return item;
    }).join("");
    const name = `릴스${String(index + 1).padStart(2, "0")}_${"★".repeat(reel.score)}_${reel.title}`.slice(0, 70);
    projects.push(`<project name="${xml(name)}"><sequence format="r2" duration="${t(cursor)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k"><spine>${spine}</spine></sequence></project>`);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.10"><resources>${resources.join("")}</resources>`
    + `<library><event name="${xml(`포토클리닉 · ${plan.title}`)}">${projects.join("")}</event></library></fcpxml>\n`;
}

// ───────────────────────── 정리 자료 ─────────────────────────

export function buildMarkersCsv(markers: ExportMarker[], toTimecode: (seconds: number) => string): string {
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const label: Record<MarkerKind, string> = { qa: "Q&A", reel: "릴스", edit: "편집", cut: "컷 후보", compliance: "의료광고 주의" };
  const rows = [["구분", "시작TC", "끝TC", "길이(초)", "이름", "메모"]];
  for (const marker of markers) rows.push([label[marker.kind], toTimecode(marker.start), toTimecode(marker.end), (marker.end - marker.start).toFixed(1), marker.name, marker.comment]);
  return `﻿${rows.map((row) => row.map(cell).join(",")).join("\r\n")}`;
}
