import type { TranscriptSegment } from "@/lib/voice/types";
import type { InterviewMarker, InterviewQuestionAnswer, InterviewQuestionSnapshot } from "@/lib/voice/interview/types";

function clampTime(value: number, durationSeconds: number) {
  return Math.max(0, Math.min(durationSeconds, value));
}

export function groupTranscriptByQuestion(input: {
  selectedQuestions: InterviewQuestionSnapshot[];
  markers: InterviewMarker[];
  transcriptSegments: TranscriptSegment[];
  durationSeconds: number;
}): InterviewQuestionAnswer[] {
  const duration = Math.max(0, input.durationSeconds);
  const questionById = new Map(input.selectedQuestions.map((question) => [question.id, question]));
  // Event time, not questionnaire order, is the recording timeline. Repeated
  // question markers deliberately produce separate answer segments.
  const markers = input.markers
    .filter((marker) => questionById.has(marker.questionId) && Number.isFinite(marker.atSeconds) && marker.atSeconds >= 0)
    .map((marker, index) => ({ marker, index }))
    .sort((left, right) => left.marker.atSeconds - right.marker.atSeconds
      || (left.marker.clientSequence ?? left.index) - (right.marker.clientSequence ?? right.index)
      || left.index - right.index)
    .map(({ marker }) => marker);
  return markers.flatMap((marker, index) => {
    const question = questionById.get(marker.questionId);
    if (!question) return [];
    const startSeconds = clampTime(marker.atSeconds, duration);
    const next = markers[index + 1];
    const endSeconds = next ? Math.max(startSeconds, clampTime(next.atSeconds, duration)) : duration;
    const transcript = input.transcriptSegments
      .filter((segment) => segment.end > startSeconds && segment.start < endSeconds)
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join("\n");
    return [{ question, startSeconds, endSeconds, transcript }];
  });
}
