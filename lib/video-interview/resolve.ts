import { fallbackQaBlocks, round2, snapRange, type QaSkeleton } from "./signals";
import type {
  BlogCategory,
  ComplianceFlag,
  CutSuggestion,
  EditIdea,
  EditIdeaType,
  InterviewAnalysis,
  InterviewContentType,
  InterviewQuote,
  InterviewSegment,
  QaBlock,
  ReelSuggestion,
  WebzineDraft,
} from "./types";

type Json = Record<string, unknown>;

const CONTENT_TYPES: InterviewContentType[] = ["philosophy", "doctor_story", "supporters", "etc"];
const BLOG_CATEGORIES: BlogCategory[] = ["monthly", "hospital", "doctor", "note", "branding", "news"];
const EDIT_TYPES: EditIdeaType[] = ["B-roll", "인서트촬영", "자막/그래픽", "컷편집", "음악/효과", "화면전환", "오프닝/엔딩"];

const isRecord = (value: unknown): value is Json => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isRecord) : []);
const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value.trim() : fallback);
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []);
const int = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null);
const clampScore = (value: unknown, fallback = 3) => Math.max(1, Math.min(5, int(value) ?? fallback));

/**
 * Claude가 save_interview_analysis로 준 원시 결과를 검증된 분석 결과로 바꾼다.
 * 모든 시간은 문장 번호에서 계산하므로, 모델이 시간을 지어낼 수 없다.
 */
export function resolveInterviewAnalysis(raw: unknown, segments: InterviewSegment[], durationSec: number): InterviewAnalysis {
  const input = isRecord(raw) ? raw : {};
  const last = segments.length - 1;
  const clampSeg = (value: unknown): number | null => {
    const index = int(value);
    if (index === null || last < 0) return null;
    return Math.max(0, Math.min(last, index));
  };
  const range = (item: Json, startKey = "start_seg", endKey = "end_seg") => {
    const a = clampSeg(item[startKey]);
    if (a === null) return null;
    const b = clampSeg(item[endKey]) ?? a;
    return { startSeg: Math.min(a, b), endSeg: Math.max(a, b) };
  };
  const timeOf = (startSeg: number, endSeg: number) => ({ start: segments[startSeg].start, end: segments[endSeg].end });

  // ── Q&A
  const qaRaw = list(input.qa_blocks);
  const skeletons: Array<QaSkeleton & { item: Json | null }> = [];
  for (const item of qaRaw) {
    const answerStart = clampSeg(item.answer_start_seg);
    const answerEnd = clampSeg(item.answer_end_seg);
    if (answerStart === null || answerEnd === null || answerEnd < answerStart) continue;
    const questionStart = item.question_start_seg === null ? null : clampSeg(item.question_start_seg);
    skeletons.push({
      questionStartSeg: questionStart !== null && questionStart <= answerStart ? questionStart : null,
      answerStartSeg: answerStart,
      answerEndSeg: answerEnd,
      item,
    });
  }
  skeletons.sort((a, b) => a.answerStartSeg - b.answerStartSeg);
  // 겹침 제거: 다음 블록이 시작되기 전에서 끝낸다.
  const cleaned: typeof skeletons = [];
  for (const block of skeletons) {
    const previous = cleaned[cleaned.length - 1];
    const blockStart = block.questionStartSeg ?? block.answerStartSeg;
    if (previous) {
      if (blockStart <= previous.answerEndSeg) previous.answerEndSeg = Math.max(previous.answerStartSeg, blockStart - 1);
      if (block.answerStartSeg <= previous.answerEndSeg) continue;
    }
    cleaned.push(block);
  }
  const qaFallback = cleaned.length === 0 && segments.length > 0;
  const finalSkeletons = qaFallback ? fallbackQaBlocks(segments).map((block) => ({ ...block, item: null })) : cleaned;
  const qa: QaBlock[] = finalSkeletons.map((block, index) => {
    const item = block.item ?? {};
    const firstSeg = block.questionStartSeg ?? block.answerStartSeg;
    const questionText = text(item.question)
      || (block.questionStartSeg !== null
        ? segments.slice(block.questionStartSeg, block.answerStartSeg).map((s) => s.text).join(" ")
        : "");
    return {
      id: index,
      label: `Q${index + 1}`,
      question: questionText || "(질문 미확인)",
      questionSource: block.questionStartSeg !== null && item.question_heard !== false ? "audio" : "inferred",
      questionStartSeg: block.questionStartSeg,
      answerStartSeg: block.answerStartSeg,
      answerEndSeg: block.answerEndSeg,
      start: segments[firstSeg].start,
      end: segments[block.answerEndSeg].end,
      answerStart: segments[block.answerStartSeg].start,
      topic: text(item.topic) || `질문 ${index + 1}`,
      summary: text(item.summary),
      keyPoints: texts(item.key_points),
      bestQuote: text(item.best_quote) || null,
      usefulness: clampScore(item.usefulness),
    };
  });
  const qaIndex = (value: unknown): number | null => {
    const index = int(value);
    return index !== null && index >= 0 && index < qa.length ? index : null;
  };
  const qaAt = (seconds: number): number | null => qa.find((block) => seconds >= block.start && seconds < block.end)?.id ?? null;

  // ── 릴스: 말 사이 쉼에 맞춰 시작/끝 보정
  const reels: ReelSuggestion[] = list(input.reels).flatMap((item) => {
    const r = range(item);
    if (!r) return [];
    const snapped = snapRange(segments, r.startSeg, r.endSeg, durationSec);
    return [{
      id: 0,
      title: text(item.title) || "릴스 후보",
      qaId: qaIndex(item.qa_index) ?? qaAt(snapped.start),
      startSeg: r.startSeg,
      endSeg: r.endSeg,
      start: snapped.start,
      end: snapped.end,
      score: clampScore(item.score),
      hook: text(item.hook_text),
      reason: text(item.reason),
      structure: text(item.structure),
      caption: text(item.caption),
      hashtags: texts(item.hashtags).map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)),
      emphasis: texts(item.subtitle_emphasis),
    }];
  }).sort((a, b) => b.score - a.score || a.start - b.start).map((reel, id) => ({ ...reel, id }));

  const editIdeas: EditIdea[] = list(input.edit_ideas).flatMap((item) => {
    const r = range(item);
    if (!r) return [];
    const type = EDIT_TYPES.includes(item.type as EditIdeaType) ? (item.type as EditIdeaType) : "B-roll";
    return [{ id: 0, ...r, ...timeOf(r.startSeg, r.endSeg), type, idea: text(item.idea) }];
  }).sort((a, b) => a.start - b.start).map((idea, id) => ({ ...idea, id }));

  const cuts: CutSuggestion[] = list(input.cut_suggestions).flatMap((item) => {
    const r = range(item);
    return r ? [{ id: 0, ...r, ...timeOf(r.startSeg, r.endSeg), reason: text(item.reason) }] : [];
  }).sort((a, b) => a.start - b.start).map((cut, id) => ({ ...cut, id }));

  const compliance: ComplianceFlag[] = list(input.compliance_flags).flatMap((item) => {
    const index = clampSeg(item.seg);
    if (index === null) return [];
    return [{ id: 0, seg: index, ...timeOf(index, index), text: text(item.text), issue: text(item.issue), suggestion: text(item.suggestion) }];
  }).sort((a, b) => a.start - b.start).map((flag, id) => ({ ...flag, id }));

  const quotes: InterviewQuote[] = list(input.quotes).flatMap((item) => {
    const index = clampSeg(item.seg);
    if (index === null) return [];
    return [{ id: 0, seg: index, ...timeOf(index, index), text: text(item.text), use: text(item.use) }];
  }).sort((a, b) => a.start - b.start).map((quote, id) => ({ ...quote, id }));

  const webzineInput = isRecord(input.webzine) ? input.webzine : {};
  const webzine: WebzineDraft = {
    headline: text(webzineInput.headline),
    subhead: text(webzineInput.subhead),
    lead: text(webzineInput.lead),
    sections: list(webzineInput.sections).map((section) => ({
      heading: text(section.heading),
      body: text(section.body),
      qaId: qaIndex(section.qa_index),
    })).filter((section) => section.heading || section.body),
    pullQuotes: texts(webzineInput.pull_quotes),
    seoTitle: text(webzineInput.seo_title),
    seoDescription: text(webzineInput.seo_description),
  };

  return {
    titleCandidates: texts(input.title_candidates),
    contentType: CONTENT_TYPES.includes(input.content_type as InterviewContentType) ? (input.content_type as InterviewContentType) : "etc",
    blogCategory: BLOG_CATEGORIES.includes(input.blog_category as BlogCategory) ? (input.blog_category as BlogCategory) : "news",
    oneLine: text(input.one_line),
    summary: text(input.summary),
    keywords: texts(input.keywords),
    speakers: list(input.speakers).map((speaker) => ({ label: text(speaker.label), description: text(speaker.description) })),
    qa,
    quotes,
    reels,
    editIdeas,
    cuts,
    compliance,
    webzine,
    qaFallback,
  };
}

/** UI에서 릴스 구간을 다듬을 때(±초) 타임라인 범위 안으로 제한 */
export function adjustRange(start: number, end: number, deltaStart: number, deltaEnd: number, durationSec: number) {
  const nextStart = Math.max(0, Math.min(durationSec, start + deltaStart));
  const nextEnd = Math.max(nextStart + 0.5, Math.min(durationSec, end + deltaEnd));
  return { start: round2(nextStart), end: round2(nextEnd) };
}
