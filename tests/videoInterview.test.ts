import { describe, expect, it } from "vitest";
import { annotateSegments, candidateBoundaries, fallbackQaBlocks, snapRange } from "@/lib/video-interview/signals";
import { resolveInterviewAnalysis } from "@/lib/video-interview/resolve";
import { buildFcpxml, buildMarkers, buildPremiereXml, createPathMapper } from "@/lib/video-interview/exporters";
import { buildSrt, splitForSubtitle } from "@/lib/video-interview/srt";
import { fpsToRate, locateInClip, secondsToTimecode } from "@/lib/video-interview/timecode";
import { parseFfmpegProbe, compareNatural } from "@/lib/video-interview/node/media";
import type { InterviewClip } from "@/lib/video-interview/types";

const rate = fpsToRate(29.97);
const clip = (index: number, start: number, duration: number): InterviewClip => ({
  index, name: `C000${index + 1}.MP4`, relativePath: `촬영/C000${index + 1}.MP4`, absolutePath: `/Volumes/SSD/촬영/C000${index + 1}.MP4`,
  durationSec: duration, timelineStartSec: start, rate, width: 1920, height: 1080, sampleRate: 48000, channels: 2,
  startTimecode: null, hasVideo: true, hasAudio: true,
});
const clips = [clip(0, 0, 60), clip(1, 60, 60)];

// 질문(작은 목소리) → 답변 → 쉼 → 파일 바뀐 뒤 질문 → 답변
const raw = [
  { start: 1, end: 3, text: "원장님 개원하실 때 어떠셨어요?", levelDb: -42 },
  { start: 3.5, end: 9, text: "처음엔 정말 막막했어요.", levelDb: -20 },
  { start: 9.2, end: 20, text: "그래도 환자분들 덕분에 버텼습니다.", levelDb: -21 },
  { start: 20.3, end: 30, text: "지금 생각하면 다 감사한 일이죠.", levelDb: -19 },
  { start: 61, end: 63, text: "사진 촬영은 어떠셨어요?", levelDb: -41 },
  { start: 63.4, end: 80, text: "질문을 받으면서 병원 방향이 정리됐어요.", levelDb: -20 },
  { start: 80.2, end: 95, text: "사진 한 장이 첫인상이잖아요.", levelDb: -22 },
];

describe("video interview signals", () => {
  const segments = annotateSegments(raw, clips);

  it("marks quiet questioner lines, pauses and clip changes", () => {
    expect(segments.map((segment) => segment.quiet)).toEqual([true, false, false, false, true, false, false]);
    expect(segments[4].clipStartsHere).toBe(true);
    expect(segments[4].clipIndex).toBe(1);
    expect(segments[4].pauseBefore).toBeCloseTo(31, 0);
  });

  it("finds question boundaries and builds fallback Q&A", () => {
    expect(candidateBoundaries(segments)).toContain(4);
    const blocks = fallbackQaBlocks(segments);
    expect(blocks).toEqual([
      { questionStartSeg: 0, answerStartSeg: 1, answerEndSeg: 3 },
      { questionStartSeg: 4, answerStartSeg: 5, answerEndSeg: 6 },
    ]);
  });

  it("snaps a range to the pauses around speech", () => {
    const snapped = snapRange(segments, 5, 6, 120);
    expect(snapped.start).toBeGreaterThan(63);
    expect(snapped.start).toBeLessThan(63.4);
    expect(snapped.end).toBeGreaterThan(95);
    expect(snapped.end).toBeLessThanOrEqual(95.4);
  });

  it("resolves model output into timed, non-overlapping blocks", () => {
    const analysis = resolveInterviewAnalysis({
      title_candidates: ["사진 한 장의 힘"],
      content_type: "doctor_story",
      blog_category: "doctor",
      qa_blocks: [
        { question_start_seg: 4, answer_start_seg: 5, answer_end_seg: 6, question: "사진 촬영은 어떠셨어요?", question_heard: true, topic: "촬영 경험", summary: "", usefulness: 5 },
        { question_start_seg: 0, answer_start_seg: 1, answer_end_seg: 5, question: "개원", question_heard: true, topic: "개원 이야기", summary: "", usefulness: 4 },
      ],
      reels: [{ title: "첫인상", start_seg: 5, end_seg: 99, score: 5, hook_text: "사진 = 첫인상", reason: "" }],
      compliance_flags: [{ seg: 2, text: "x", issue: "최상급", suggestion: "y" }],
      webzine: { headline: "h", lead: "l", sections: [{ heading: "s", body: "b", qa_index: 7 }] },
    }, segments, 120);
    expect(analysis.qa.map((block) => [block.label, block.answerStartSeg, block.answerEndSeg])).toEqual([["Q1", 1, 3], ["Q2", 5, 6]]);
    expect(analysis.qa[1].start).toBe(61);
    expect(analysis.reels[0].endSeg).toBe(6);
    expect(analysis.reels[0].qaId).toBe(1);
    expect(analysis.webzine.sections[0].qaId).toBeNull();
    expect(analysis.compliance[0].start).toBe(9.2);
    expect(analysis.qaFallback).toBe(false);
  });

  it("falls back to signal-based Q&A when the model returns nothing usable", () => {
    const analysis = resolveInterviewAnalysis({ qa_blocks: [{ answer_start_seg: "x" }] }, segments, 120);
    expect(analysis.qaFallback).toBe(true);
    expect(analysis.qa).toHaveLength(2);
    expect(analysis.qa[0].question).toContain("개원");
  });
});

describe("video interview exports", () => {
  const segments = annotateSegments(raw, clips);
  const analysis = resolveInterviewAnalysis({
    qa_blocks: [{ question_start_seg: 4, answer_start_seg: 5, answer_end_seg: 6, question: "Q & <A>", question_heard: true, topic: "촬영 & 브랜딩", summary: "요약", usefulness: 5 }],
    reels: [{ title: "경계 넘는 릴스", start_seg: 3, end_seg: 5, score: 4, hook_text: "훅", reason: "이유" }],
  }, segments, 120);
  const reels = analysis.reels.map((reel) => ({ reel, start: reel.start, end: reel.end }));
  const plan = {
    title: "테스트",
    clips,
    rate,
    width: 1920,
    height: 1080,
    markers: buildMarkers(analysis, reels, { edits: true, cuts: true, compliance: true }),
    reels,
    mapPath: createPathMapper("/Volumes/SSD", "/Volumes/NAS-편집"),
  };

  it("builds premiere xml with escaped markers, mapped paths and a split reel", () => {
    const xml = buildPremiereXml(plan);
    expect(xml).toContain("<name>Q1. 촬영 &amp; 브랜딩</name>");
    expect(xml).toContain("file://localhost/Volumes/NAS-%ED%8E%B8%EC%A7%91/");
    expect(xml.match(/<sequence /g)).toHaveLength(2);
    // 릴스가 두 클립에 걸쳐 있으므로 세로 시퀀스에 비디오 조각이 2개
    const reelSequence = xml.slice(xml.lastIndexOf("<sequence "));
    expect(reelSequence.match(/<clipitem id="clipitem-\d+"><name>C000\d\.MP4<\/name><enabled>TRUE<\/enabled><duration>\d+<\/duration><rate>[^]*?<\/rate><start>\d+<\/start>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(reelSequence).toContain("<width>1080</width><height>1920</height>");
    expect(reelSequence).toContain("<value>177.78</value>");
  });

  it("builds fcpxml with rational times and fill-conformed vertical projects", () => {
    const xml = buildFcpxml(plan);
    expect(xml).toContain('frameDuration="1001/30000s"');
    expect(xml).toContain('name="FFVideoFormat1080p2997"');
    expect(xml).toContain('<adjust-conform type="fill"/>');
    expect(xml).not.toMatch(/="NaN|undefined/);
  });

  it("splits long subtitles into balanced lines", () => {
    const long = { ...segments[1], text: "그래서 저희 병원은 환자분이 무서워하지 않는 치과를 만들고 싶었고 그 마음을 사진에 담고 싶었습니다", start: 0, end: 10, words: [] };
    const pieces = splitForSubtitle(long);
    expect(pieces.length).toBe(2);
    expect(Math.abs(pieces[0].text.length - pieces[1].text.length)).toBeLessThan(12);
    expect(buildSrt(segments, { start: 60, end: 70 })).toContain("00:00:01,000 --> 00:00:03,000");
  });
});

describe("video interview helpers", () => {
  it("formats timecode and locates clips", () => {
    expect(secondsToTimecode(61.5, rate)).toBe("00:01:01:13");
    expect(locateInClip(75, clips)).toEqual({ clipName: "C0002.MP4", offsetSec: 15 });
  });

  it("parses ffmpeg probe output and sorts camera files naturally", () => {
    const info = parseFfmpegProbe(`  Duration: 00:12:03.52, start: 0.000000, bitrate: 100000 kb/s
  Stream #0:0: Video: h264 (High), yuv420p, 3840x2160, 100000 kb/s, 29.97 fps, 29.97 tbr
      timecode        : 10:21:33:12
  Stream #0:1: Audio: aac (LC), 48000 Hz, stereo, fltp, 192 kb/s`);
    expect(info).toMatchObject({ durationSec: 723.52, width: 3840, height: 2160, fps: 29.97, hasAudio: true, channels: 2, startTimecode: "10:21:33:12" });
    expect(["C0010.MP4", "C0002.MP4", "C0001.MP4"].sort(compareNatural)).toEqual(["C0001.MP4", "C0002.MP4", "C0010.MP4"]);
  });
});
