// 영상작업실 › 인터뷰 분석 — 클라이언트(UI)와 Mac Studio runner가 함께 쓰는 타입.
// 모든 시간은 "타임라인 초" 기준이다. 촬영 파일이 여러 개면 파일명 순서대로 이어 붙인
// 하나의 타임라인으로 보고, 각 클립의 timelineStart로 원본 파일 안의 위치를 역산한다.

export type FrameRate = {
  /** 타임코드 표기용 정수 프레임 (29.97 → 30) */
  timebase: number;
  /** 29.97/23.976/59.94 계열 여부 */
  ntsc: boolean;
  /** 실제 초당 프레임 수 (30000/1001 등) */
  fps: number;
};

export type InterviewClip = {
  index: number;
  name: string;
  /** SOURCE_ROOT 기준 상대 경로 */
  relativePath: string;
  /** Mac Studio에서의 절대 경로 (편집 맥 경로는 UI에서 prefix 치환) */
  absolutePath: string;
  durationSec: number;
  timelineStartSec: number;
  rate: FrameRate;
  width: number | null;
  height: number | null;
  sampleRate: number;
  channels: number;
  /** 카메라가 기록한 시작 타임코드 (예: 10:21:33:12). 없으면 null */
  startTimecode: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
};

export type InterviewWord = { w: string; s: number; e: number };

export type InterviewSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
  words: InterviewWord[];
  /** 원본(정규화 전) 음성 기준 평균 음량 dBFS. 마이크 찬 사람은 크고, 질문자는 작다. */
  levelDb: number | null;
  /** 전체 발화 중앙값보다 확연히 작은 목소리 → 마이크 없는 질문자 후보 */
  quiet: boolean;
  /** 바로 앞 발화와의 무음 간격(초) */
  pauseBefore: number;
  clipIndex: number;
  /** 이 문장부터 새 촬영 파일이 시작됨 */
  clipStartsHere: boolean;
};

export type InterviewContentType = "philosophy" | "doctor_story" | "supporters" | "etc";
export type BlogCategory = "monthly" | "hospital" | "doctor" | "note" | "branding" | "news";

export type QaBlock = {
  id: number;
  /** Q1, Q2 … */
  label: string;
  /** 질문 원문(들린 경우) 또는 답변으로 추정한 질문 */
  question: string;
  questionSource: "audio" | "inferred";
  questionStartSeg: number | null;
  answerStartSeg: number;
  answerEndSeg: number;
  /** 질문(있으면)부터 답변 끝까지 */
  start: number;
  end: number;
  answerStart: number;
  topic: string;
  summary: string;
  keyPoints: string[];
  bestQuote: string | null;
  /** 1~5, 영상·웹진에 쓸 만한 정도 */
  usefulness: number;
};

export type ReelSuggestion = {
  id: number;
  title: string;
  qaId: number | null;
  startSeg: number;
  endSeg: number;
  /** 말 사이 쉼에 맞춰 보정된 시간 */
  start: number;
  end: number;
  score: number;
  hook: string;
  reason: string;
  structure: string;
  caption: string;
  hashtags: string[];
  emphasis: string[];
};

export type EditIdeaType = "B-roll" | "인서트촬영" | "자막/그래픽" | "컷편집" | "음악/효과" | "화면전환" | "오프닝/엔딩";

export type EditIdea = { id: number; startSeg: number; endSeg: number; start: number; end: number; type: EditIdeaType; idea: string };
export type CutSuggestion = { id: number; startSeg: number; endSeg: number; start: number; end: number; reason: string };
export type ComplianceFlag = { id: number; seg: number; start: number; end: number; text: string; issue: string; suggestion: string };
export type InterviewQuote = { id: number; seg: number; start: number; end: number; text: string; use: string };

export type WebzineDraft = {
  headline: string;
  subhead: string;
  lead: string;
  sections: Array<{ heading: string; body: string; qaId: number | null }>;
  pullQuotes: string[];
  seoTitle: string;
  seoDescription: string;
};

export type InterviewAnalysis = {
  titleCandidates: string[];
  contentType: InterviewContentType;
  blogCategory: BlogCategory;
  oneLine: string;
  summary: string;
  keywords: string[];
  speakers: Array<{ label: string; description: string }>;
  qa: QaBlock[];
  quotes: InterviewQuote[];
  reels: ReelSuggestion[];
  editIdeas: EditIdea[];
  cuts: CutSuggestion[];
  compliance: ComplianceFlag[];
  webzine: WebzineDraft;
  /** Claude 응답이 불완전해 기계적 분리로 대체한 경우 true */
  qaFallback: boolean;
};

export type VideoInterviewResult = {
  ok: true;
  status: "VIDEO_INTERVIEW_ANALYZED";
  version: 1;
  title: string;
  context: string;
  createdAt: string;
  sourceRelativePath: string;
  /** Mac Studio의 SOURCE_ROOT 절대 경로 — 편집 맥 경로로 치환할 때 기준 */
  sourceAbsoluteRoot: string;
  outputRelativePath: string;
  durationSec: number;
  rate: FrameRate;
  width: number;
  height: number;
  clips: InterviewClip[];
  segments: InterviewSegment[];
  analysis: InterviewAnalysis;
  engine: { asr: string; asrModel: string; llm: string };
};

export type VideoAudioExtractResult = {
  ok: true;
  status: "VIDEO_AUDIO_EXTRACTED";
  sourceRelativePath: string;
  outputRelativePath: string;
  files: Array<{ clip: string; output: string; sizeBytes: number; durationSec: number }>;
};

export type VideoStudioRunnerFailure = { ok: false; status: string; error: string };

export type VideoStudioProgress = {
  stage: "probe" | "audio" | "transcribe" | "signals" | "analyze" | "write" | "extract" | "done";
  percent: number;
  message: string;
};

export const CONTENT_TYPE_LABEL: Record<InterviewContentType, string> = {
  philosophy: "촬영·브랜딩 철학",
  doctor_story: "원장/병원 스토리",
  supporters: "메디컬 서포터즈",
  etc: "기타",
};

export const BLOG_CATEGORY_LABEL: Record<BlogCategory, string> = {
  monthly: "월간호",
  hospital: "이달의 병원",
  doctor: "이달의 원장님",
  note: "촬영 노트",
  branding: "브랜딩이야기",
  news: "포토클리닉 뉴스",
};
