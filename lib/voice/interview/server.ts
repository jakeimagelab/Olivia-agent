import { isUuid } from "@/lib/voice/config";
import { buildInterviewQuestionSnapshot } from "@/lib/voice/interview/preparation";
import type { InterviewPreparation, InterviewPreparationVersion } from "@/lib/voice/interview/types";

export const VOICE_INTERVIEW_DOCUMENTS_BUCKET = "voice-interview-documents";

export function optionalUuid(value: unknown): string | null {
  return isUuid(value) ? value : null;
}

export function optionalDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function draftInterviewPreparationInput(input: Record<string, unknown>) {
  const hospitalName = typeof input.hospitalName === "string" ? input.hospitalName.trim().slice(0, 200) : "";
  const intervieweeName = typeof input.intervieweeName === "string" ? input.intervieweeName.trim().slice(0, 200) : "";
  const rawQuestions = Array.isArray(input.selectedQuestions) ? input.selectedQuestions : [];
  const ids = rawQuestions.flatMap((entry) => typeof entry === "string"
    ? [entry]
    : entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string"
      ? [(entry as { id: string }).id]
      : []);
  return {
    client_id: optionalUuid(input.clientId),
    workflow_run_id: optionalUuid(input.workflowRunId),
    hospital_name: hospitalName,
    interviewee_name: intervieweeName,
    interview_date: optionalDate(input.interviewDate),
    selected_questions: buildInterviewQuestionSnapshot(ids),
  };
}

export function asPreparation(value: unknown): InterviewPreparation {
  return value as InterviewPreparation;
}

export function asPreparationVersion(value: unknown): InterviewPreparationVersion {
  return value as InterviewPreparationVersion;
}

export function interviewVersionStoragePath(preparationId: string, versionNo: number) {
  return `${preparationId}/version-${String(versionNo).padStart(3, "0")}/interview-questions.pdf`;
}
