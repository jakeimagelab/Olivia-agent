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
  const markerByQuestion = new Map<string, InterviewMarker>();
  for (const marker of input.markers) {
    if (!markerByQuestion.has(marker.questionId) && Number.isFinite(marker.atSeconds)) {
      markerByQuestion.set(marker.questionId, marker);
    }
  }
  const ordered = [...input.selectedQuestions].sort((left, right) => left.order - right.order);
  return ordered.flatMap((question, index) => {
    const marker = markerByQuestion.get(question.id);
    if (!marker) return [{ question, startSeconds: 0, endSeconds: 0, transcript: "" }];
    const startSeconds = clampTime(marker.atSeconds, duration);
    const next = ordered.slice(index + 1)
      .map((candidate) => markerByQuestion.get(candidate.id))
      .find((candidate): candidate is InterviewMarker => Boolean(candidate));
    const endSeconds = next ? Math.max(startSeconds, clampTime(next.atSeconds, duration)) : duration;
    const transcript = input.transcriptSegments
      .filter((segment) => segment.end > startSeconds && segment.start < endSeconds)
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join("\n");
    return [{ question, startSeconds, endSeconds, transcript }];
  });
}
