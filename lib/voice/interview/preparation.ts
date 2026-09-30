import {
  DOCTOR_BRAND_INTERVIEW_TEMPLATE_KEY,
  DOCTOR_BRAND_INTERVIEW_TEMPLATE_VERSION,
  interviewQuestionById,
} from "@/lib/voice/interview/templates";
import type { InterviewQuestionSnapshot } from "@/lib/voice/interview/types";

export function buildInterviewQuestionSnapshot(questionIds: string[]): InterviewQuestionSnapshot[] {
  const seen = new Set<string>();
  const snapshot: InterviewQuestionSnapshot[] = [];
  for (const id of questionIds) {
    if (seen.has(id)) continue;
    const question = interviewQuestionById(id);
    if (!question) throw new Error(`알 수 없는 인터뷰 질문입니다: ${id}`);
    seen.add(id);
    snapshot.push({ ...question, order: snapshot.length });
  }
  return snapshot;
}

export function normalizeInterviewQuestionSnapshot(value: unknown): InterviewQuestionSnapshot[] {
  if (!Array.isArray(value)) return [];
  const ids = value.flatMap((entry) => (
    typeof entry === "string"
      ? [entry]
      : entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string"
        ? [(entry as { id: string }).id]
        : []
  ));
  return buildInterviewQuestionSnapshot(ids);
}

export function validateInterviewPreparation(input: {
  hospitalName: unknown;
  intervieweeName: unknown;
  selectedQuestions: unknown;
  templateKey?: unknown;
  templateVersion?: unknown;
}): { hospitalName: string; intervieweeName: string; selectedQuestions: InterviewQuestionSnapshot[] } {
  const hospitalName = typeof input.hospitalName === "string" ? input.hospitalName.trim() : "";
  const intervieweeName = typeof input.intervieweeName === "string" ? input.intervieweeName.trim() : "";
  if (!hospitalName) throw new Error("병원명을 입력해주세요.");
  if (!intervieweeName) throw new Error("인터뷰 대상을 입력해주세요.");
  if (input.templateKey !== undefined && input.templateKey !== DOCTOR_BRAND_INTERVIEW_TEMPLATE_KEY) {
    throw new Error("지원하지 않는 인터뷰 템플릿입니다.");
  }
  if (input.templateVersion !== undefined && input.templateVersion !== DOCTOR_BRAND_INTERVIEW_TEMPLATE_VERSION) {
    throw new Error("지원하지 않는 인터뷰 템플릿 버전입니다.");
  }
  const selectedQuestions = normalizeInterviewQuestionSnapshot(input.selectedQuestions);
  if (selectedQuestions.length === 0) throw new Error("인터뷰 질문을 한 개 이상 선택해주세요.");
  return { hospitalName, intervieweeName, selectedQuestions };
}

export function nextInterviewVersionNumber(versions: Array<{ version_no: unknown }>): number {
  let maximum = 0;
  for (const version of versions) {
    const number = typeof version.version_no === "number" ? version.version_no : 0;
    maximum = Math.max(maximum, Number.isFinite(number) ? Math.floor(number) : 0);
  }
  return maximum + 1;
}
