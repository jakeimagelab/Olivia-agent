export type InterviewQuestionType = "brand" | "feedback";

export type InterviewQuestion = {
  id: string;
  number: number;
  sectionId: string;
  sectionTitle: string;
  text: string;
  type: InterviewQuestionType;
};

export type InterviewQuestionSnapshot = InterviewQuestion & {
  order: number;
};

export type InterviewPreparationStatus = "draft" | "ready" | "recording" | "completed" | "canceled";

export type InterviewPreparation = {
  id: string;
  client_id: string | null;
  workflow_run_id: string | null;
  hospital_name: string;
  interviewee_name: string;
  interview_date: string | null;
  template_key: string;
  template_version: number;
  selected_questions: InterviewQuestionSnapshot[];
  status: InterviewPreparationStatus;
  revision: number;
  current_version_id: string | null;
  recording_id: string | null;
  ready_error?: string | null;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
  completed_at: string | null;
};

export type InterviewPreparationVersion = {
  id: string;
  preparation_id: string;
  version_no: number;
  hospital_name: string;
  interviewee_name: string;
  interview_date: string | null;
  template_key: string;
  template_version: number;
  selected_questions: InterviewQuestionSnapshot[];
  pdf_storage_path: string | null;
  pdf_created_at: string | null;
  created_at: string;
};

export type InterviewMarker = {
  eventId: string;
  questionId: string;
  atSeconds: number;
};

export type InterviewHighlight = {
  eventId: string;
  questionId: string;
  atSeconds: number;
};

export type InterviewFieldNote = {
  eventId: string;
  questionId: string;
  atSeconds: number;
  text: string;
};

export type InterviewFollowUp = {
  eventId: string;
  questionId: string;
  atSeconds: number;
  text: string;
};

export type InterviewAudioChunk = {
  sequence: number;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  startSeconds: number;
  endSeconds: number;
  status: "uploading" | "uploaded" | "failed";
  checksum?: string | null;
};

export type InterviewRecoveryState = {
  version: 1;
  preparationId: string;
  versionId: string;
  recordingId: string;
  mode: "interview";
  currentChunk: number;
  uploadedSequences: number[];
  selectedQuestions: InterviewQuestionSnapshot[];
  questionMarkers: InterviewMarker[];
  highlightMarkers: InterviewHighlight[];
  fieldNotes: InterviewFieldNote[];
  followUps: InterviewFollowUp[];
  updatedAt: string;
};

export type InterviewQuestionAnswer = {
  question: InterviewQuestionSnapshot;
  startSeconds: number;
  endSeconds: number;
  transcript: string;
};

export type InterviewBrandResult = {
  brand_summary: string;
  brand_core: Record<string, string>;
  brand_keywords: string[];
  question_answers: Array<{
    question_id: string;
    answer_summary: string;
    key_quotes: string[];
  }>;
  photoclinic_feedback: string[];
};
