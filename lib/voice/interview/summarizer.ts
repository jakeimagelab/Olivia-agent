import { runHermesChat } from "@/lib/hermes/client";
import { groupTranscriptByQuestion } from "@/lib/voice/interview/groupTranscript";
import type { TranscriptSegment } from "@/lib/voice/types";
import type { InterviewBrandResult, InterviewMarker, InterviewQuestionSnapshot } from "@/lib/voice/interview/types";

const INTERVIEW_SUMMARY_TIMEOUT_MS = 60_000;
const INTERVIEW_TRANSCRIPT_MAX_CHARACTERS = 140_000;

type RawInterviewResult = Partial<InterviewBrandResult>;

function stringList(value: unknown, limit = 30) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean).slice(0, limit) : [];
}

function parseResult(value: string): RawInterviewResult {
  const clean = value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("인터뷰 정리 JSON을 읽지 못했습니다.");
  return JSON.parse(clean.slice(start, end + 1)) as RawInterviewResult;
}

function normalizeInterviewResult(input: RawInterviewResult, questions: InterviewQuestionSnapshot[], transcript: string): InterviewBrandResult {
  const sourceAnswers = Array.isArray(input.question_answers) ? input.question_answers : [];
  const sourceByQuestion = new Map(sourceAnswers.flatMap((answer) => (
    answer && typeof answer === "object" && typeof (answer as { question_id?: unknown }).question_id === "string"
      ? [[(answer as { question_id: string; answer_summary?: unknown; key_quotes?: unknown }).question_id, answer as { answer_summary?: unknown; key_quotes?: unknown }] as const]
      : []
  )));
  const brandCore = input.brand_core && typeof input.brand_core === "object" && !Array.isArray(input.brand_core)
    ? Object.fromEntries(Object.entries(input.brand_core).flatMap(([key, value]) => typeof value === "string" ? [[key, value.trim()]] : [])) : {};
  return {
    brand_summary: typeof input.brand_summary === "string" ? input.brand_summary.trim() : "",
    brand_core: brandCore,
    brand_keywords: stringList(input.brand_keywords),
    question_answers: questions.map((question) => {
      const answer = sourceByQuestion.get(question.id);
      const quotes = stringList(answer?.key_quotes, 8).filter((quote) => transcript.includes(quote));
      return {
        question_id: question.id,
        answer_summary: typeof answer?.answer_summary === "string" ? answer.answer_summary.trim() : "",
        key_quotes: quotes,
      };
    }),
    photoclinic_feedback: stringList(input.photoclinic_feedback),
  };
}

function interviewPrompt(questions: InterviewQuestionSnapshot[], transcript: string) {
  return `인터뷰 전사문을 질문별로 정리한다. 원문에 없는 사실, 답변, 인용문을 절대 만들지 않는다.
답하지 않은 질문의 answer_summary는 빈 문자열, key_quotes는 빈 배열이어야 한다.
key_quotes는 반드시 전사문에 실제로 있는 연속 문장을 그대로 복사한다. 문장을 멋있게 다시 쓰지 않는다.
이 작업은 읽기 전용이며 다른 Olivia 데이터나 도구를 변경하지 않는다.

반드시 JSON 하나만 출력한다.
{
  "brand_summary":"",
  "brand_core":{"start_direction":"","patient_experience":"","our_way":"","team_culture":"","trust_memory":"","future_philosophy":""},
  "brand_keywords":[],
  "question_answers":[{"question_id":"q01","answer_summary":"","key_quotes":[]}],
  "photoclinic_feedback":[]
}

[선택 질문]
${questions.map((question) => `${question.id}. ${question.text}`).join("\n")}

[전사문]
${transcript.slice(0, INTERVIEW_TRANSCRIPT_MAX_CHARACTERS)}`;
}

export async function summarizeInterviewRecording(input: {
  recordingId: string;
  selectedQuestions: InterviewQuestionSnapshot[];
  markers: InterviewMarker[];
  transcriptSegments: TranscriptSegment[];
  durationSeconds: number;
}): Promise<{ result: InterviewBrandResult; questionGroups: ReturnType<typeof groupTranscriptByQuestion> }> {
  const questionGroups = groupTranscriptByQuestion({
    selectedQuestions: input.selectedQuestions,
    markers: input.markers,
    transcriptSegments: input.transcriptSegments,
    durationSeconds: input.durationSeconds,
  });
  const transcript = questionGroups.map((group) => `[${group.question.id}]\n${group.transcript}`).join("\n\n");
  if (!transcript.trim()) return { result: normalizeInterviewResult({}, input.selectedQuestions, ""), questionGroups };
  const hermes = await runHermesChat({
    conversationId: `voice-interview:${input.recordingId}`,
    message: interviewPrompt(input.selectedQuestions, transcript),
    signal: AbortSignal.timeout(INTERVIEW_SUMMARY_TIMEOUT_MS),
    context: { recentActions: [], revision: 0, activeWorkspace: "voice-interview", canEdit: false, canFinalize: false },
  });
  if (hermes.toolCalls.length > 0) throw new Error("인터뷰 정리 과정에서 허용되지 않은 도구 호출이 감지됐습니다.");
  return { result: normalizeInterviewResult(parseResult(hermes.message), input.selectedQuestions, transcript), questionGroups };
}
